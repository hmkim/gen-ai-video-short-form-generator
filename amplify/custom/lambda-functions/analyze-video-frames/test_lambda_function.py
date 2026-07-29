"""Unit tests for the analyze-video-frames Lambda (Unit U5, F5b — Vision opt-in).

Covers the pure, cost/safety-critical logic:
- input validation (uuid / presenterCount / boundaries),
- S3 key prefix forcing (path-traversal prevention),
- boundary selection (transition-only, lowest-confidence-first, MAX_BOUNDARIES cap).

No AWS APIs are called: the boto3 clients are only *constructed* at import time
(offline). FFmpeg / Bedrock / S3 network paths are not exercised here — those
require sandbox-deploy validation. See conftest.py.
"""
import os
import sys

import pytest

if not os.environ.get("AWS_DEFAULT_REGION"):
    os.environ["AWS_DEFAULT_REGION"] = os.environ.get("AWS_REGION") or "us-west-2"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lambda_function as lf  # noqa: E402  (import after sys.path / env setup)


VALID_UUID = "12345678-1234-1234-1234-1234567890ab"


def boundary(time, from_speaker, to_speaker, confidence):
    return {
        "time": time,
        "from_speaker": from_speaker,
        "to_speaker": to_speaker,
        "confidence": confidence,
    }


# --------------------------------------------------------------------------- #
# validate_input
# --------------------------------------------------------------------------- #
class TestValidateInput:
    def test_valid_event_returns_parsed_tuple(self):
        event = {"uuid": VALID_UUID, "presenterCount": "2", "boundaries": []}
        video_id, presenter_count, boundaries = lf.validate_input(event)
        assert video_id == VALID_UUID
        assert presenter_count == 2
        assert boundaries == []

    def test_invalid_uuid_raises(self):
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": "not-a-uuid", "boundaries": []})

    def test_uuid_with_traversal_chars_raises(self):
        # A path-traversal attempt must fail uuid validation before key building.
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": "../../etc/passwd", "boundaries": []})

    def test_presenter_count_out_of_range_raises(self):
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": VALID_UUID, "presenterCount": 3, "boundaries": []})

    def test_boundaries_not_a_list_raises(self):
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": VALID_UUID, "boundaries": {"not": "a list"}})


# --------------------------------------------------------------------------- #
# build_video_key  (path-traversal prevention)
# --------------------------------------------------------------------------- #
class TestBuildVideoKey:
    def test_key_is_forced_under_video_prefix(self):
        key = lf.build_video_key(VALID_UUID)
        assert key == f"videos/{VALID_UUID}/{lf.RAW_VIDEO_FILENAME}"
        assert key.startswith(f"videos/{VALID_UUID}/")


# --------------------------------------------------------------------------- #
# select_boundaries  (cost cap + selection rules)
# --------------------------------------------------------------------------- #
class TestSelectBoundaries:
    def test_same_speaker_edges_are_excluded(self):
        boundaries = [
            boundary(10.0, "spk_a", "spk_a", 0.5),   # no transition -> excluded
            boundary(20.0, "spk_a", "spk_b", 0.7),   # transition -> kept
        ]
        selected = lf.select_boundaries(boundaries)
        assert len(selected) == 1
        assert selected[0]["time"] == 20.0

    def test_lowest_confidence_first(self):
        boundaries = [
            boundary(10.0, "spk_a", "spk_b", 0.9),
            boundary(20.0, "spk_b", "spk_a", 0.3),
            boundary(30.0, "spk_a", "spk_b", 0.6),
        ]
        selected = lf.select_boundaries(boundaries)
        confidences = [b["confidence"] for b in selected]
        assert confidences == [0.3, 0.6, 0.9]  # ascending: lowest first

    def test_caps_at_max_boundaries(self):
        boundaries = [
            boundary(float(i), "spk_a", "spk_b", 0.5) for i in range(25)
        ]
        selected = lf.select_boundaries(boundaries)
        assert len(selected) == lf.MAX_BOUNDARIES

    def test_negative_and_malformed_times_are_skipped(self):
        boundaries = [
            boundary(-5.0, "spk_a", "spk_b", 0.4),       # negative time -> skip
            {"from_speaker": "spk_a", "to_speaker": "spk_b", "confidence": 0.4},  # no time -> skip
            boundary(15.0, "spk_a", "spk_b", 0.4),       # valid -> kept
            "not-a-dict",                                # malformed -> skip
        ]
        selected = lf.select_boundaries(boundaries)
        assert len(selected) == 1
        assert selected[0]["time"] == 15.0

    def test_empty_input_returns_empty(self):
        assert lf.select_boundaries([]) == []
