"""Unit tests for the detect-presenter-boundaries Lambda (Unit U4, F5a).

Target requirements: AC-4 / AC-4b — speaker→presenter mapping is driven by
total speech duration (most speech == presenter1), with overflow speakers
folding into presenter2 and a presenterCount==1 collapse to presenter1.

These tests are pure unit tests over the module-level functions. No AWS APIs
are called: the boto3 S3 client / DynamoDB resource are only *constructed* at
import time (offline), and the env var reads (BUCKET_NAME, etc.) happen only
inside `lambda_handler`, which is never invoked here. See conftest.py.
"""
import os
import sys

import pytest

# Defensive (conftest.py already does this): make the module importable and
# ensure a region is set before boto3 builds its clients at import time.
if not os.environ.get("AWS_DEFAULT_REGION"):
    os.environ["AWS_DEFAULT_REGION"] = os.environ.get("AWS_REGION") or "us-west-2"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lambda_function as lf  # noqa: E402  (import after sys.path / env setup)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def seg(label, start, end):
    """Build a merged-segment dict in the shape the module produces/consumes."""
    return {"speaker_label": label, "start_time": float(start), "end_time": float(end)}


# --------------------------------------------------------------------------- #
# compute_speech_ratio_mapping  (AC-4 / AC-4b)
# --------------------------------------------------------------------------- #
class TestComputeSpeechRatioMapping:
    def test_speaker_with_more_total_speech_maps_to_presenter1(self):
        """KEY correctness assertion: ranking is by *total* speech duration,
        not by appearance order. spk_b appears second but speaks more in total,
        so spk_b must become presenter1 and spk_a presenter2."""
        segments = [
            seg("spk_a", 0, 10),    # spk_a total = 10s
            seg("spk_b", 10, 25),   # spk_b ...
            seg("spk_b", 25, 40),   # ... total = 30s
        ]
        speaker_map, _ = lf.compute_speech_ratio_mapping(segments, presenter_count=2)
        assert speaker_map["spk_b"] == "presenter1"  # more speech -> presenter1
        assert speaker_map["spk_a"] == "presenter2"

    def test_presenter_count_1_collapses_all_to_presenter1(self):
        segments = [seg("spk_a", 0, 10), seg("spk_b", 10, 30), seg("spk_c", 30, 35)]
        speaker_map, _ = lf.compute_speech_ratio_mapping(segments, presenter_count=1)
        assert speaker_map == {
            "spk_a": "presenter1",
            "spk_b": "presenter1",
            "spk_c": "presenter1",
        }

    def test_three_speakers_third_folds_into_presenter2(self):
        """presenterCount==2 with 3 speakers: top-2 by duration become
        presenter1/presenter2; the 3rd (least speech) folds into presenter2."""
        segments = [
            seg("spk_a", 0, 30),    # 30s -> rank 1
            seg("spk_b", 30, 50),   # 20s -> rank 2
            seg("spk_c", 50, 60),   # 10s -> rank 3 (folds into presenter2)
        ]
        speaker_map, _ = lf.compute_speech_ratio_mapping(segments, presenter_count=2)
        assert speaker_map["spk_a"] == "presenter1"
        assert speaker_map["spk_b"] == "presenter2"
        assert speaker_map["spk_c"] == "presenter2"  # overflow folds in

    @pytest.mark.parametrize("presenter_count", [1, 2])
    def test_single_speaker_maps_to_presenter1(self, presenter_count):
        segments = [seg("spk_a", 0, 12), seg("spk_a", 12, 20)]
        speaker_map, meta = lf.compute_speech_ratio_mapping(segments, presenter_count)
        assert speaker_map == {"spk_a": "presenter1"}
        assert meta["spk_a"]["mapped_label"] == "presenter1"
        assert meta["spk_a"]["speech_ratio"] == pytest.approx(1.0)

    def test_empty_segments_returns_empty_maps(self):
        speaker_map, meta = lf.compute_speech_ratio_mapping([], presenter_count=2)
        assert speaker_map == {}
        assert meta == {}


# --------------------------------------------------------------------------- #
# speech_ratio_metadata
# --------------------------------------------------------------------------- #
class TestSpeechRatioMetadata:
    def test_ratios_sum_to_one_and_labels_match_map(self):
        segments = [
            seg("spk_a", 0, 30),    # 30s
            seg("spk_b", 30, 50),   # 20s
            seg("spk_c", 50, 60),   # 10s  (total 60s)
        ]
        speaker_map, meta = lf.compute_speech_ratio_mapping(segments, presenter_count=2)

        # Ratios are rounded to 3 dp, so allow a small absolute tolerance.
        assert sum(m["speech_ratio"] for m in meta.values()) == pytest.approx(1.0, abs=0.01)

        # Every metadata mapped_label is consistent with the returned speaker_map.
        for spk, m in meta.items():
            assert m["mapped_label"] == speaker_map[spk]

        # total_seconds reflects summed per-speaker durations.
        assert meta["spk_a"]["total_seconds"] == pytest.approx(30.0)
        assert meta["spk_b"]["total_seconds"] == pytest.approx(20.0)
        assert meta["spk_c"]["total_seconds"] == pytest.approx(10.0)

        # Individual ratios match duration / total.
        assert meta["spk_a"]["speech_ratio"] == pytest.approx(0.5, abs=0.001)
        assert meta["spk_b"]["speech_ratio"] == pytest.approx(0.333, abs=0.001)
        assert meta["spk_c"]["speech_ratio"] == pytest.approx(0.167, abs=0.001)


