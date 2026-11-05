import gzip
import pytest
from sqlalchemy import select
from backend.app.analytics import metrics
from backend.app.evaluations.engine import heuristic
from backend.app.ingestion.otlp import ingest
from backend.app.models.entities import Evaluation, Insight, ModelPricing, Span, Trace
from backend.app.services.demo import execute
from backend.app.services.experiments import run_experiment
from backend.app.services.insights import generate


def payload(trace=1, span=1, parent=None, source='collected', name='execution', kind='llm', duration=10, extra=None):
    attrs = {'opspilot.source': source, 'opspilot.kind': kind, 'gen_ai.request.model': 'mock-support-v1', **(extra or {})}
    def attr(k, v):
        key = 'intValue' if isinstance(v, int) else 'stringValue'
        return {'key': k, 'value': {key: str(v) if isinstance(v, int) else v}}
    return {'resourceSpans': [{'scopeSpans': [{'spans': [{
        'traceId': f'{trace:032x}', 'spanId': f'{span:016x}', 'parentSpanId': f'{parent:016x}' if parent else '',
        'name': name, 'startTimeUnixNano': '1700000000000000000',
        'endTimeUnixNano': str(1700000000000000000 + duration * 1_000_000),
        'attributes': [attr(k, v) for k, v in attrs.items()]}]}]}]}


def test_out_of_order_and_idempotency(db):
    ingest(db, payload(span=2, parent=1, extra={'gen_ai.usage.input_tokens': 100, 'gen_ai.usage.output_tokens': 20}))
    ingest(db, payload(kind='agent'))
    ingest(db, payload(span=2, parent=1))
    spans = list(db.scalars(select(Span)))
    assert len(spans) == 2
    assert next(s for s in spans if s.span_id.endswith('2')).parent_id == '0000000000000001'
    assert db.get(Trace, '0' * 31 + '1').name == 'execution'


def test_cost_snapshot_missing_usage_and_source_isolation(db):
    ingest(db, payload(extra={'gen_ai.usage.input_tokens': 1_000_000, 'gen_ai.usage.output_tokens': 2_000_000, 'opspilot.provider_cost_usd': '1.10'}))
    span = db.scalar(select(Span))
    assert abs(span.estimated_cost - 1.35) < 1e-9
    assert span.provider_cost == 1.10
    db.add(ModelPricing(model_id='mock-support-v1', input_per_million=10, output_per_million=20))
    db.commit()
    ingest(db, payload())
    assert span.estimated_cost == 1.35
    ingest(db, payload(trace=2, source='demo'))
    assert metrics.overview(db, 'collected')['total_traces'] == 1
    assert metrics.overview(db, 'demo')['total_tokens'] is None


def test_nested_usage_is_not_double_counted(db):
    usage = {'gen_ai.usage.input_tokens': 100, 'gen_ai.usage.output_tokens': 20}
    ingest(db, payload(kind='agent', extra=usage))
    ingest(db, payload(span=2, parent=1, extra=usage))
    assert metrics.overview(db, 'collected')['total_tokens'] == 120


def test_latency_and_percentile_minimum_samples(db):
    for i in range(1, 26):
        ingest(db, payload(trace=i, duration=i * 10))
    data = metrics.performance(db, 'collected')
    assert data['p50_ms'] == 130
    assert data['p95_ms'] == pytest.approx(238)
    assert data['p99_ms'] is None
    assert sum(b['count'] for b in data['distribution']) == 25


def test_heuristics_are_explicit_and_reference_optional():
    scores, explanation = heuristic('refund policy', 'refund within 30 days', 'refund within 30 days', 'refund within 30 days')
    assert scores['faithfulness'] == 1
    assert scores['correctness'] == 1
    assert 'not definitive' in explanation['hallucination_indicator']
    scores, _ = heuristic('refund', 'moon rockets', '')
    assert scores['faithfulness'] is None and scores['correctness'] is None
    assert scores['answer_relevance'] == 0


