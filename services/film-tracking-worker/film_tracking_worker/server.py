from __future__ import annotations

try:
    from fastapi import FastAPI, HTTPException
except ModuleNotFoundError as exc:  # pragma: no cover - exercised only without optional deps
    raise RuntimeError(
        "FastAPI dependencies are not installed. Run `python3 -m pip install -r "
        "services/film-tracking-worker/requirements.txt` before starting the server."
    ) from exc

from .contracts import ContractValidationError
from .pipeline import build_draft_tracking_sidecar

app = FastAPI(title="NXT1 Film Tracking Worker", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/track")
def track(payload: dict) -> dict:
    try:
        return build_draft_tracking_sidecar(payload)
    except (ContractValidationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
