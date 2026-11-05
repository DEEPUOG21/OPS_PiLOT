import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.database.session import Base, get_db
from backend.app.main import app
from backend.app.services.demo import initialize
from backend.app.core.config import settings


@pytest.fixture(autouse=True)
def offline_environment(monkeypatch):
    monkeypatch.setattr(settings(), 'openai_api_key', '')
    monkeypatch.setattr(settings(), 'opspilot_api_key', '')
    monkeypatch.setattr(settings(), 'showcase_mode', False)


@pytest.fixture
def db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as session:
        initialize(session)
        yield session
    engine.dispose()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    # No lifespan here: endpoint tests must never initialize the developer's database.
    client = TestClient(app, raise_server_exceptions=True)
    yield client
    client.close()
    app.dependency_overrides.clear()
