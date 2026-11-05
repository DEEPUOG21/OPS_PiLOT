from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database.session import Base


def now():
    return datetime.now(timezone.utc).isoformat()


class Project(Base):
    __tablename__ = 'projects'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str]


class Model(Base):
    __tablename__ = 'models'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(default='openai')


class ModelPricing(Base):
    __tablename__ = 'model_pricing'
    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[str] = mapped_column(ForeignKey('models.id'), index=True)
    input_per_million: Mapped[float]
    output_per_million: Mapped[float]
    currency: Mapped[str] = mapped_column(default='USD')
    effective_at: Mapped[str] = mapped_column(default=now)


class Trace(Base):
    __tablename__ = 'traces'
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    name: Mapped[str]
    source: Mapped[str] = mapped_column(index=True)
    mode: Mapped[str] = mapped_column(default='external')
    start_ns: Mapped[int] = mapped_column(index=True)
    end_ns: Mapped[int]
    status: Mapped[str] = mapped_column(default='ok', index=True)
    execution_type: Mapped[str] = mapped_column(default='workflow')


class Span(Base):
    __tablename__ = 'spans'
    __table_args__ = (Index('ix_span_trace_parent', 'trace_id', 'parent_id'),)
    # Globally unique composite key also avoids collisions between trace-local span IDs.
    id: Mapped[str] = mapped_column(primary_key=True)
    span_id: Mapped[str] = mapped_column(String(16), index=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey('traces.id', ondelete='CASCADE'), index=True)
    parent_id: Mapped[str | None]
    name: Mapped[str]
    kind: Mapped[str] = mapped_column(index=True)
    start_ns: Mapped[int]
    end_ns: Mapped[int]
    status: Mapped[str]
    status_message: Mapped[str] = mapped_column(default='')
    model: Mapped[str | None]
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]
    estimated_cost: Mapped[float | None]
    provider_cost: Mapped[float | None]
    pricing_id: Mapped[int | None] = mapped_column(ForeignKey('model_pricing.id'))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    events: Mapped[list] = mapped_column(JSON, default=list)


class Prompt(Base):
    __tablename__ = 'prompts'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    description: Mapped[str] = mapped_column(default='')


class PromptVersion(Base):
    __tablename__ = 'prompt_versions'
    __table_args__ = (UniqueConstraint('prompt_id', 'version'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    prompt_id: Mapped[int] = mapped_column(ForeignKey('prompts.id'))
    version: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    retrieval_k: Mapped[int] = mapped_column(default=3)
    created_at: Mapped[str] = mapped_column(default=now)


class Dataset(Base):
    __tablename__ = 'evaluation_datasets'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)


class DatasetRecord(Base):
    __tablename__ = 'evaluation_records'
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey('evaluation_datasets.id'), index=True)
    question: Mapped[str] = mapped_column(Text)
    reference: Mapped[str] = mapped_column(Text)


class Evaluation(Base):
    __tablename__ = 'evaluation_results'
    id: Mapped[int] = mapped_column(primary_key=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey('traces.id'), index=True)
    method: Mapped[str]
    scores: Mapped[dict] = mapped_column(JSON)
    explanations: Mapped[dict] = mapped_column(JSON)
    criteria: Mapped[str] = mapped_column(default='')
    created_at: Mapped[str] = mapped_column(default=now)


class Experiment(Base):
    __tablename__ = 'experiments'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    dataset_id: Mapped[int] = mapped_column(ForeignKey('evaluation_datasets.id'))
    source: Mapped[str]
    created_at: Mapped[str] = mapped_column(default=now)
    status: Mapped[str] = mapped_column(default='running')


class ExperimentRun(Base):
    __tablename__ = 'experiment_runs'
    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey('experiments.id'), index=True)
    version_id: Mapped[int] = mapped_column(ForeignKey('prompt_versions.id'))
    record_id: Mapped[int] = mapped_column(ForeignKey('evaluation_records.id'))
    trace_id: Mapped[str] = mapped_column(ForeignKey('traces.id'))
    evaluation_id: Mapped[int | None] = mapped_column(ForeignKey('evaluation_results.id'))


class Insight(Base):
    __tablename__ = 'optimization_insights'
    __table_args__ = (UniqueConstraint('trace_id', 'rule'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey('traces.id'), index=True)
    rule: Mapped[str]
    agent: Mapped[str | None]
    title: Mapped[str]
    severity: Mapped[str]
    category: Mapped[str]
    evidence: Mapped[dict] = mapped_column(JSON)
    explanation: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(default='open')
    created_at: Mapped[str] = mapped_column(default=now)
