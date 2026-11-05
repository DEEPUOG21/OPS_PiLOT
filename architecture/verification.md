# Verification record

Observed on 2026-11-05. Exact timings and counts change as new workflows run.

| Phase | Main files | Verification / decision |
|---|---|---|
| 1 · scaffold | `.env.example`, requirements, directory boundaries, `architecture/implementation.md` | Empty repository inspected; modular monolith chosen |
| 2 · schema | `models/entities.py`, database session, Alembic migration | Fresh upgrade/downgrade/re-upgrade and index test pass |
| 3 · instrumentation | `instrumentation/opspilot_sdk`, `ingestion/otlp.py`, OTLP route | JSON, protobuf, gzip, retry identity, parent relationships and propagation tests pass |
| 4 · traces | trace routes, `Traces.tsx`, `TraceDetail.tsx` | API source/filter validation and waterfall selection/collapse tests pass |
| 5 · analytics | `analytics/metrics.py`, Overview/Performance/Costs pages | Pricing snapshots, separate provider cost, missing usage, nested counting, percentile tests pass |
| 6 · sample app | `sample_ai_app`, demo exporter/service | Seven scenarios execute; real HTTP sample export returns stored eight-span trace |
| 7 · evaluation | `evaluations/engine.py`, Evaluations page | Heuristic/reference logic, low-quality signals, stored trace links pass; no-key judge fails clearly |
| 8 · prompts | experiment service, prompt routes/page, benchmark script | Four-record paired versions measured, report generated; component submits selected IDs |
| 9 · intelligence | insights service, Agents/Insights pages | Failure/repeated-call/weak-support evidence, idempotency, review status tests pass |
| 10 · frontend | React components, hooks, styles, Vite/Tailwind | TypeScript and production build pass; seven component interaction tests pass |
| 11 · quality/docs | tests, README, architecture docs | 20 backend tests plus 7 component tests pass at this checkpoint |
| 12 · local deployment | Dockerfiles, Nginx, Compose tunnel profile | Native backend/frontend/sample start and HTTP checks pass; container/tunnel execution unavailable |

## End-to-end observations

- Backend `/health` returns 200 and `service=opspilot` on port 8001.
- Vite index and API proxy return 200 on port 5173.
- A POST to the independently running sample on port 8002 returns a mock answer
  and trace ID. GET through the backend returns that trace with eight stored
  spans, proving actual HTTP protobuf export and ingestion.
- The first clean demo run stored seven traces: six completed without recorded
  errors and one retained the injected tool failure.
- A paired four-record benchmark ran both prompt versions. Values shown by the
  app/report are read from those runs. There are no inserted improvement claims.

## Verification limits

- Browser connector was unavailable. Native Chrome observation timed out waiting
  for app access. No rendered screenshot or visual-layout QA is claimed.
- Docker and cloudflared executables are absent from this environment. Compose
  and temporary-tunnel configuration are supplied, but neither container builds
  nor public exposure were executed.
- No successful live provider call or paid judge evaluation is claimed. Offline
  tests isolate provider credentials; provider and judge request logic can be
  exercised with a configured compatible model.
- These notes are a verification record, not a production certification. See
  README limitations for scale, evaluation, identity, and privacy boundaries.

## Continued verification

- Added immutable custom datasets in the API and Prompts & experiments screen.
  Creation, selection, reference handling, duplicate validation, and paired
  execution are covered by tests.
- Experiment runs now link to their original evaluation. A regression test
  reruns an evaluation with an unrelated reference and confirms that the original
  benchmark remains unchanged. Unknown evidence stays unavailable.
- Added migration 0002, including a legacy-report backfill test. The local SQLite
  database was backed up with SQLite's online backup API before applying it.
- Interrupted experiments preserve prior runs and a failed status.
- Current suite: **25 backend tests and 9 frontend interaction tests**, all pass.
  Production build passes. Browser connector is still unavailable.

## Public-showcase preparation

- Added same-origin FastAPI serving for the built React dashboard, including SPA
  deep links, immutable asset caching, and JSON 404s for unknown API requests.
- Added a single-service Dockerfile, Render Blueprint, platform-port entrypoint,
  and public mock-only mode. Provider calls and external ingestion are blocked
  in the showcase even if a provider key were accidentally configured.
- Backend suite now includes **28 passing tests**. The frontend production build
  passes, and `render.yaml` validates against Render's current official schema.
- Remote deployment status is recorded separately after the hosting operation;
  configuration and local checks do not constitute a public deployment.
