from collections import defaultdict
from statistics import mean
from sqlalchemy import select
from backend.app.analytics.metrics import trace_summary
from backend.app.models.entities import Dataset, DatasetRecord, Evaluation, Experiment, ExperimentRun, Insight, PromptVersion, Span, Trace
from backend.app.services.demo import execute


def run_experiment(db, name, dataset_id, version_ids, provider=False):
    if not 2 <= len(version_ids) <= 4 or len(set(version_ids)) != len(version_ids):
        raise ValueError('Select two to four distinct prompt versions')
    dataset = db.get(Dataset, dataset_id)
    versions = [db.get(PromptVersion, v) for v in version_ids]
    if not dataset or any(v is None for v in versions):
        raise ValueError('Dataset or prompt version does not exist')
    if len({v.prompt_id for v in versions}) != 1:
        raise ValueError('Compare versions of the same prompt')
    records = list(db.scalars(select(DatasetRecord).where(DatasetRecord.dataset_id == dataset_id)))
    if not records:
        raise ValueError('Dataset has no records')
    from backend.app.core.config import settings
    experiment = Experiment(name=name, dataset_id=dataset_id, source='collected' if provider and settings().openai_api_key else 'demo')
    db.add(experiment)
    db.commit()
    # Interleave versions by dataset record to reduce ordering bias.
    try:
        for record in records:
            for version in versions:
                result = execute(db, record.question, version=version, reference=record.reference, provider=provider)
                db.add(ExperimentRun(experiment_id=experiment.id, version_id=version.id, record_id=record.id,
                                     trace_id=result['trace_id'], evaluation_id=result['evaluation_id']))
                db.commit()
        experiment.status = 'complete'
    except Exception:
        db.rollback()
        experiment.status = 'failed'
        db.commit()
        raise
    db.commit()
    report = compare(db, experiment)
    if len(report['versions']) >= 2:
        baseline = report['versions'][0]
        for candidate in report['versions'][1:]:
            a, b = baseline['faithfulness'], candidate['faithfulness']
            if report['paired'] and a is not None and b is not None and b < a - .05:
                tid = candidate['traces'][0]
                db.add(Insight(trace_id=tid, rule=f'regression:{experiment.id}', title='Prompt faithfulness regression', severity='high', category='quality',
                               evidence={'experiment_id': experiment.id, 'baseline': a, 'candidate': b, 'method': 'heuristic'},
                               explanation='Paired dataset runs show a decline greater than 0.05 in lexical support.',
                               action='Review prompt changes and inspect paired answers before accepting the new version.'))
        db.commit()
    return report


def compare(db, experiment):
    runs = list(db.scalars(select(ExperimentRun).where(ExperimentRun.experiment_id == experiment.id).order_by(ExperimentRun.id)))
    groups = defaultdict(list)
    record_sets = defaultdict(set)
    for run in runs:
        trace = db.get(Trace, run.trace_id)
        spans = list(db.scalars(select(Span).where(Span.trace_id == trace.id)))
        summary = trace_summary(trace, spans)
        evaluation = db.get(Evaluation, run.evaluation_id) if run.evaluation_id is not None else None
        groups[run.version_id].append((summary, evaluation.scores if evaluation else {}, run.evaluation_id))
        record_sets[run.version_id].add(run.record_id)
    def avg(values):
        return mean(values) if values and all(v is not None for v in values) else None
    versions = []
    for vid, values in groups.items():
        version = db.get(PromptVersion, vid)
        versions.append(dict(version_id=vid, version=version.version, runs=len(values), successful=sum(t['status'] == 'ok' for t, _, _ in values),
                             latency_ms=avg([t['duration_ms'] for t, _, _ in values]), tokens=avg([t['total_tokens'] for t, _, _ in values]),
                             estimated_cost=avg([t['estimated_cost'] for t, _, _ in values]),
                             answer_relevance=avg([e.get('answer_relevance') for _, e, _ in values]), faithfulness=avg([e.get('faithfulness') for _, e, _ in values]),
                             context_relevance=avg([e.get('context_relevance') for _, e, _ in values]), correctness=avg([e.get('correctness') for _, e, _ in values]),
                             traces=[t['id'] for t, _, _ in values], evaluation_ids=[eid for _, _, eid in values]))
    expected = set(db.scalars(select(DatasetRecord.id).where(DatasetRecord.dataset_id == experiment.dataset_id)))
    paired = bool(record_sets) and len(record_sets) >= 2 and all(s == expected for s in record_sets.values())
    return dict(id=experiment.id, name=experiment.name, dataset_id=experiment.dataset_id, source=experiment.source, status=experiment.status,
                created_at=experiment.created_at, paired=paired, evaluation_method='heuristic', versions=versions)
