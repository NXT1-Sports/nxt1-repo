# NXT1 Film Tracking Worker

Contract-first Python package for the future GCP Cloud Run GPU film tracking
worker.

This initial slice intentionally has no third-party runtime dependency so it can
be validated in the current workspace. The production worker will add the HTTP
server and model runtime after the model bill of materials, golden dataset, and
Cloud Run container decisions are finalized.

Responsibilities:

- Validate tracking job requests from the Node backend.
- Validate tracking manifests and frame chunks before upload/storage.
- Preserve the same capability and confidence semantics defined in `@nxt1/core`.
- Keep unsupported or uncalibrated sources honest by returning lower capability
  levels instead of fabricating metrics.
- Serve a `POST /track` endpoint that currently emits deterministic draft
  sidecars; real detector/tracker adapters plug into the same contract.

Local validation:

```bash
python3 -m unittest discover services/film-tracking-worker -v
```

Optional local server after installing dependencies:

```bash
python3 -m pip install -r services/film-tracking-worker/requirements.txt
python3 -m uvicorn film_tracking_worker.server:app --app-dir services/film-tracking-worker --host 0.0.0.0 --port 8080
```