# --------------------------------------------------------------------------- #
# validate_input
# --------------------------------------------------------------------------- #
class TestValidateInput:
    VALID_UUID = "12345678-1234-1234-1234-123456789abc"

    def test_valid_uuid_and_presenter_count_passes(self):
        video_id, count = lf.validate_input({"uuid": self.VALID_UUID, "presenterCount": 2})
        assert video_id == self.VALID_UUID
        assert count == 2

    def test_presenter_count_defaults_to_2_when_absent(self):
        _, count = lf.validate_input({"uuid": self.VALID_UUID})
        assert count == 2

    def test_presenter_count_1_is_valid(self):
        _, count = lf.validate_input({"uuid": self.VALID_UUID, "presenterCount": 1})
        assert count == 1

    def test_presenter_count_3_raises_value_error(self):
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": self.VALID_UUID, "presenterCount": 3})

    def test_non_int_presenter_count_raises_value_error(self):
        # A non-numeric string cannot be coerced by int() -> ValueError.
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": self.VALID_UUID, "presenterCount": "not-a-number"})

    def test_bad_uuid_raises_value_error(self):
        with pytest.raises(ValueError):
            lf.validate_input({"uuid": "not-a-uuid", "presenterCount": 2})

    def test_missing_uuid_raises_value_error(self):
        with pytest.raises(ValueError):
            lf.validate_input({"presenterCount": 2})

    def test_uuid_regex_is_generic_shape_not_v4_specific(self):
        """The pattern is a GENERIC 8-4-4-4-12 hex shape, NOT RFC-4122 v4.
        The nil UUID has no v4 version/variant bits and would be rejected by a
        strict v4 validator, but it matches this generic shape -> must pass.
        This asserts the *actual* implemented behavior."""
        nil_uuid = "00000000-0000-0000-0000-000000000000"
        video_id, _ = lf.validate_input({"uuid": nil_uuid, "presenterCount": 1})
        assert video_id == nil_uuid

    def test_uuid_match_is_case_insensitive(self):
        upper_uuid = "ABCDEF12-3456-7890-ABCD-EF1234567890"
        video_id, _ = lf.validate_input({"uuid": upper_uuid, "presenterCount": 1})
        assert video_id == upper_uuid


# --------------------------------------------------------------------------- #
# merge_consecutive_speaker_segments
# --------------------------------------------------------------------------- #
class TestMergeConsecutiveSpeakerSegments:
    def test_empty_returns_empty(self):
        assert lf.merge_consecutive_speaker_segments([]) == []

    def test_same_speaker_within_max_gap_merges(self):
        # gap of 1s (<= max_gap 3) and same speaker -> single merged segment.
        segments = [seg("spk_a", 0, 10), seg("spk_a", 11, 20)]
        merged = lf.merge_consecutive_speaker_segments(segments, max_gap=3.0)
        assert len(merged) == 1
        assert merged[0]["speaker_label"] == "spk_a"
        assert merged[0]["start_time"] == 0
        assert merged[0]["end_time"] == 20

    def test_same_speaker_gap_exceeding_max_gap_not_merged(self):
        # gap of 10s (> max_gap 3); both segments >= 5s so neither is absorbed.
        segments = [seg("spk_a", 0, 10), seg("spk_a", 20, 40)]
        merged = lf.merge_consecutive_speaker_segments(segments, max_gap=3.0)
        assert len(merged) == 2

    def test_short_segment_under_5s_absorbed_into_previous(self):
        # spk_c is only 3s (< 5s) and must fold into the previous (spk_b) segment.
        segments = [
            seg("spk_a", 0, 10),    # 10s, kept
            seg("spk_b", 10, 30),   # 20s, kept (different speaker)
            seg("spk_c", 30, 33),   # 3s (< 5s) -> absorbed into previous
        ]
        merged = lf.merge_consecutive_speaker_segments(segments, max_gap=3.0)
        assert len(merged) == 2
        # The previous segment's end extends to absorb the short tail.
        assert merged[-1]["speaker_label"] == "spk_b"
        assert merged[-1]["end_time"] == 33

    def test_does_not_mutate_input_segments(self):
        original = [seg("spk_a", 0, 10), seg("spk_a", 11, 20)]
        snapshot = [dict(s) for s in original]
        lf.merge_consecutive_speaker_segments(original, max_gap=3.0)
        assert original == snapshot  # function copies; inputs untouched


# --------------------------------------------------------------------------- #
# validate_transcript  (trust-boundary validation)
# --------------------------------------------------------------------------- #
class TestValidateTranscript:
    @staticmethod
    def _valid_transcript():
        return {"results": {"speaker_labels": {"segments": []}, "items": []}}

    def test_valid_transcript_passes(self):
        # Should not raise.
        assert lf.validate_transcript(self._valid_transcript()) is None

    def test_non_dict_raises(self):
        with pytest.raises(ValueError):
            lf.validate_transcript([])

    def test_missing_results_raises(self):
        with pytest.raises(ValueError):
            lf.validate_transcript({})

    def test_missing_speaker_labels_raises(self):
        with pytest.raises(ValueError):
            lf.validate_transcript({"results": {"items": []}})

    def test_missing_items_raises(self):
        with pytest.raises(ValueError):
            lf.validate_transcript({"results": {"speaker_labels": {}}})
