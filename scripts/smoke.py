"""Exercise a running native/Compose deployment without a provider call."""
import os
import sys
import httpx

sys.stdout.reconfigure(encoding='utf-8')

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8001'
headers = {'X-API-Key': os.getenv('OPSPILOT_API_KEY', '')}
with httpx.Client(base_url=base, headers=headers, timeout=60) as client:
    assert client.get('/health').json()['service'] == 'opspilot'
    run = client.post('/api/demo/run', json={'question': 'How do I request a refund?', 'scenario': 'rag_success'})
    run.raise_for_status()
    trace_id = run.json()['trace_id']
    detail = client.get(f'/api/traces/{trace_id}', params={'source': 'demo'}).json()
    assert len(detail['spans']) >= 8 and detail['evaluations']
    assert detail['source'] == 'demo' and detail['mode'] == 'mock'
    for endpoint in ['overview', 'performance', 'costs', 'agents']:
        response = client.get('/api/analytics/' + endpoint, params={'source': 'demo'})
        response.raise_for_status()
    response = client.post('/api/experiments/run', json={'name': 'HTTP acceptance comparison', 'dataset_id': 1, 'version_ids': [1, 2]})
    response.raise_for_status()
    assert response.json()['paired']
    client.post('/api/insights/refresh', params={'source': 'demo'}).raise_for_status()
    assert client.get('/api/insights', params={'source': 'demo'}).json()['items']
    print('PASS: running backend, workflow → spans → stored trace → evaluation → analytics → paired report → evidence insights')
