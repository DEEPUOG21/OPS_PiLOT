from alembic import context
from backend.app.database.session import engine, Base
from backend.app.models import entities  # noqa: F401

if context.is_offline_mode():
    context.configure(url=str(engine.url), target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    selected_engine = engine
    if context.config.get_main_option('sqlalchemy.url'):
        from sqlalchemy import create_engine
        selected_engine = create_engine(context.config.get_main_option('sqlalchemy.url'))
    with selected_engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
