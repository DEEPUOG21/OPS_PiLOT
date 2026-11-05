import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.core.config import settings
from backend.app.core.static import mount_dashboard


def test_same_origin_dashboard_routes_and_assets(tmp_path):
    (tmp_path / 'index.html').write_text('<html>OpsPilot dashboard</html>')
    assets = tmp_path / 'assets'
    assets.mkdir()
    (assets / 'app.js').write_text('console.log("built asset")')
    app = FastAPI()

    @app.get('/api/example')
    def example():
        return {'status': 'ok'}

    mount_dashboard(app, str(tmp_path))
    with TestClient(app) as client:
        assert 'OpsPilot dashboard' in client.get('/').text
        assert 'OpsPilot dashboard' in client.get('/traces/1234').text
        assert client.get('/traces/1234').headers['cache-control'] == 'no-cache'
        assert client.get('/assets/app.js').headers['cache-control'].endswith('immutable')
        assert client.get('/api/example').json() == {'status': 'ok'}
        assert client.get('/api/missing').status_code == 404
        assert client.get('/api/missing').headers['content-type'] == 'application/json'
        assert client.get('/assets/missing.js').status_code == 404
        assert client.post('/traces/1234').status_code == 405


def test_missing_bundle_fails_clearly(tmp_path):
    with pytest.raises(RuntimeError, match='Frontend bundle is missing'):
        mount_dashboard(FastAPI(), str(tmp_path))


def test_showcase_prevents_provider_and_external_ingestion(client, monkeypatch):
    monkeypatch.setattr(settings(), 'showcase_mode', True)
    monkeypatch.setattr(settings(), 'openai_api_key', 'test-key-that-must-never-be-used')
    assert client.get('/api/settings').json()['provider_configured'] is False
    assert client.get('/api/settings').json()['showcase_mode'] is True
    assert client.post('/api/demo/run', json={'provider': True}).status_code == 403
    assert client.post('/api/experiments/run', json={'dataset_id': 1, 'version_ids': [1, 2], 'provider': True}).status_code == 403
    assert client.post('/api/evaluations/run', json={'trace_id': 'a' * 32, 'method': 'llm_judge'}).status_code == 403
    assert client.post('/api/otlp/v1/traces', json={'resourceSpans': []}).status_code == 403
    run = client.post('/api/demo/run', json={'question': 'How do I reset my password?'})
    assert run.status_code == 200 and run.json()['mode'] == 'mock'
