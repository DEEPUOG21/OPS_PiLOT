"""OTLP/HTTP normalization, idempotent span storage, and trace assembly."""
import math
import re
import base64
from google.protobuf.json_format import MessageToDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.models.entities import ModelPricing, Project, Span, Trace


def protobuf_payload(message):
    # Generic protobuf JSON uses base64 bytes; OTLP JSON specifically requires hex IDs.
    payload = MessageToDict(message)
    def visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ('traceId', 'spanId', 'parentSpanId') and isinstance(child, str):
                    value[key] = base64.b64decode(child).hex()
                else:
                    visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(payload)
    payload.setdefault('resourceSpans', [])
    return payload


def attributes(items):
    def value(v):
        if 'arrayValue' in v:
            return [value(x) for x in v['arrayValue'].get('values', [])]
        if 'kvlistValue' in v:
            return attributes(v['kvlistValue'].get('values', []))
        for k in ('stringValue', 'boolValue', 'intValue', 'doubleValue', 'bytesValue'):
            if k in v:
                return v[k]
        return None
    return {x['key']: value(x.get('value', {})) for x in items if isinstance(x, dict) and 'key' in x}


def number(value, integer=False):
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError('Usage and costs must be numeric, not boolean')
    if integer and (not float(value).is_integer() or float(value) > 9223372036854775807):
        raise ValueError('Token usage must be a nonnegative 64-bit integer')
    result = int(value) if integer else float(value)
    if result < 0 or not math.isfinite(result):
        raise ValueError('Usage and costs must be finite and nonnegative')
    return result


def normalize(raw, resource):
    tid, sid = raw.get('traceId', '').lower(), raw.get('spanId', '').lower()
    parent = raw.get('parentSpanId', '').lower() or None
    if not re.fullmatch(r'[0-9a-f]{32}', tid) or int(tid, 16) == 0:
        raise ValueError('traceId must be a nonzero 32-character hex ID')
    if not re.fullmatch(r'[0-9a-f]{16}', sid) or int(sid, 16) == 0:
        raise ValueError('spanId must be a nonzero 16-character hex ID')
    if parent and (not re.fullmatch(r'[0-9a-f]{16}', parent) or int(parent, 16) == 0 or parent == sid):
        raise ValueError('Invalid parentSpanId')
    start, end = int(raw['startTimeUnixNano']), int(raw['endTimeUnixNano'])
    if start <= 0 or end < start or end > 9223372036854775807:
        raise ValueError('Invalid span time range')
    attrs = {**resource, **attributes(raw.get('attributes', []))}
    model = attrs.get('gen_ai.response.model', attrs.get('gen_ai.request.model'))
    kind = attrs.get('opspilot.kind', 'span')
    if model is not None and (not isinstance(model, str) or len(model) > 256):
        raise ValueError('Model identifier must be a string of at most 256 characters')
    if not isinstance(kind, str) or len(kind) > 100:
        raise ValueError('Operation kind must be a string of at most 100 characters')
    if not isinstance(raw.get('events', []), list):
        raise ValueError('Span events must be an array')
    source = attrs.get('opspilot.source', 'collected')
    if source not in ('demo', 'collected'):
        raise ValueError('opspilot.source must be demo or collected')
    status_obj = raw.get('status', {})
    if not isinstance(status_obj.get('message', ''), str):
        raise ValueError('Status message must be a string')
    code = status_obj.get('code', 0)
    status = 'error' if code in (2, 'STATUS_CODE_ERROR') else 'ok'
    if attrs.get('error.type') in ('TimeoutError', 'timeout'):
        status = 'timeout'
    return dict(id=f'{tid}:{sid}', trace_id=tid, span_id=sid, parent_id=parent,
                name=str(raw.get('name', 'unnamed'))[:500], kind=kind,
                start_ns=start, end_ns=end, status=status, status_message=status_obj.get('message', ''),
                model=model,
                input_tokens=number(attrs.get('gen_ai.usage.input_tokens'), True),
                output_tokens=number(attrs.get('gen_ai.usage.output_tokens'), True),
                provider_cost=number(attrs.get('opspilot.provider_cost_usd')),
                attributes=attrs, events=raw.get('events', [])), source


def ingest(db: Session, payload: dict):
    if not isinstance(payload, dict) or not isinstance(payload.get('resourceSpans'), list):
        raise ValueError('Expected OTLP resourceSpans array')
    prepared, errors = [], []
    for group in payload['resourceSpans']:
        resource = attributes(group.get('resource', {}).get('attributes', []))
        for scope in group.get('scopeSpans', []):
            for raw in scope.get('spans', []):
                if len(prepared) + len(errors) >= 10000:
                    raise ValueError('At most 10000 spans per batch')
                try:
                    prepared.append(normalize(raw, resource))
                except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as exc:
                    errors.append(str(exc))
    trace_ids = set()
    for data, source in prepared:
        tid = data['trace_id']
        trace = db.get(Trace, tid)
        project_id = str(data['attributes'].get('opspilot.project', 'default'))[:120]
        if trace and (trace.source != source or trace.project_id != project_id):
            errors.append('Trace project/source cannot change across batches')
            continue
        if not db.get(Project, project_id):
            db.add(Project(id=project_id, name=project_id.replace('-', ' ').title()))
            db.flush()
        if trace is None:
            trace = Trace(id=tid, name=data['name'], project_id=project_id, source=source,
                          mode=str(data['attributes'].get('opspilot.mode', 'external')),
                          start_ns=data['start_ns'], end_ns=data['end_ns'], status=data['status'])
            db.add(trace)
            db.flush()
        old = db.get(Span, data['id'])
        if old:
            # Exporter retries must not mutate previously accepted usage or pricing snapshots.
            trace_ids.add(tid)
            continue
        price = db.scalar(select(ModelPricing).where(ModelPricing.model_id == data['model']).order_by(ModelPricing.effective_at.desc(), ModelPricing.id.desc()).limit(1)) if data['model'] else None
        complete_usage = data['input_tokens'] is not None and data['output_tokens'] is not None
        data['estimated_cost'] = ((data['input_tokens'] * price.input_per_million + data['output_tokens'] * price.output_per_million) / 1_000_000) if price and complete_usage else None
        data['pricing_id'] = price.id if price and complete_usage else None
        db.add(Span(**data))
        trace_ids.add(tid)
    db.flush()
    for tid in trace_ids:
        spans = list(db.scalars(select(Span).where(Span.trace_id == tid)))
        trace = db.get(Trace, tid)
        roots = [s for s in spans if not s.parent_id]
        trace.name = min(roots or spans, key=lambda s: s.start_ns).name
        trace.start_ns, trace.end_ns = min(s.start_ns for s in spans), max(s.end_ns for s in spans)
        trace.status = 'timeout' if any(s.status == 'timeout' for s in spans) else 'error' if any(s.status == 'error' for s in spans) else 'ok'
        trace.execution_type = (roots[0].kind if roots else 'workflow')
    db.commit()
    return {'accepted': len(prepared) - len([e for e in errors if e == 'Trace project/source cannot change across batches']),
            'trace_ids': sorted(trace_ids), 'rejected': len(errors), 'errors': errors}
