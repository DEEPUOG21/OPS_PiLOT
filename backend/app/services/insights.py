from collections import Counter
from sqlalchemy import select
from backend.app.analytics.metrics import duration, owner, scope, usage_spans
from backend.app.models.entities import Evaluation, Insight


def generate(db, source):
    traces, _, grouped = scope(db, source)
    existing = {(i.trace_id, i.rule) for i in db.scalars(select(Insight))}
    created = 0

    def add(tid, rule, title, severity, category, evidence, explanation, action, agent=None):
        nonlocal created
        if (tid, rule) in existing:
            return
        db.add(Insight(trace_id=tid, rule=rule, title=title, severity=severity, category=category,
                       evidence=evidence, explanation=explanation, action=action, agent=agent))
        existing.add((tid, rule))
        created += 1

    for trace in traces:
        spans = grouped[trace.id]
        for s in spans:
            if s.kind == 'retrieval' and duration(s) > 200 and duration(s) / max(duration(trace), .001) > .4:
                add(trace.id, 'slow_retrieval', 'Retrieval dominates execution time', 'medium', 'latency',
                    {'span_id': s.span_id, 'duration_ms': duration(s), 'trace_duration_ms': duration(trace), 'share': duration(s) / max(duration(trace), .001)},
                    'A retrieval span took over 200 ms and more than 40% of end-to-end elapsed time. Nested spans are not added together.',
                    'Inspect retrieval dependencies, cache reusable results, and reduce unnecessary searches.', owner(s, spans))
        tools = [s for s in spans if s.kind == 'tool']
        signatures = Counter((s.name, str(s.attributes.get('opspilot.input', ''))) for s in tools if s.attributes.get('opspilot.input') is not None)
        for (name, signature), count in signatures.items():
            if count >= 3:
                add(trace.id, 'repeat:' + name, 'Repeated identical tool calls', 'medium', 'reliability',
                    {'tool': name, 'calls': count, 'input': signature},
                    'The same tool received the same captured input at least three times in this execution. Retries may be intentional.',
                    'Review retry and stopping conditions; consider deduplication or memoization.')
        usage = usage_spans(spans)
        for s in usage:
            if (s.input_tokens or 0) > 1800:
                add(trace.id, 'large_context', 'Large model input', 'medium', 'cost',
                    {'span_id': s.span_id, 'input_tokens': s.input_tokens, 'token_source': s.attributes.get('opspilot.token_source', 'telemetry')},
                    'A captured model call exceeded the configured 1,800 input-unit review threshold. Mock usage is simulated.',
                    'Remove duplicate context and compare a smaller retrieval window on the same evaluation dataset.', owner(s, spans))
        if trace.status != 'ok':
            failed = [s for s in spans if s.status != 'ok']
            add(trace.id, 'execution_failure', 'Workflow execution failed', 'high', 'reliability',
                {'failed_spans': [{'id': s.span_id, 'name': s.name, 'message': s.status_message} for s in failed]},
                'Telemetry contains an error or timeout. A failed handoff is only asserted when explicitly reported by instrumentation.',
                'Open the failed span, inspect its exception event, and add recovery around the failing dependency.')
        max_depth = 0
        lookup = {s.span_id: s for s in spans}
        for s in spans:
            depth, current, visited = 0, s, set()
            while current and current.span_id not in visited:
                visited.add(current.span_id)
                depth += 1
                current = lookup.get(current.parent_id)
            max_depth = max(max_depth, depth)
        if max_depth > 12:
            add(trace.id, 'long_chain', 'Unusually deep execution chain', 'medium', 'latency', {'depth': max_depth, 'threshold': 12},
                'The parent-child chain exceeds the configured review threshold.', 'Review recursion, stopping conditions, and sequential work.')
        latest = db.scalar(select(Evaluation).where(Evaluation.trace_id == trace.id).order_by(Evaluation.id.desc()).limit(1))
        if latest and latest.scores.get('faithfulness') is not None and latest.scores['faithfulness'] < .5:
            add(trace.id, 'weak_support', 'Answer needs grounding review', 'high', 'quality', {'evaluation_id': latest.id, 'method': latest.method, 'faithfulness': latest.scores['faithfulness']},
                'The stored evaluation reports low support in the retrieved context. Heuristic scores are lexical review signals, not proof of hallucination.',
                'Inspect the answer alongside context and strengthen grounding instructions before rerunning the dataset.')
        for s in spans:
            if s.attributes.get('opspilot.handoff.failed') is True:
                add(trace.id, 'handoff:' + s.span_id, 'Explicit agent handoff failure', 'high', 'reliability', {'span_id': s.span_id},
                    'Instrumentation explicitly marked this handoff as failed.', 'Inspect the receiving agent and validate its expected input.', owner(s, spans))
    db.commit()
    return created
