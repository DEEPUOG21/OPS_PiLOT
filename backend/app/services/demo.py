from google.protobuf.json_format import MessageToDict
from opentelemetry.exporter.otlp.proto.common.trace_encoder import encode_spans
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from sqlalchemy import select
from backend.app.core.config import settings
from backend.app.ingestion.otlp import ingest, protobuf_payload
from backend.app.models.entities import Dataset, DatasetRecord, Model, ModelPricing, Prompt, PromptVersion, Trace
from instrumentation.opspilot_sdk import OpsPilot
from sample_ai_app.workflows.support import SCENARIOS, run_support


class InProcessOTLPExporter(SpanExporter):
    """Uses the same protobuf encoder and normalizer as the HTTP endpoint."""
    def __init__(self, db):
        self.db = db

    def export(self, spans):
        result = ingest(self.db, protobuf_payload(encode_spans(spans)))
        if result['rejected']:
            raise ValueError('; '.join(result['errors']))
        return SpanExportResult.SUCCESS

    def shutdown(self):
        pass


BASELINE = 'You are a helpful support assistant. Read all the provided knowledge base passages carefully. Explain the answer using only supplied context. Include practical details. Never invent policies. If the knowledge base does not support an answer, say you do not know.'
OPTIMIZED = 'Answer concisely from context only. If unsupported, say you do not know.'


def initialize(db):
    # Mock prices are illustrative configuration, not a provider pricing claim.
    if not db.get(Model, 'mock-support-v1'):
        db.add(Model(id='mock-support-v1', provider='deterministic-mock'))
        db.flush()
        db.add(ModelPricing(model_id='mock-support-v1', input_per_million=.15, output_per_million=.60))
    if not db.scalar(select(Prompt).limit(1)):
        prompt = Prompt(name='Customer support', description='Grounded answers from the support knowledge base')
        db.add(prompt)
        db.flush()
        db.add_all([PromptVersion(prompt_id=prompt.id, version=1, content=BASELINE, retrieval_k=5),
                    PromptVersion(prompt_id=prompt.id, version=2, content=OPTIMIZED, retrieval_k=2)])
    if not db.scalar(select(Dataset).limit(1)):
        dataset = Dataset(name='Support essentials · 4 reference cases')
        db.add(dataset)
        db.flush()
        from sample_ai_app.rag.knowledge import DOCUMENTS
        questions = ['How do I request a refund?', 'How do I reset my password?', 'What does the Team plan include?', 'How do I export telemetry?']
        for question, document in zip(questions, DOCUMENTS):
            db.add(DatasetRecord(dataset_id=dataset.id, question=question, reference=document['text']))
    db.commit()


def execute(db, question='How do I request a refund?', scenario='successful', version=None, reference='', provider=False):
    use_provider = provider and bool(settings().openai_api_key)
    source = 'collected' if use_provider else 'demo'
    sdk = OpsPilot(project='customer-support', source=source, mode='provider' if use_provider else 'mock',
                   exporter=InProcessOTLPExporter(db), synchronous=True)
    try:
        result = run_support(sdk, question, scenario, version.content if version else OPTIMIZED,
                             version.retrieval_k if version else 2, reference, use_provider)
    finally:
        sdk.close()
    result['source'] = source
    result['evaluation_id'] = None
    if result['answer']:
        from backend.app.evaluations.engine import evaluate_trace
        result['evaluation_id'] = evaluate_trace(db, result['trace_id']).id
    from backend.app.services.insights import generate
    generate(db, source)
    return result


def seed(db):
    initialize(db)
    if db.scalar(select(Trace).where(Trace.source == 'demo').limit(1)):
        return
    for scenario in SCENARIOS:
        execute(db, scenario=scenario)
