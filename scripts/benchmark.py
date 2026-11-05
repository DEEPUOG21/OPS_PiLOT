"""Generate a real paired benchmark and retain its report."""
import json
from pathlib import Path
from backend.app.database.session import SessionLocal
from backend.app.main import migrate
from backend.app.services.demo import initialize
from backend.app.services.experiments import run_experiment

if __name__ == '__main__':
    migrate()
    with SessionLocal() as db:
        initialize(db)
        report = run_experiment(db, 'Support baseline vs optimized', 1, [1, 2])
    target = Path('demo_data/benchmark-report.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Saved {target}. Source: {report["source"]}; paired: {report["paired"]}')
