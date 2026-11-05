from datetime import datetime
import difflib
import json
import zlib
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from google.protobuf.json_format import MessageToDict
from google.protobuf.message import DecodeError
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest, ExportTraceServiceResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.app.analytics import metrics
from backend.app.core.config import settings
from backend.app.database.session import get_db
from backend.app.evaluations.engine import evaluate_trace
from backend.app.ingestion.otlp import ingest, protobuf_payload
from backend.app.models.entities import Dataset, DatasetRecord, Evaluation, Experiment, Insight, Model, ModelPricing, Project, Prompt, PromptVersion, Span, Trace
from backend.app.schemas.requests import DatasetRequest, DemoRequest, EvaluationRequest, ExperimentRequest, InsightStatus, PricingRequest, PromptRequest, Source, VersionRequest
from backend.app.services.demo import execute
from backend.app.services.experiments import compare, run_experiment
from backend.app.services.insights import generate

router = APIRouter(prefix='/api')
DB = Depends(get_db)


def record(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


def require(row, name='Record'):
    if row is None:
        raise HTTPException(404, f'{name} not found')
    return row


@router.get('/traces')
def traces(source: Source = 'demo', page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
           search: str = '', status: str = '', model: str = '', execution_type: str = '', project_id: str = '',
           since: datetime | None = None, until: datetime | None = None, db: Session = DB):
    rows, _, grouped = metrics.scope(db, source)
    def matches(t):
        return (not search or search.lower() in t.id.lower() or search.lower() in t.name.lower()) and (not status or t.status == status) and (not model or any(s.model == model for s in grouped[t.id])) and (not execution_type or t.execution_type == execution_type) and (not project_id or t.project_id == project_id) and (not since or t.start_ns >= since.timestamp() * 1e9) and (not until or t.start_ns <= until.timestamp() * 1e9)
    filtered = [t for t in rows if matches(t)]
    return {'items': [metrics.trace_summary(t, grouped[t.id]) for t in filtered[(page - 1) * page_size:page * page_size]], 'total': len(filtered), 'page': page, 'page_size': page_size}


@router.get('/traces/{trace_id}')
def trace_detail(trace_id: str, source: Source = 'demo', db: Session = DB):
    trace = require(db.scalar(select(Trace).where(Trace.id == trace_id, Trace.source == source)), 'Trace')
    spans = list(db.scalars(select(Span).where(Span.trace_id == trace_id).order_by(Span.start_ns)))
    return {**metrics.trace_summary(trace, spans), 'spans': [metrics.span_detail(s, trace.start_ns) for s in spans],
            'evaluations': [record(e) for e in db.scalars(select(Evaluation).where(Evaluation.trace_id == trace_id))]}


@router.get('/traces/{trace_id}/spans')
def trace_spans(trace_id: str, source: Source = 'demo', db: Session = DB):
    return {'items': trace_detail(trace_id, source, db)['spans']}


@router.get('/analytics/overview')
def overview(source: Source = 'demo', db: Session = DB):
    return metrics.overview(db, source)


@router.get('/analytics/performance')
def performance(source: Source = 'demo', db: Session = DB):
    return metrics.performance(db, source)


@router.get('/analytics/costs')
def costs(source: Source = 'demo', db: Session = DB):
    return metrics.costs(db, source)


@router.get('/analytics/agents')
def agents(source: Source = 'demo', db: Session = DB):
    return metrics.agents(db, source)


@router.get('/evaluations')
def evaluations(source: Source = 'demo', page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), db: Session = DB):
    rows = list(db.scalars(select(Evaluation).join(Trace).where(Trace.source == source).order_by(Evaluation.id.desc())))
    return {'items': [record(e) for e in rows[(page - 1) * page_size:page * page_size]], 'total': len(rows)}


@router.post('/evaluations/run')
def evaluate(data: EvaluationRequest, db: Session = DB):
    if settings().showcase_mode and data.method == 'llm_judge':
        raise HTTPException(403, 'The public showcase uses deterministic evaluations. Run locally to configure an LLM judge.')
    try:
        return record(evaluate_trace(db, data.trace_id, data.method, data.criteria, data.reference))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get('/prompts')
def prompts(db: Session = DB):
    return {'items': [{**record(p), 'versions': [record(v) for v in db.scalars(select(PromptVersion).where(PromptVersion.prompt_id == p.id).order_by(PromptVersion.version))]} for p in db.scalars(select(Prompt))]}


@router.post('/prompts', status_code=201)
def create_prompt(data: PromptRequest, db: Session = DB):
    prompt = Prompt(**data.model_dump())
    db.add(prompt)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Prompt name already exists') from exc
    return record(prompt)


@router.post('/prompts/{prompt_id}/versions', status_code=201)
def create_version(prompt_id: int, data: VersionRequest, db: Session = DB):
    require(db.get(Prompt, prompt_id), 'Prompt')
    versions = list(db.scalars(select(PromptVersion).where(PromptVersion.prompt_id == prompt_id)))
    version = PromptVersion(prompt_id=prompt_id, version=max([v.version for v in versions], default=0) + 1, **data.model_dump())
    db.add(version)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'A concurrent version was added. Retry.') from exc
    return record(version)


