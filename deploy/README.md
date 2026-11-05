# Public GitHub showcase

**Live demo: https://opspilot-showcase.onrender.com**

Hosted as a free Docker web service in Singapore. The source is published at
https://github.com/DEEPUOG21/OPS_PiLOT.

`deploy/Dockerfile` builds React and serves its bundle from FastAPI. The API,
SPA routes, assets, and Swagger documentation all use the same public origin.
`render.yaml` defines one web service on Render's free compute plan, without
a database service or paid disk. No provider key is required.

## Behavior

- `SHOWCASE_MODE=true` forces public workflow requests to use mocks. Direct
  provider requests, paid LLM judging, and external OTLP ingestion are rejected.
- Empty workspaces execute the seven scenarios and a paired prompt benchmark.
- Trace inspection, heuristic evaluation, custom datasets, prompt comparisons,
  and insight review remain interactive.
- Data is shared demonstration data. Do not enter secrets or personal data.
- Render's free filesystem is ephemeral. Data resets on restart, redeploy,
  or idle spin-down. Startup recreates the demo. The assigned service URL
  remains stable while the service exists.
- Free services sleep after inactivity; the first request may wait for startup.
  See [Render's documented limits](https://render.com/docs/free).

## Deploy from the repository

1. Push the application, `deploy/Dockerfile`, and `render.yaml` to
   `https://github.com/DEEPUOG21/OPS_PiLOT`.
2. Create a Render Blueprint from that repository. Review the single free web
   service and apply it. Alternatively create a Docker web service from `main`,
   using `deploy/Dockerfile`, context `.`, and the environment in `render.yaml`.
3. Wait for the deploy to be live, then verify `/health`, `/api/analytics/overview`,
   `/`, and a directly loaded SPA route such as `/traces`.
4. Add the actual verified HTTPS URL to the GitHub repository's Website field
   and README. The assigned URL is returned by Render; it is not inferred from
   the requested service name.

Blueprint structure is validated against the official Render JSON Schema.
Docker execution still needs a Docker-capable host; local verification runs
the same FastAPI entrypoint with the built frontend bundle.

## Full workspace deployments

The root Docker Compose configuration remains suitable for a private workspace
with a persistent SQLite volume and separate sample application. Set
`SHOWCASE_MODE=false` for that environment. Public showcase settings do not
change the local development defaults.
