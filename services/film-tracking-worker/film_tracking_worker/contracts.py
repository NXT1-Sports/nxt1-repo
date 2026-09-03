from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


class ContractValidationError(ValueError):
    pass


TRACKING_SCOPES = {"play", "selected_plays", "timeline", "full_video"}
TRACKING_MODES = {"draft", "metric"}
TRACKING_STATUSES = {
    "not_tracked",
    "queued",
    "processing",
    "ready",
    "limited",
    "failed",
    "cancelled",
}
TRACKING_CAPABILITIES = {
    "none",
    "detection_only",
    "tracked_image_space",
    "calibrated_surface",
    "identified_roster",
    "metric_ready",
}
SURFACE_TYPES = {"field", "court", "rink", "diamond", "mat", "pool", "track", "unknown"}
ENTITY_KINDS = {"player", "official", "ball", "coach", "other"}


def validate_tracking_request(payload: Mapping[str, Any]) -> dict[str, Any]:
    file_id = _required_string(payload, "fileId")
    sport = _optional_string(payload, "sport")
    source_id = _optional_string(payload, "sourceId")
    scope = _required_enum(payload, "scope", TRACKING_SCOPES)
    mode = _required_enum(payload, "mode", TRACKING_MODES)
    play_ids = _optional_string_list(payload, "playIds", max_count=200)
    if scope == "play" and not play_ids:
        raise ContractValidationError("play scope requires at least one playId")

    return {
        "fileId": file_id,
        "scope": scope,
        "mode": mode,
        **({"sport": sport} if sport else {}),
        **({"sourceId": source_id} if source_id else {}),
        **({"playIds": play_ids} if play_ids else {}),
    }


def validate_tracking_manifest(payload: Mapping[str, Any]) -> dict[str, Any]:
    if payload.get("schemaVersion") != 1:
        raise ContractValidationError("manifest schemaVersion must be 1")

    manifest_id = _required_string(payload, "id")
    film_review_id = _required_string(payload, "filmReviewId")
    sport = _required_string(payload, "sport")
    surface_type = _required_enum(payload, "surfaceType", SURFACE_TYPES)
    status = _required_enum(payload, "status", TRACKING_STATUSES)
    capability = _required_enum(payload, "capability", TRACKING_CAPABILITIES)
    mode = _required_enum(payload, "mode", TRACKING_MODES)
    time_range = _required_time_range(payload, "timeRange")
    model_bundle = _required_mapping(payload, "modelBundle")
    chunks = _required_sequence(payload, "chunks")
    tracks = _required_sequence(payload, "tracks")

    if capability == "metric_ready" and surface_type == "unknown":
        raise ContractValidationError("metric_ready manifests require a known surfaceType")

    return {
        "schemaVersion": 1,
        "id": manifest_id,
        "filmReviewId": film_review_id,
        "sport": sport,
        "surfaceType": surface_type,
        "status": status,
        "capability": capability,
        "mode": mode,
        "modelBundle": {
            "id": _required_string(model_bundle, "id"),
            "version": _required_string(model_bundle, "version"),
        },
        "timeRange": time_range,
        "chunks": [_validate_chunk_descriptor(chunk) for chunk in chunks],
        "tracks": [_validate_track_summary(track) for track in tracks],
    }


def validate_frame_chunk(payload: Mapping[str, Any]) -> dict[str, Any]:
    manifest_id = _required_string(payload, "manifestId")
    time_range = _required_time_range(payload, "timeRange")
    frames = _required_sequence(payload, "frames")
    normalized_frames = [_validate_frame(frame) for frame in frames]
    timestamps = [frame["timestampSec"] for frame in normalized_frames]
    if timestamps != sorted(timestamps):
        raise ContractValidationError("frame timestamps must be monotonic")

    return {"manifestId": manifest_id, "timeRange": time_range, "frames": normalized_frames}


def _validate_chunk_descriptor(payload: Any) -> dict[str, Any]:
    chunk = _as_mapping(payload, "chunk")
    return {
        "id": _required_string(chunk, "id"),
        "storagePath": _required_string(chunk, "storagePath"),
        "timeRange": _required_time_range(chunk, "timeRange"),
        "frameCount": _required_nonnegative_int(chunk, "frameCount"),
    }


