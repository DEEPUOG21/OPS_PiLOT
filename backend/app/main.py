from contextlib import asynccontextmanager
import logging
from pathlib import Path
import secrets
import httpx
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from backend.app.api.routes import router
from backend.app.core.config import settings
from backend.app.database.session import SessionLocal
from backend.app.services.demo import initialize, seed
from backend.app.core.static import mount_dashboard

log = logging.getLogger('opspilot')


def migrate():
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / 'alembic.ini'))
    config.set_main_option('script_location', str(backend / 'migrations'))
    command.upgrade(config, 'head')


@asynccontextmanager
async def lifespan(app):
    migrate()
    with SessionLocal() as db:
        initialize(db)
        if settings().demo_auto_seed:
            seed(db)
            if settings().showcase_mode:
                from sqlalchemy import select
                from backend.app.models.entities import Experiment, PromptVersion
                from backend.app.services.experiments import run_experiment
                if not db.scalar(select(Experiment).limit(1)):
                    versions = list(db.scalars(select(PromptVersion.id).order_by(PromptVersion.id).limit(2)))
                    run_experiment(db, 'Baseline vs optimized support', 1, versions)
    yield


app = FastAPI(title='OpsPilot', version='1.0.0', lifespan=lifespan,
              description='AI observability, measured analytics, evaluation and optimization intelligence.')
app.add_middleware(CORSMiddleware, allow_origins=settings().cors_origins.split(','),
                   allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Content-Type', 'X-API-Key'])


@app.middleware('http')
async def api_auth(request: Request, call_next):
    expected = settings().opspilot_api_key
    if expected and request.method != 'OPTIONS' and request.url.path.startswith('/api/') and not secrets.compare_digest(request.headers.get('x-api-key', ''), expected):
        return JSONResponse({'detail': 'Invalid or missing X-API-Key'}, status_code=401)
    return await call_next(request)


@app.exception_handler(httpx.HTTPError)
async def provider_error(request, exc):
    log.warning('Provider request failed: %s', type(exc).__name__)
    return JSONResponse({'detail': 'The configured model provider request failed. Check server configuration and provider availability.'}, status_code=502)


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    log.exception('Database operation failed')
    return JSONResponse({'detail': 'Database operation failed. See server logs.'}, status_code=500)


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'opspilot'}


app.include_router(router)
mount_dashboard(app, settings().static_dir)
