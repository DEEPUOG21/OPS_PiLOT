from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean
from sqlalchemy import select
from backend.app.models.entities import Evaluation, Span, Trace


def duration(item):
    return (item.end_ns - item.start_ns) / 1_000_000


def optional_sum(values):
    known = [v for v in values if v is not None]
    return sum(known) if known else None


def percentile(values, p):
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * p
    lo = int(position)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (position - lo)


def scope(db, source):
    traces = list(db.scalars(select(Trace).where(Trace.source == source).order_by(Trace.start_ns.desc())))
    spans = list(db.scalars(select(Span).join(Trace).where(Trace.source == source)))
    grouped = defaultdict(list)
    for span in spans:
        grouped[span.trace_id].append(span)
    return traces, spans, grouped


def usage_spans(spans):
    """Prefer deepest usage reporters, so nested wrappers cannot double count."""
    by_id = {s.span_id: s for s in spans}
    reporters = [s for s in spans if s.input_tokens is not None or s.output_tokens is not None or s.provider_cost is not None]
    ancestors = set()
    for s in reporters:
        parent, visited = s.parent_id, set()
        while parent in by_id and parent not in visited:
            visited.add(parent)
            ancestors.add(parent)
            parent = by_id[parent].parent_id
    return [s for s in reporters if s.span_id not in ancestors]


def trace_summary(trace, spans):
    usage = usage_spans(spans)
    input_tokens = optional_sum(s.input_tokens for s in usage)
    output_tokens = optional_sum(s.output_tokens for s in usage)
    return dict(id=trace.id, name=trace.name, project_id=trace.project_id,
                source=trace.source, mode=trace.mode, status=trace.status,
                execution_type=trace.execution_type,
                timestamp=datetime.fromtimestamp(trace.start_ns / 1e9, timezone.utc).isoformat(),
                duration_ms=duration(trace), input_tokens=input_tokens, output_tokens=output_tokens,
                total_tokens=(input_tokens + output_tokens) if input_tokens is not None and output_tokens is not None else None,
                estimated_cost=optional_sum(s.estimated_cost for s in usage),
                provider_cost=optional_sum(s.provider_cost for s in usage),
                models=sorted({s.model for s in spans if s.model}), span_count=len(spans),
                priced_spans=sum(s.estimated_cost is not None for s in usage), usage_spans=len(usage))


def span_detail(s, start_ns):
    return dict(id=s.span_id, parent_id=s.parent_id, name=s.name, kind=s.kind,
                status=s.status, status_message=s.status_message, model=s.model,
                offset_ms=(s.start_ns - start_ns) / 1e6, duration_ms=duration(s),
                input_tokens=s.input_tokens, output_tokens=s.output_tokens,
                estimated_cost=s.estimated_cost, provider_cost=s.provider_cost,
                attributes=s.attributes, events=s.events)


def overview(db, source):
    traces, spans, grouped = scope(db, source)
    summaries = [trace_summary(t, grouped[t.id]) for t in traces]
    durations = [t['duration_ms'] for t in summaries]
    evaluations = list(db.scalars(select(Evaluation).join(Trace).where(Trace.source == source).order_by(Evaluation.id)))
    latest = {(e.trace_id, e.method): e for e in evaluations}
    quality_by_method = defaultdict(list)
    for e in latest.values():
        if e.scores.get('answer_relevance') is not None:
            quality_by_method[e.method].append(e.scores['answer_relevance'])
    days = defaultdict(list)
    for t in summaries:
        days[t['timestamp'][:10]].append(t)
    trend = [dict(date=day, traces=len(items), latency_ms=mean(x['duration_ms'] for x in items),
                  tokens=optional_sum(x['total_tokens'] for x in items), estimated_cost=optional_sum(x['estimated_cost'] for x in items),
                  errors=sum(x['status'] != 'ok' for x in items)) for day, items in sorted(days.items())]
    return dict(source=source, total_traces=len(traces), successful=sum(t.status == 'ok' for t in traces),
                failed=sum(t.status != 'ok' for t in traces), avg_latency_ms=mean(durations) if durations else None,
                total_tokens=optional_sum(t['total_tokens'] for t in summaries),
                estimated_cost=optional_sum(t['estimated_cost'] for t in summaries),
                provider_cost=optional_sum(t['provider_cost'] for t in summaries),
                cost_coverage={'priced_spans': sum(t['priced_spans'] for t in summaries), 'usage_spans': sum(t['usage_spans'] for t in summaries)},
                quality_by_method={k: mean(v) for k, v in quality_by_method.items()},
                evaluated_traces=len({e.trace_id for e in evaluations}), trend=trend, recent_traces=summaries[:8])