@router.get('/prompts/diff/{a}/{b}')
def prompt_diff(a: int, b: int, db: Session = DB):
    left, right = require(db.get(PromptVersion, a)), require(db.get(PromptVersion, b))
    return {'diff': '\n'.join(difflib.unified_diff(left.content.splitlines(), right.content.splitlines(), fromfile=f'v{left.version}', tofile=f'v{right.version}', lineterm='')),
            'retrieval_k': {'before': left.retrieval_k, 'after': right.retrieval_k}}


@router.get('/datasets')
def datasets(db: Session = DB):
    return {'items': [{**record(d), 'records': [record(r) for r in db.scalars(select(DatasetRecord).where(DatasetRecord.dataset_id == d.id))]} for d in db.scalars(select(Dataset))]}


@router.post('/datasets', status_code=201)
def create_dataset(data: DatasetRequest, db: Session = DB):
    dataset = Dataset(name=data.name)
    db.add(dataset)
    try:
        db.flush()
        rows = [DatasetRecord(dataset_id=dataset.id, **item.model_dump()) for item in data.records]
        db.add_all(rows)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Dataset name already exists') from exc
    return {**record(dataset), 'records': [record(row) for row in rows]}


@router.get('/experiments')
def experiments(source: Source = 'demo', db: Session = DB):
    return {'items': [compare(db, e) for e in db.scalars(select(Experiment).where(Experiment.source == source).order_by(Experiment.id.desc()))]}


@router.post('/experiments/run')
def experiment(data: ExperimentRequest, db: Session = DB):
    if settings().showcase_mode and data.provider:
        raise HTTPException(403, 'Provider execution is disabled in the public showcase.')
    if len(set(data.version_ids)) != len(data.version_ids):
        raise HTTPException(422, 'Select distinct prompt versions')
    try:
        return run_experiment(db, data.name, data.dataset_id, data.version_ids, data.provider)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get('/insights')
def insights(source: Source = 'demo', db: Session = DB):
    return {'items': [record(i) for i in db.scalars(select(Insight).join(Trace).where(Trace.source == source).order_by(Insight.id.desc()))]}


@router.post('/insights/refresh')
def refresh_insights(source: Source = 'demo', db: Session = DB):
    return {'created': generate(db, source)}


@router.post('/insights/{insight_id}/resolve')
def resolve(insight_id: int, data: InsightStatus, db: Session = DB):
    insight = require(db.get(Insight, insight_id), 'Insight')
    insight.status = data.status
    db.commit()
    return record(insight)


@router.post('/demo/run')
def demo(data: DemoRequest, db: Session = DB):
    if settings().showcase_mode and data.provider:
        raise HTTPException(403, 'Provider execution is disabled in the public showcase.')
    return execute(db, data.question, data.scenario, provider=data.provider)


@router.get('/settings')
def get_settings(db: Session = DB):
    pricing = list(db.scalars(select(ModelPricing).order_by(ModelPricing.id.desc())))
    return {'provider_configured': bool(settings().openai_api_key) and not settings().showcase_mode, 'provider_model': settings().openai_model,
            'showcase_mode': settings().showcase_mode,
            'auth_enabled': bool(settings().opspilot_api_key), 'pricing': [record(p) for p in pricing],
            'projects': [record(p) for p in db.scalars(select(Project))], 'ingestion_path': '/api/otlp/v1/traces'}


@router.post('/settings/pricing', status_code=201)
def pricing(data: PricingRequest, db: Session = DB):
    model = db.get(Model, data.model_id)
    if not model:
        db.add(Model(id=data.model_id, provider=data.provider))
        db.flush()
    price = ModelPricing(model_id=data.model_id, input_per_million=data.input_per_million, output_per_million=data.output_per_million)
    db.add(price)
    db.commit()
    return record(price)


@router.post('/otlp/v1/traces')
async def otlp(request: Request, db: Session = DB):
    if settings().showcase_mode:
        raise HTTPException(403, 'External ingestion is disabled in the public showcase. Run a mock workflow or deploy your own workspace.')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 5_000_000:
            raise HTTPException(413, 'Telemetry batch exceeds 5 MB')
    try:
        if request.headers.get('content-encoding') == 'gzip':
            decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
            body = decoder.decompress(body, 5_000_001)
            if len(body) > 5_000_000 or decoder.unconsumed_tail:
                raise HTTPException(413, 'Expanded telemetry batch exceeds 5 MB')
            if not decoder.eof:
                raise ValueError('Incomplete gzip payload')
        protobuf = 'application/x-protobuf' in request.headers.get('content-type', '')
        if protobuf:
            message = ExportTraceServiceRequest()
            message.ParseFromString(bytes(body))
            payload = protobuf_payload(message)
        elif 'application/json' in request.headers.get('content-type', ''):
            payload = json.loads(body)
        else:
            raise HTTPException(415, 'Use application/json or application/x-protobuf')
        result = ingest(db, payload)
    except (ValueError, KeyError, TypeError, AttributeError, DecodeError, zlib.error) as exc:
        db.rollback()
        raise HTTPException(400, f'Invalid OTLP payload: {exc}') from exc
    response = ExportTraceServiceResponse()
    if result['rejected']:
        response.partial_success.rejected_spans = result['rejected']
        response.partial_success.error_message = '; '.join(result['errors'])[:2000]
    if protobuf:
        return Response(content=response.SerializeToString(), media_type='application/x-protobuf')
    return MessageToDict(response)
