import unittest

from film_tracking_worker import (
    ContractValidationError,
    build_draft_tracking_sidecar,
    validate_frame_chunk,
    validate_tracking_manifest,
    validate_tracking_request,
)


class TrackingContractTests(unittest.TestCase):
    def test_validates_tracking_request(self):
        result = validate_tracking_request(
            {
                "fileId": "review-1",
                "sourceId": "wide-1",
                "scope": "play",
                "mode": "draft",
                "sport": "football",
                "playIds": ["play-1"],
            }
        )

        self.assertEqual(result["fileId"], "review-1")
        self.assertEqual(result["scope"], "play")

    def test_rejects_play_scope_without_play_ids(self):
        with self.assertRaises(ContractValidationError):
            validate_tracking_request({"fileId": "review-1", "scope": "play", "mode": "draft"})

    def test_validates_metric_ready_manifest(self):
        result = validate_tracking_manifest(
            {
                "schemaVersion": 1,
                "id": "manifest-1",
                "filmReviewId": "review-1",
                "sport": "football",
                "surfaceType": "field",
                "status": "ready",
                "capability": "metric_ready",
                "mode": "metric",
                "modelBundle": {"id": "football-alpha", "version": "2026.1.0"},
                "timeRange": {"startSec": 10, "endSec": 18},
                "chunks": [
                    {
                        "id": "chunk-10-18",
                        "storagePath": "Teams/team-1/review-1/tracking/chunk-10-18.jsonl.gz",
                        "timeRange": {"startSec": 10, "endSec": 18},
                        "frameCount": 240,
                    }
                ],
                "tracks": [
                    {
                        "trackId": "track-7",
                        "kind": "player",
                        "firstSeenSec": 10,
                        "lastSeenSec": 18,
                        "confidence": 0.92,
                    }
                ],
            }
        )

        self.assertEqual(result["capability"], "metric_ready")

    def test_rejects_metric_ready_unknown_surface(self):
        with self.assertRaises(ContractValidationError):
            validate_tracking_manifest(
                {
                    "schemaVersion": 1,
                    "id": "manifest-1",
                    "filmReviewId": "review-1",
                    "sport": "football",
                    "surfaceType": "unknown",
                    "status": "ready",
                    "capability": "metric_ready",
                    "mode": "metric",
                    "modelBundle": {"id": "football-alpha", "version": "2026.1.0"},
                    "timeRange": {"startSec": 10, "endSec": 18},
                    "chunks": [],
                    "tracks": [],
                }
            )

    def test_validates_frame_chunk_bounds_and_timestamps(self):
        result = validate_frame_chunk(
            {
                "manifestId": "manifest-1",
                "timeRange": {"startSec": 10, "endSec": 11},
                "frames": [
                    {
                        "frameIndex": 300,
                        "timestampSec": 10,
                        "entities": [
                            {
                                "trackId": "track-7",
                                "kind": "player",
                                "bounds": {"minX": 0.1, "minY": 0.2, "maxX": 0.2, "maxY": 0.5},
                                "confidence": 0.9,
                            }
                        ],
                    },
                    {"frameIndex": 301, "timestampSec": 10.033, "entities": []},
                ],
            }
        )

        self.assertEqual(result["frames"][0]["entities"][0]["trackId"], "track-7")

    def test_rejects_non_monotonic_frame_chunk(self):
        with self.assertRaises(ContractValidationError):
            validate_frame_chunk(
                {
                    "manifestId": "manifest-1",
                    "timeRange": {"startSec": 10, "endSec": 11},
                    "frames": [
                        {"frameIndex": 301, "timestampSec": 10.033, "entities": []},
                        {"frameIndex": 300, "timestampSec": 10, "entities": []},
                    ],
                }
            )

    def test_builds_deterministic_draft_sidecar(self):
        result = build_draft_tracking_sidecar(
            {
                "fileId": "review-1",
                "sourceId": "wide-1",
                "scope": "play",
                "mode": "draft",
                "sport": "football",
                "playIds": ["play-1"],
                "timeRange": {"startSec": 10, "endSec": 18},
            }
        )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["capability"], "tracked_image_space")
        self.assertEqual(result["manifest"]["sport"], "football")
        self.assertEqual(len(result["chunks"][0]["frames"]), 3)


if __name__ == "__main__":
    unittest.main()
