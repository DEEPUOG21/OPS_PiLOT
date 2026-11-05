"""Pin experiment quality evidence instead of following later reevaluations."""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('experiment_runs') as batch:
        batch.add_column(sa.Column('evaluation_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_experiment_run_evaluation', 'evaluation_results', ['evaluation_id'], ['id'])
    # Preserve the reports visible at migration time. Earlier historical choices
    # cannot be reconstructed; subsequent reevaluations will no longer change them.
    op.execute(sa.text("""
        UPDATE experiment_runs
        SET evaluation_id = (
            SELECT id FROM evaluation_results
            WHERE trace_id = experiment_runs.trace_id AND method = 'heuristic'
            ORDER BY id DESC LIMIT 1
        )
    """))


def downgrade():
    with op.batch_alter_table('experiment_runs') as batch:
        batch.drop_constraint('fk_experiment_run_evaluation', type_='foreignkey')
        batch.drop_column('evaluation_id')
