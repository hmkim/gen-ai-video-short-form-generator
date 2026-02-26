import json
import boto3
import os
import uuid
from decimal import Decimal

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')


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
        # Merge same-speaker segments with small gaps
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
                # Absorb into previous segment
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


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    segment_table_name = os.environ["LONG_VIDEO_SEGMENT_TABLE_NAME"]

    video_id = event['uuid']
    source_file_key = f"videos/{video_id}/LongVideoTranscript.json"

    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.loads(response['Body'].read().decode('utf-8'))

    merged_segments, boundaries = detect_boundaries(transcript_json)

    segment_table = dynamodb.Table(segment_table_name)

    # Identify unique speakers (we assume exactly 2 presenters)
    speakers = list(set(seg['speaker_label'] for seg in merged_segments))
    speaker_map = {}
    if len(speakers) >= 2:
        speaker_map[speakers[0]] = 'presenter1'
        speaker_map[speakers[1]] = 'presenter2'
    elif len(speakers) == 1:
        speaker_map[speakers[0]] = 'presenter1'

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
        'uuid': video_id,
    }
