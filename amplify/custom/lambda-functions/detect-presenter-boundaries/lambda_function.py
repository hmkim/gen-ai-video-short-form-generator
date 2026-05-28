import json
import boto3
import os
import re
import uuid
from decimal import Decimal

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def validate_input(event):
    """Validate event inputs to prevent injection and ensure data integrity."""
    video_id = event.get('uuid', '')
    if not isinstance(video_id, str) or not UUID_PATTERN.match(video_id):
        raise ValueError(f"Invalid uuid format: {video_id!r}")

    raw_count = event.get('presenterCount', 2)
    try:
        presenter_count = int(raw_count)
    except (TypeError, ValueError):
        raise ValueError(f"presenterCount must be an integer, got {type(raw_count)}")
    if presenter_count not in (1, 2):
        raise ValueError(f"presenterCount must be 1 or 2, got {presenter_count}")

    return video_id, presenter_count


def validate_transcript(transcript_json):
    """Validate transcript JSON structure before processing."""
    if not isinstance(transcript_json, dict):
        raise ValueError("Transcript JSON must be a dictionary")
    results = transcript_json.get('results')
    if not isinstance(results, dict):
        raise ValueError("Transcript missing 'results' key")
    if 'speaker_labels' not in results:
        raise ValueError("Transcript missing speaker_labels (speaker diarization not enabled)")
    if 'items' not in results:
        raise ValueError("Transcript missing 'items' key")


def detect_silence_gaps(transcript_json, min_gap_seconds=2.0):
    """Detect silence gaps between speech segments from Transcribe output."""
    items = transcript_json.get('results', {}).get('items', [])

    gaps = []
    prev_end = 0.0

    for item in items:
        if 'start_time' not in item:
            continue
        start = float(item['start_time'])
        end = float(item['end_time'])

        if start - prev_end >= min_gap_seconds:
            gaps.append({
                'start': prev_end,
                'end': start,
                'duration': start - prev_end
            })
        prev_end = max(prev_end, end)

    return gaps


def extract_speaker_segments(transcript_json):
    """Extract speaker-labeled segments from Transcribe speaker diarization output."""
    segments_data = transcript_json.get('results', {}).get('speaker_labels', {}).get('segments', [])

    speaker_segments = []
    for seg in segments_data:
        speaker_label = seg.get('speaker_label', 'unknown')
        items = seg.get('items', [])
        if not items:
            continue

        start_time = float(items[0].get('start_time', 0))
        end_time = float(items[-1].get('end_time', 0))

        speaker_segments.append({
            'speaker_label': speaker_label,
            'start_time': start_time,
            'end_time': end_time,
        })

    return speaker_segments


def merge_consecutive_speaker_segments(speaker_segments, max_gap=3.0):
    """Merge consecutive segments from the same speaker.
    Also merge very short segments (<5s) into the previous segment."""
    if not speaker_segments:
        return []

    merged = [speaker_segments[0].copy()]

    for seg in speaker_segments[1:]:
        last = merged[-1]
        if (seg['speaker_label'] == last['speaker_label']
                and seg['start_time'] - last['end_time'] <= max_gap):
            last['end_time'] = seg['end_time']
        else:
            merged.append(seg.copy())

    # Second pass: absorb very short segments (<5s) into neighbors
    if len(merged) > 1:
        final = [merged[0]]
        for seg in merged[1:]:
            duration = seg['end_time'] - seg['start_time']
            if duration < 5.0 and final:
                final[-1]['end_time'] = seg['end_time']
            else:
                final.append(seg)
        merged = final

    return merged


