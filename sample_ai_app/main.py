"""Run as a separate service to demonstrate real HTTP OTLP export."""
import os
from fastapi import FastAPI, Request
from backend.app.core.config import settings
from backend.app.schemas.requests import DemoRequest
from instrumentation.opspilot_sdk import OpsPilot
from sample_ai_app.workflows.support import run_support

app = FastAPI(title='OpsPilot sample support application')


@app.post('/chat')
def chat(data: DemoRequest, request: Request):
    cfg = settings()
    provider = data.provider and bool(cfg.openai_api_key)
    sdk = OpsPilot(endpoint=os.getenv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'http://localhost:8001/api/otlp/v1/traces'),
                   project=os.getenv('OPSPILOT_PROJECT', 'customer-support'), source='collected' if provider else 'demo',
                   mode='provider' if provider else 'mock', api_key=cfg.opspilot_api_key)
    try:
        with sdk.remote_context(dict(request.headers)):
            return run_support(sdk, data.question, data.scenario, use_provider=provider)
    finally:
        sdk.close()