def performance(db, source):
    traces, spans, grouped = scope(db, source)
    durations = [duration(t) for t in traces]
    groups = defaultdict(list)
    for s in spans:
        groups[(s.kind, s.name)].append(duration(s))
    breakdown = [dict(kind=k[0], name=k[1], count=len(v), avg_ms=mean(v), max_ms=max(v)) for k, v in groups.items()]
    bins = [('0–10 ms', 0, 10), ('10–100 ms', 10, 100), ('100–500 ms', 100, 500), ('0.5–1 s', 500, 1000), ('1–5 s', 1000, 5000), ('5 s+', 5000, float('inf'))]
    return dict(source=source, sample_count=len(traces),
                p50_ms=percentile(durations, .5) if len(durations) >= 2 else None,
                p95_ms=percentile(durations, .95) if len(durations) >= 20 else None,
                p99_ms=percentile(durations, .99) if len(durations) >= 100 else None,
                error_rate=sum(t.status != 'ok' for t in traces) / len(traces) if traces else None,
                timeout_rate=sum(t.status == 'timeout' for t in traces) / len(traces) if traces else None,
                breakdown=sorted(breakdown, key=lambda x: x['avg_ms'], reverse=True),
                distribution=[dict(bucket=label, count=sum(lo <= d < hi for d in durations)) for label, lo, hi in bins],
                slowest=[trace_summary(t, grouped[t.id]) for t in sorted(traces, key=duration, reverse=True)[:10]])


def owner(span, spans):
    by_id = {s.span_id: s for s in spans}
    current, visited = span, set()
    while current and current.span_id not in visited:
        visited.add(current.span_id)
        if current.kind == 'agent':
            return current.name
        current = by_id.get(current.parent_id)
    return 'Unassigned'


def costs(db, source):
    traces, _, grouped = scope(db, source)
    by_model, by_agent, prompts = defaultdict(list), defaultdict(list), defaultdict(list)
    for tid, spans in grouped.items():
        for s in usage_spans(spans):
            by_model[s.model or 'Unknown model'].append(s)
            by_agent[owner(s, spans)].append(s)
            if s.attributes.get('gen_ai.input.messages'):
                prompts[str(s.attributes['gen_ai.input.messages'])].append(s)
    def group(items):
        return [dict(name=k, calls=len(v), input_tokens=optional_sum(s.input_tokens for s in v),
                     output_tokens=optional_sum(s.output_tokens for s in v), estimated_cost=optional_sum(s.estimated_cost for s in v),
                     provider_cost=optional_sum(s.provider_cost for s in v), priced_calls=sum(s.estimated_cost is not None for s in v)) for k, v in items.items()]
    summaries = [trace_summary(t, grouped[t.id]) for t in traces]
    return dict(source=source, by_model=group(by_model), by_agent=group(by_agent),
                prompts=sorted(group(prompts), key=lambda x: x['estimated_cost'] or 0, reverse=True)[:10],
                expensive=sorted(summaries, key=lambda x: x['estimated_cost'] or 0, reverse=True)[:10])


def agents(db, source):
    traces, spans, grouped = scope(db, source)
    groups, edges = defaultdict(list), defaultdict(int)
    for s in spans:
        if s.kind != 'agent':
            continue
        groups[s.name].append(s)
        parent = next((p for p in grouped[s.trace_id] if p.span_id == s.parent_id), None)
        if parent and parent.kind == 'agent':
            edges[(parent.name, s.name)] += 1
    items = []
    for name, agent_spans in groups.items():
        usage = [s for ss in grouped.values() for s in usage_spans(ss) if owner(s, ss) == name]
        items.append(dict(name=name, executions=len(agent_spans), failures=sum(s.status != 'ok' for s in agent_spans),
                          success_rate=sum(s.status == 'ok' for s in agent_spans) / len(agent_spans), avg_ms=mean(duration(s) for s in agent_spans),
                          input_tokens=optional_sum(s.input_tokens for s in usage), output_tokens=optional_sum(s.output_tokens for s in usage),
                          estimated_cost=optional_sum(s.estimated_cost for s in usage)))
    return dict(source=source, agents=items, edges=[dict(parent=k[0], child=k[1], count=v) for k, v in edges.items()],
                workflow_completion_rate=sum(t.status == 'ok' for t in traces) / len(traces) if traces else None)