def detect_boundaries(transcript_json):
    """Combine silence detection and speaker diarization to find presenter boundaries."""
    silence_gaps = detect_silence_gaps(transcript_json, min_gap_seconds=3.0)
    speaker_segments = extract_speaker_segments(transcript_json)
    merged_segments = merge_consecutive_speaker_segments(speaker_segments)

    boundaries = []
    for i in range(len(merged_segments) - 1):
        curr = merged_segments[i]
        next_seg = merged_segments[i + 1]

        if curr['speaker_label'] != next_seg['speaker_label']:
            gap_start = curr['end_time']
            gap_end = next_seg['start_time']

            is_silence_gap = any(
                g['start'] <= gap_start + 0.5 and g['end'] >= gap_end - 0.5
                for g in silence_gaps
            )

            boundaries.append({
                'time': (gap_start + gap_end) / 2,
                'from_speaker': curr['speaker_label'],
                'to_speaker': next_seg['speaker_label'],
                'gap_duration': gap_end - gap_start,
                'has_silence': is_silence_gap,
                'confidence': 0.9 if is_silence_gap else 0.7
            })

    return merged_segments, boundaries


def compute_speech_ratio_mapping(merged_segments, presenter_count):
    """Map speakers based on total speech duration (most speech = presenter1).

    Constraints:
    - presenterCount is always 1 or 2 (validated upstream)
    - If presenterCount=1, all speakers map to presenter1
    - If presenterCount=2, top 2 speakers by duration are mapped; others fold into presenter2
    """
    speech_durations = {}
    for seg in merged_segments:
        lbl = seg['speaker_label']
        speech_durations[lbl] = speech_durations.get(lbl, 0.0) + (seg['end_time'] - seg['start_time'])

    ranked_speakers = sorted(speech_durations.keys(), key=lambda s: speech_durations[s], reverse=True)

    speaker_map = {}
    if presenter_count == 1:
        for spk in ranked_speakers:
            speaker_map[spk] = 'presenter1'
    elif presenter_count == 2:
        if len(ranked_speakers) >= 2:
            speaker_map[ranked_speakers[0]] = 'presenter1'
            speaker_map[ranked_speakers[1]] = 'presenter2'
            for spk in ranked_speakers[2:]:
                speaker_map[spk] = 'presenter2'
        elif len(ranked_speakers) == 1:
            speaker_map[ranked_speakers[0]] = 'presenter1'

    total_speech = sum(speech_durations.values()) or 1.0
    speech_ratio_metadata = {
        spk: {
            'mapped_label': speaker_map.get(spk, 'unknown'),
            'total_seconds': round(speech_durations[spk], 2),
            'speech_ratio': round(speech_durations[spk] / total_speech, 3),
        }
        for spk in ranked_speakers
    }

    return speaker_map, speech_ratio_metadata


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    segment_table_name = os.environ["LONG_VIDEO_SEGMENT_TABLE_NAME"]

    video_id, presenter_count = validate_input(event)

    source_file_key = f"videos/{video_id}/LongVideoTranscript.json"

    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.loads(response['Body'].read().decode('utf-8'))

    validate_transcript(transcript_json)

    merged_segments, boundaries = detect_boundaries(transcript_json)

    segment_table = dynamodb.Table(segment_table_name)

    speaker_map, speech_ratio_metadata = compute_speech_ratio_mapping(merged_segments, presenter_count)

    segments_output = []
    owner = event.get('owner', '')

    with segment_table.batch_writer() as batch:
        for seg in merged_segments:
            mapped_speaker = speaker_map.get(seg['speaker_label'], 'unknown')
            segment_id = str(uuid.uuid4())

            item = {
                'id': segment_id,
                'longVideoEditId': video_id,
                'startTime': Decimal(str(round(seg['start_time'], 3))),
                'endTime': Decimal(str(round(seg['end_time'], 3))),
                'speakerLabel': mapped_speaker,
                'segmentType': mapped_speaker,
                'includeInOutput': True,
                'aiConfidence': Decimal(str(0.8)),
                'owner': owner,
                'updatedAt': event.get('timestamp', ''),
                'createdAt': event.get('timestamp', ''),
            }
            batch.put_item(Item=item)

            segments_output.append({
                'id': segment_id,
                'startTime': seg['start_time'],
                'endTime': seg['end_time'],
                'speakerLabel': mapped_speaker,
                'segmentType': mapped_speaker,
            })

    return {
        'statusCode': 200,
        'segments': segments_output,
        'boundaries': boundaries,
        'speaker_map': speaker_map,
        'speech_ratio_metadata': speech_ratio_metadata,
        'presenterCount': presenter_count,
        'uuid': video_id,
    }