def test_demo_workflow_preserves_failure_and_repeated_tools(db):
    result = execute(db, scenario='failed_tool')
    trace = db.get(Trace, result['trace_id'])
    assert trace.status == 'error' and trace.source == 'demo'
    assert any(s.events for s in db.scalars(select(Span).where(Span.trace_id == trace.id, Span.status == 'error')))
    repeated = execute(db, scenario='repeated_tool')
    assert db.scalar(select(Insight).where(Insight.trace_id == repeated['trace_id'], Insight.rule.like('repeat:%')))
    count = len(list(db.scalars(select(Insight))))
    assert generate(db, 'demo') == 0
    assert len(list(db.scalars(select(Insight)))) == count


def test_low_quality_evaluation_and_insight(db):
    result = execute(db, scenario='low_quality')
    evaluation = db.scalar(select(Evaluation).where(Evaluation.trace_id == result['trace_id']))
    assert evaluation.method == 'heuristic'
    assert evaluation.scores['faithfulness'] < .5
    assert db.scalar(select(Insight).where(Insight.trace_id == result['trace_id'], Insight.rule == 'weak_support'))


def test_paired_experiment_measures_runs(db):
    report = run_experiment(db, 'test', 1, [1, 2])
    assert report['paired'] is True
    assert [v['runs'] for v in report['versions']] == [4, 4]
    assert all(v['latency_ms'] > 0 for v in report['versions'])
    assert report['versions'][1]['tokens'] < report['versions'][0]['tokens']
    assert report['versions'][0]['faithfulness'] == report['versions'][1]['faithfulness']


def test_json_otlp_validation_and_filters(client):
    response = client.post('/api/otlp/v1/traces', json=payload())
    assert response.status_code == 200
    bad = payload(trace=2)
    bad['resourceSpans'][0]['scopeSpans'][0]['spans'][0]['traceId'] = 'invalid'
    partial = client.post('/api/otlp/v1/traces', json=bad)
    assert partial.json()['partialSuccess']['rejectedSpans'] == '1'
    assert client.post('/api/otlp/v1/traces', json={'foo': []}).status_code == 400
    assert client.post('/api/otlp/v1/traces', content='oops', headers={'content-type': 'application/json'}).status_code == 400
    assert client.get('/api/traces?source=collected&status=ok').json()['total'] == 1
    assert client.get('/api/traces?source=demo').json()['total'] == 0
    assert client.get('/api/traces?source=unknown').status_code == 422
    assert client.get('/api/traces?since=invalid').status_code == 422


def test_protobuf_http_export_and_gzip(client, db):
    from instrumentation.opspilot_sdk import OpsPilot
    from backend.app.services.demo import InProcessOTLPExporter
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    from opentelemetry.exporter.otlp.proto.common.trace_encoder import encode_spans
    capture = InMemorySpanExporter()
    sdk = OpsPilot(exporter=capture, synchronous=True)
    with sdk.span('root'):
        with sdk.span('tool', 'tool'):
            pass
    wire = encode_spans(capture.get_finished_spans()).SerializeToString()
    response = client.post('/api/otlp/v1/traces', content=gzip.compress(wire), headers={'content-type': 'application/x-protobuf', 'content-encoding': 'gzip'})
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/x-protobuf'
    assert len(list(db.scalars(select(Span)))) == 2
    assert any(s.parent_id for s in db.scalars(select(Span)))
    sdk.close()


def test_api_actions(client):
    run = client.post('/api/demo/run', json={'scenario': 'rag_success'}).json()
    detail = client.get(f"/api/traces/{run['trace_id']}?source=demo").json()
    assert len(detail['spans']) >= 8
    assert detail['evaluations']
    assert client.post('/api/evaluations/run', json={'trace_id': run['trace_id'], 'criteria': 'refund'}).json()['scores']['custom'] == 1
    assert client.post('/api/evaluations/run', json={'trace_id': run['trace_id'], 'method': 'llm_judge'}).status_code == 422
    assert client.get('/api/analytics/agents').json()['agents']
    assert client.get('/api/analytics/costs').json()['by_model']
    assert client.post('/api/prompts/1/versions', json={'content': 'A new grounded prompt', 'retrieval_k': 1}).status_code == 201
    assert client.get('/api/prompts/diff/1/2').json()['diff']
    assert client.post('/api/settings/pricing', json={'model_id': 'test', 'input_per_million': -1, 'output_per_million': 1}).status_code == 422
    assert client.get('/api/traces/nonexistent').status_code == 404


