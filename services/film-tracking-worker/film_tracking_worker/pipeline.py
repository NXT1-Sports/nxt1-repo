from __future__ import annotations

from hashlib import sha256
from typing import Any

from .contracts import validate_frame_chunk, validate_tracking_manifest, validate_tracking_request


def build_draft_tracking_sidecar(payload: dict[str, Any]) -> dict[str, Any]:
    request = validate_tracking_request(payload)
    time_range = _resolve_time_range(payload)
    source_id = request.get("sourceId")
    sport = request.get("sport", "unknown")
    manifest_id = _stable_id("manifest", request["fileId"], source_id or "primary", time_range)
    chunk_id = _stable_id("chunk", manifest_id, time_range)
    chunk_storage_path = _build_chunk_storage_path(request["fileId"], source_id, chunk_id)
    manifest_storage_path = _build_manifest_storage_path(request["fileId"], source_id, manifest_id)

    frames = _build_deterministic_frames(time_range)
    manifest = {
        "schemaVersion": 1,
        "id": manifest_id,
        "filmReviewId": request["fileId"],
        **({"sourceId": source_id} if source_id else {}),
        "sport": sport,
        "surfaceType": _surface_type_for_sport(sport),
        "status": "ready",
        "capability": "tracked_image_space",
        "mode": request["mode"],
        "modelBundle": {
            "id": "nxt1-deterministic-draft",
            "version": "2026.09.02-contract",
            "detector": "deterministic-fixture",
            "tracker": "deterministic-fixture",
        },
        "generatedAt": payload.get("generatedAt", "2026-09-02T00:00:00.000Z"),
        "timeRange": time_range,
        "fps": 2,
        "totalFrameCount": len(frames),
        "chunks": [
            {
                "id": chunk_id,
                "storagePath": chunk_storage_path,
                "timeRange": time_range,
                "frameCount": len(frames),
            }
        ],
        "tracks": [
            {
                "trackId": "track-home-1",
                "kind": "player",
                "teamSide": "home",
                "positionCandidates": [{"value": "Wide Receiver", "confidence": 0.62, "source": "model"}],
                "firstSeenSec": time_range["startSec"],
                "lastSeenSec": time_range["endSec"],
                "confidence": 0.7,
            },
            {
                "trackId": "track-away-1",
                "kind": "player",
                "teamSide": "away",
                "positionCandidates": [{"value": "Cornerback", "confidence": 0.6, "source": "model"}],
                "firstSeenSec": time_range["startSec"],
                "lastSeenSec": time_range["endSec"],
                "confidence": 0.68,
            },
        ],
    }
    chunk = {"manifestId": manifest_id, "timeRange": time_range, "frames": frames}

    validate_tracking_manifest(manifest)
    validate_frame_chunk(chunk)

    return {
        "status": "ready",
        "capability": "tracked_image_space",
        "manifestStoragePath": manifest_storage_path,
        "manifest": manifest,
        "chunks": [{"storagePath": chunk_storage_path, "frames": frames}],
    }


def _resolve_time_range(payload: dict[str, Any]) -> dict[str, float]:
    raw = payload.get("timeRange")
    if isinstance(raw, dict):
        start_sec = raw.get("startSec", 0)
        end_sec = raw.get("endSec", 10)
    else:
        start_sec = payload.get("startSec", 0)
        end_sec = payload.get("endSec", 10)
    if not isinstance(start_sec, int | float) or not isinstance(end_sec, int | float):
        raise ValueError("timeRange values must be numeric")
    if end_sec <= start_sec:
        raise ValueError("timeRange.endSec must be greater than startSec")
    return {"startSec": float(start_sec), "endSec": float(end_sec)}


def _build_deterministic_frames(time_range: dict[str, float]) -> list[dict[str, Any]]:
    start_sec = time_range["startSec"]
    end_sec = time_range["endSec"]
    mid_sec = start_sec + ((end_sec - start_sec) / 2)
    return [
        {
            "frameIndex": 0,
            "timestampSec": start_sec,
            "entities": [
                _entity("track-home-1", "home", 0.35, 0.48),
                _entity("track-away-1", "away", 0.45, 0.48),
            ],
        },
        {
            "frameIndex": 1,
            "timestampSec": mid_sec,
            "entities": [
                _entity("track-home-1", "home", 0.52, 0.44),
                _entity("track-away-1", "away", 0.58, 0.45),
            ],
        },
        {
            "frameIndex": 2,
            "timestampSec": end_sec,
            "entities": [
                _entity("track-home-1", "home", 0.72, 0.38),
                _entity("track-away-1", "away", 0.76, 0.39),
            ],
        },
    ]


def _entity(track_id: str, team_side: str, x: float, y: float) -> dict[str, Any]:
    return {
        "trackId": track_id,
        "kind": "player",
        "teamSide": team_side,
        "center": {"x": x, "y": y},
        "bounds": {"minX": x - 0.025, "minY": y - 0.08, "maxX": x + 0.025, "maxY": y + 0.08},
        "surfacePoint": {"x": x, "y": y, "unit": "normalized"},
        "confidence": 0.7,
    }


def _stable_id(prefix: str, *parts: Any) -> str:
    digest = sha256("|".join(str(part) for part in parts).encode("utf8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def _build_manifest_storage_path(file_id: str, source_id: str | None, manifest_id: str) -> str:
    source_part = source_id or "primary"
    return f"film-tracking/{file_id}/{source_part}/{manifest_id}.manifest.json"


def _build_chunk_storage_path(file_id: str, source_id: str | None, chunk_id: str) -> str:
    source_part = source_id or "primary"
    return f"film-tracking/{file_id}/{source_part}/{chunk_id}.jsonl"


def _surface_type_for_sport(sport: str) -> str:
    normalized = sport.strip().lower().replace(" ", "_")
    if normalized in {"football", "american_football", "flag_football", "soccer", "lacrosse", "field_hockey"}:
        return "field"
    if normalized.startswith("basketball") or normalized in {"volleyball", "tennis"}:
        return "court"
    if normalized in {"baseball", "softball"}:
        return "diamond"
    if normalized in {"ice_hockey", "hockey"}:
        return "rink"
    return "unknown"