def _validate_track_summary(payload: Any) -> dict[str, Any]:
    track = _as_mapping(payload, "track")
    confidence = _required_confidence(track, "confidence")
    return {
        "trackId": _required_string(track, "trackId"),
        "kind": _required_enum(track, "kind", ENTITY_KINDS),
        "firstSeenSec": _required_nonnegative_number(track, "firstSeenSec"),
        "lastSeenSec": _required_nonnegative_number(track, "lastSeenSec"),
        "confidence": confidence,
    }


def _validate_frame(payload: Any) -> dict[str, Any]:
    frame = _as_mapping(payload, "frame")
    entities = _required_sequence(frame, "entities")
    return {
        "frameIndex": _required_nonnegative_int(frame, "frameIndex"),
        "timestampSec": _required_nonnegative_number(frame, "timestampSec"),
        "entities": [_validate_entity_observation(entity) for entity in entities],
    }


def _validate_entity_observation(payload: Any) -> dict[str, Any]:
    entity = _as_mapping(payload, "entity")
    normalized = {
        "trackId": _required_string(entity, "trackId"),
        "kind": _required_enum(entity, "kind", ENTITY_KINDS),
        "confidence": _required_confidence(entity, "confidence"),
    }
    bounds = entity.get("bounds")
    if bounds is not None:
        normalized["bounds"] = _required_bounds(entity, "bounds")
    return normalized


def _required_string(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ContractValidationError(f"{key} must be a non-empty string")
    return value.strip()


def _optional_string(payload: Mapping[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ContractValidationError(f"{key} must be a non-empty string when provided")
    return value.strip()


def _optional_string_list(
    payload: Mapping[str, Any], key: str, *, max_count: int
) -> list[str] | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ContractValidationError(f"{key} must be a list")
    items = [_required_inline_string(item, key) for item in value]
    if len(items) > max_count:
        raise ContractValidationError(f"{key} cannot exceed {max_count} items")
    return items


def _required_inline_string(value: Any, key: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractValidationError(f"{key} values must be non-empty strings")
    return value.strip()


def _required_enum(payload: Mapping[str, Any], key: str, allowed: set[str]) -> str:
    value = _required_string(payload, key)
    if value not in allowed:
        raise ContractValidationError(f"{key} must be one of {sorted(allowed)}")
    return value


def _required_mapping(payload: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = payload.get(key)
    return _as_mapping(value, key)


def _as_mapping(value: Any, key: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractValidationError(f"{key} must be an object")
    return value


def _required_sequence(payload: Mapping[str, Any], key: str) -> Sequence[Any]:
    value = payload.get(key)
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ContractValidationError(f"{key} must be a list")
    return value


def _required_time_range(payload: Mapping[str, Any], key: str) -> dict[str, float]:
    value = _required_mapping(payload, key)
    start_sec = _required_nonnegative_number(value, "startSec")
    end_sec = _required_nonnegative_number(value, "endSec")
    if end_sec <= start_sec:
        raise ContractValidationError(f"{key}.endSec must be greater than startSec")
    return {"startSec": start_sec, "endSec": end_sec}


def _required_bounds(payload: Mapping[str, Any], key: str) -> dict[str, float]:
    bounds = _required_mapping(payload, key)
    min_x = _required_normalized_number(bounds, "minX")
    min_y = _required_normalized_number(bounds, "minY")
    max_x = _required_normalized_number(bounds, "maxX")
    max_y = _required_normalized_number(bounds, "maxY")
    if max_x <= min_x or max_y <= min_y:
        raise ContractValidationError(f"{key} must have positive width and height")
    return {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y}


def _required_nonnegative_int(payload: Mapping[str, Any], key: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int) or value < 0:
        raise ContractValidationError(f"{key} must be a non-negative integer")
    return value


def _required_nonnegative_number(payload: Mapping[str, Any], key: str) -> float:
    value = payload.get(key)
    if not isinstance(value, int | float) or not _is_finite(value) or value < 0:
        raise ContractValidationError(f"{key} must be a non-negative finite number")
    return float(value)


def _required_normalized_number(payload: Mapping[str, Any], key: str) -> float:
    value = _required_nonnegative_number(payload, key)
    if value > 1:
        raise ContractValidationError(f"{key} must be between 0 and 1")
    return value


def _required_confidence(payload: Mapping[str, Any], key: str) -> float:
    return _required_normalized_number(payload, key)


def _is_finite(value: int | float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))