def test_sdk_context_propagation():
    from instrumentation.opspilot_sdk import OpsPilot
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    exporter = InMemorySpanExporter()
    sdk = OpsPilot(exporter=exporter, synchronous=True)
    with sdk.span('upstream') as upstream:
        headers = sdk.headers()
    with sdk.remote_context(headers):
        with sdk.span('downstream') as downstream:
            assert downstream.get_span_context().trace_id == upstream.get_span_context().trace_id
    sdk.close()


@pytest.mark.parametrize('extra', [
    {'gen_ai.usage.input_tokens': '1.5'},
    {'gen_ai.usage.input_tokens': '-1'},
    {'gen_ai.usage.input_tokens': '99999999999999999999999999999'},
])
def test_invalid_usage_is_rejected_without_database_writes(db, extra):
    result = ingest(db, payload(extra=extra))
    assert result['rejected'] == 1
    assert not list(db.scalars(select(Trace)))


def test_timeout_and_slow_retrieval_signals(db):
    ingest(db, payload(extra={'error.type': 'TimeoutError'}))
    assert metrics.performance(db, 'collected')['timeout_rate'] == 1
    result = execute(db, scenario='slow_retrieval')
    signal = db.scalar(select(Insight).where(Insight.trace_id == result['trace_id'], Insight.rule == 'slow_retrieval'))
    assert signal.evidence['duration_ms'] >= 300
    assert signal.evidence['share'] > .4


def test_provider_mode_keeps_missing_usage_unavailable(db, monkeypatch):
    import httpx
    from backend.app.core.config import settings
    monkeypatch.setattr(settings(), 'openai_api_key', 'test-only-not-a-real-key')
    monkeypatch.setattr(httpx, 'post', lambda *a, **k: httpx.Response(200, request=httpx.Request('POST', 'https://example.test'),
                                                                  json={'choices': [{'message': {'content': 'Refunds are available within 30 days.'}}]}))
    result = execute(db, provider=True)
    assert result['source'] == 'collected' and result['mode'] == 'provider'
    summary = metrics.overview(db, 'collected')
    assert summary['total_tokens'] is None and summary['estimated_cost'] is None


def test_llm_judge_schema_and_unavailable_reference(db, monkeypatch):
    import httpx
    import json
    from backend.app.core.config import settings
    from backend.app.evaluations.engine import evaluate_trace
    trace_id = execute(db)['trace_id']
    monkeypatch.setattr(settings(), 'openai_api_key', 'test-only-not-a-real-key')
    content = json.dumps({'scores': {'answer_relevance': .8, 'faithfulness': .9, 'context_relevance': .8,
                                     'hallucination_indicator': .1, 'correctness': 1, 'custom': 1}, 'explanations': {'faithfulness': 'Supported by context'}})
    monkeypatch.setattr(httpx, 'post', lambda *a, **k: httpx.Response(200, request=httpx.Request('POST', 'https://example.test'),
                                                                  json={'choices': [{'message': {'content': content}}]}))
    result = evaluate_trace(db, trace_id, 'llm_judge')
    assert result.method == 'llm_judge'
    assert result.scores['faithfulness'] == .9
    assert result.scores['correctness'] is None and 'custom' not in result.scores


def test_optional_api_key_and_bounded_body(client, monkeypatch):
    from backend.app.core.config import settings
    monkeypatch.setattr(settings(), 'opspilot_api_key', 'test-workspace-key')
    assert client.get('/api/settings').status_code == 401
    assert client.get('/api/settings', headers={'X-API-Key': 'test-workspace-key'}).status_code == 200
    assert client.post('/api/otlp/v1/traces', content=b' ' * 5_000_001,
                       headers={'X-API-Key': 'test-workspace-key', 'content-type': 'application/json'}).status_code == 413
