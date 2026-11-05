from sqlalchemy import select
from backend.app.evaluations.engine import evaluate_trace
from backend.app.models.entities import Evaluation, Experiment, ExperimentRun
from backend.app.services.experiments import compare, run_experiment


def test_later_reevaluation_does_not_change_benchmark(db):
    original = run_experiment(db, 'Pinned quality evidence', 1, [1, 2])
    run = db.scalar(select(ExperimentRun).where(ExperimentRun.experiment_id == original['id']))
    original_id = run.evaluation_id
    assert original_id is not None
    later = evaluate_trace(db, run.trace_id, reference_override='Completely unrelated reference text')
    assert later.id != original_id
    assert later.scores['correctness'] == 0
    updated = compare(db, db.get(Experiment, original['id']))
    assert updated['versions'] == original['versions']
    assert original_id in updated['versions'][0]['evaluation_ids']


def test_missing_pinned_evaluation_stays_unavailable(db):
    report = run_experiment(db, 'Missing evaluation evidence', 1, [1, 2])
    run = db.scalar(select(ExperimentRun).where(ExperimentRun.experiment_id == report['id']))
    run.evaluation_id = None
    db.commit()
    # A later evaluation must never fill an unknown historical measurement.
    evaluate_trace(db, run.trace_id)
    updated = compare(db, db.get(Experiment, report['id']))
    assert updated['versions'][0]['faithfulness'] is None
    assert updated['versions'][0]['evaluation_ids'][0] is None


def test_custom_dataset_is_validated_and_used_for_paired_runs(client):
    data = {'name': '  Account access  ', 'records': [
        {'question': 'How do I reset my password?', 'reference': 'Select Forgot password on the sign-in page.'},
        {'question': 'Where should I store API keys?'}
    ]}
    response = client.post('/api/datasets', json=data)
    assert response.status_code == 201
    dataset = response.json()
    assert dataset['name'] == 'Account access'
    assert dataset['records'][1]['reference'] == ''
    report = client.post('/api/experiments/run', json={
        'name': 'Custom dataset experiment', 'dataset_id': dataset['id'], 'version_ids': [1, 2]
    })
    assert report.status_code == 200
    assert report.json()['paired']
    assert [v['runs'] for v in report.json()['versions']] == [2, 2]
    assert all(len(v['evaluation_ids']) == 2 for v in report.json()['versions'])
    assert all(v['correctness'] is None for v in report.json()['versions'])
    assert client.post('/api/datasets', json=data).status_code == 409
    assert client.post('/api/datasets', json={'name': ' ', 'records': data['records']}).status_code == 422
    assert client.post('/api/datasets', json={'name': 'Empty', 'records': []}).status_code == 422
    assert client.post('/api/datasets', json={'name': 'Repeated questions', 'records': [
        {'question': 'Reset password'}, {'question': ' RESET   password '}
    ]}).status_code == 422


def test_failed_experiment_keeps_prior_runs_and_failed_status(db, monkeypatch):
    from backend.app.services import experiments
    actual = experiments.execute
    count = 0

    def interrupted(*args, **kwargs):
        nonlocal count
        count += 1
        if count == 2:
            raise RuntimeError('Test interrupted execution')
        return actual(*args, **kwargs)

    monkeypatch.setattr(experiments, 'execute', interrupted)
    import pytest
    with pytest.raises(RuntimeError, match='interrupted'):
        run_experiment(db, 'Interrupted experiment', 1, [1, 2])
    experiment = db.scalar(select(Experiment))
    assert experiment.status == 'failed'
    report = compare(db, experiment)
    assert report['paired'] is False
    assert report['versions'][0]['runs'] == 1
