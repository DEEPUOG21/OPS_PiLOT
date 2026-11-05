"""Serve a built dashboard and API from one origin for hosted deployments."""
from pathlib import Path
from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class DashboardFiles(StaticFiles):
    async def get_response(self, path, scope):
        path = path.replace('\\', '/')
        # Unknown API calls must remain JSON 404s, never receive SPA HTML.
        if path.split('/')[0] in {'api', 'docs', 'redoc', 'health', 'openapi.json'}:
            raise HTTPException(404)
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or scope['method'] not in {'GET', 'HEAD'} or Path(path).suffix or path.startswith('assets/'):
                raise
            response = await super().get_response('index.html', scope)
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable' if path.startswith('assets/') else 'no-cache'
        return response


def mount_dashboard(app: FastAPI, directory: str):
    if not directory:
        return
    bundle = Path(directory).resolve()
    if not (bundle / 'index.html').is_file():
        raise RuntimeError(f'Frontend bundle is missing from STATIC_DIR: {bundle}')
    app.mount('/', DashboardFiles(directory=bundle, html=True), name='dashboard')
