"""Small reusable application SDK; no model gateway or global provider mutation."""
from contextlib import contextmanager
from opentelemetry import context, propagate
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.trace import Status, StatusCode


class OpsPilot:
    def __init__(self, endpoint='http://localhost:8001/api/otlp/v1/traces', project='default',
                 source='collected', mode='external', api_key='', exporter=None, synchronous=False):
        self.provider = TracerProvider(resource=Resource.create({
            'service.name': project, 'opspilot.project': project,
            'opspilot.source': source, 'opspilot.mode': mode,
        }))
        exporter = exporter or OTLPSpanExporter(endpoint=endpoint, headers={'X-API-Key': api_key} if api_key else {})
        processor = SimpleSpanProcessor if synchronous else BatchSpanProcessor
        self.provider.add_span_processor(processor(exporter))
        self.tracer = self.provider.get_tracer('opspilot', '1.0.0')

    @contextmanager
    def span(self, name, kind='agent', **attrs):
        with self.tracer.start_as_current_span(name, attributes={'opspilot.kind': kind, **attrs}) as span:
            try:
                yield span
                span.set_status(Status(StatusCode.OK))
            except Exception as exc:
                span.record_exception(exc)
                span.set_attribute('error.type', type(exc).__name__)
                span.set_status(Status(StatusCode.ERROR, str(exc)))
                raise

    @contextmanager
    def remote_context(self, carrier):
        token = context.attach(propagate.extract(carrier))
        try:
            yield
        finally:
            context.detach(token)

    def headers(self):
        carrier = {}
        propagate.inject(carrier)
        return carrier

    def flush(self):
        return self.provider.force_flush()

    def close(self):
        self.provider.shutdown()
