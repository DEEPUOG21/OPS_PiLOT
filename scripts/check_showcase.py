"""Verify a running single-origin public showcase without calling a provider."""
from html.parser import HTMLParser
import sys
import httpx


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        candidate = values.get('src') if tag == 'script' else values.get('href')
        if candidate and candidate.startswith('/assets/'):
            self.paths.append(candidate)


base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8003'
with httpx.Client(base_url=base, timeout=90, follow_redirects=True) as client:
    assert client.get('/health').json()['service'] == 'opspilot'
    config = client.get('/api/settings').json()
    assert config['showcase_mode'] and not config['provider_configured']
    index = client.get('/')
    index.raise_for_status()
    assert '<div id="root"></div>' in index.text
    assert client.get('/prompts').text == index.text
    assert client.get('/api/not-a-route').status_code == 404
    assert client.get('/assets/missing.js').status_code == 404
    assert client.post('/api/otlp/v1/traces', json={'resourceSpans': []}).status_code == 403
    assets = Assets()
    assets.feed(index.text)
    assert assets.paths
    for path in assets.paths:
        client.get(path).raise_for_status()
    overview = client.get('/api/analytics/overview?source=demo').json()
    assert overview['total_traces'] >= 7
    experiments = client.get('/api/experiments?source=demo').json()['items']
    assert experiments and any(e['paired'] for e in experiments)
    print(f'PASS: showcase HTML, SPA deep links, {len(assets.paths)} bundled assets, API, seeded traces, paired report, and mock-only configuration')
