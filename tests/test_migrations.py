from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_round_trip(tmp_path):
    url = f'sqlite:///{tmp_path / "migration.db"}'
    config = Config('backend/alembic.ini')
    config.set_main_option('sqlalchemy.url', url)
    command.upgrade(config, 'head')
    engine = create_engine(url)
    assert {'traces', 'spans', 'evaluation_results', 'experiment_runs', 'model_pricing'} <= set(inspect(engine).get_table_names())
    assert any(i['name'] == 'ix_span_trace_parent' for i in inspect(engine).get_indexes('spans'))
    assert 'evaluation_id' in {c['name'] for c in inspect(engine).get_columns('experiment_runs')}
    command.downgrade(config, 'base')
    assert 'traces' not in inspect(engine).get_table_names()
    command.upgrade(config, 'head')
    assert 'traces' in inspect(engine).get_table_names()
    engine.dispose()


def test_evaluation_link_migration_backfills_existing_reports(tmp_path):
    from sqlalchemy import text
    url = f'sqlite:///{tmp_path / "existing.db"}'
    config = Config('backend/alembic.ini')
    config.set_main_option('sqlalchemy.url', url)
    command.upgrade(config, '0001')
    engine = create_engine(url)
    with engine.begin() as connection:
        for statement in [
            "INSERT INTO projects VALUES ('p','Project')",
            "INSERT INTO traces VALUES ('trace','p','Run','demo','mock',1,2,'ok','agent')",
            "INSERT INTO prompts VALUES (1,'Support','')",
            "INSERT INTO prompt_versions VALUES (1,1,1,'Grounded',2,'now')",
            "INSERT INTO evaluation_datasets VALUES (1,'Dataset')",
            "INSERT INTO evaluation_records VALUES (1,1,'Question?','Reference')",
            "INSERT INTO evaluation_results VALUES (1,'trace','heuristic','{}','{}','','now')",
            "INSERT INTO evaluation_results VALUES (2,'trace','heuristic','{}','{}','','now')",
            "INSERT INTO evaluation_results VALUES (3,'trace','llm_judge','{}','{}','','now')",
            "INSERT INTO experiments VALUES (1,'Compare',1,'demo','now','complete')",
            "INSERT INTO experiment_runs VALUES (1,1,1,1,'trace')",
        ]:
            connection.execute(text(statement))
    command.upgrade(config, 'head')
    with engine.connect() as connection:
        assert connection.execute(text('SELECT evaluation_id FROM experiment_runs')).scalar_one() == 2
    engine.dispose()
