import json
import html
import boto3
import botocore
import os
import re
import uuid
from decimal import Decimal
from datetime import datetime, timezone

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(
        connect_timeout=10,
        read_timeout=300,
        retries={'max_attempts': 2}
    )
)

UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
MAX_SCRIPT_CHARS = 16000


def validate_input(event):
    """Validate event inputs."""
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

    segments = event.get('segments', [])
    if not isinstance(segments, list):
        raise ValueError("segments must be a list")

    return video_id, presenter_count, segments


def delete_all_segments_for_video(segment_table, video_id):
    """Delete all segments for a video, handling DynamoDB scan pagination."""
    scan_kwargs = {
        'FilterExpression': 'longVideoEditId = :vid',
        'ExpressionAttributeValues': {':vid': video_id},
        'ProjectionExpression': 'id'
    }

    with segment_table.batch_writer() as batch:
        while True:
            response = segment_table.scan(**scan_kwargs)
            for old in response.get('Items', []):
                batch.delete_item(Key={'id': old['id']})
            if 'LastEvaluatedKey' not in response:
                break
            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    edit_table_name = os.environ["LONG_VIDEO_EDIT_TABLE_NAME"]
    segment_table_name = os.environ["LONG_VIDEO_SEGMENT_TABLE_NAME"]

    video_id, presenter_count, segments = validate_input(event)

    edit_table = dynamodb.Table(edit_table_name)
    segment_table = dynamodb.Table(segment_table_name)

    # Get model ID from edit record
    try:
        edit_record = edit_table.get_item(Key={'id': video_id})
        model_id = edit_record['Item']['modelID']
        owner = edit_record['Item'].get('owner', '')
    except (KeyError, Exception) as e:
        raise ValueError(f"Could not load edit record for {video_id}: {e}")

    # Get transcript
    source_file_key = f"videos/{video_id}/LongVideoTranscript.json"
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.loads(response['Body'].read().decode('utf-8'))

    try:
        script = transcript_json['results']['transcripts'][0]['transcript']
    except (KeyError, IndexError) as e:
        print(f"Warning: could not extract transcript text: {e}")
        script = ""

    script = script[:MAX_SCRIPT_CHARS]

    # Get existing segments and metadata from detect-presenter-boundaries
    boundaries = event.get('boundaries', [])
    speech_ratio_metadata = event.get('speech_ratio_metadata', {})
    visual_analysis = event.get('visual_analysis', [])

    # Use Bedrock to refine segment classification
    refined_segments = analyze_with_bedrock(
        script, segments, boundaries, model_id, presenter_count,
        speech_ratio_metadata, visual_analysis
    )

    # Write-then-Delete pattern: write new segments first, then delete old ones.
    # This prevents data loss if Lambda fails between operations.
    timestamp = datetime.now(timezone.utc).isoformat()[:-6] + "Z"

    # Step 1: Write refined segments
    with segment_table.batch_writer() as batch:
        for seg in refined_segments:
            segment_id = seg.get('id') or str(uuid.uuid4())
            segment_id = str(segment_id)

            start_time = float(seg.get('startTime', 0))
            end_time = float(seg.get('endTime', 0))
            ai_confidence = float(seg.get('aiConfidence', 0.5))

            item = {
                'id': segment_id,
                'longVideoEditId': video_id,
                'startTime': Decimal(str(round(start_time, 3))),
                'endTime': Decimal(str(round(end_time, 3))),
                'speakerLabel': seg.get('speakerLabel') or 'unknown',
                'segmentType': seg.get('segmentType') or 'unknown',
                'includeInOutput': bool(seg.get('includeInOutput', True)),
                'aiConfidence': Decimal(str(round(ai_confidence, 3))),
                'owner': owner,
                'updatedAt': timestamp,
                'createdAt': timestamp,
            }
            batch.put_item(Item=item)

    # Step 2: Delete old segments (written by detect-presenter-boundaries)
    # Only delete segments whose IDs are NOT in the new set
    new_ids = {str(seg.get('id') or '') for seg in refined_segments}
    scan_kwargs = {
        'FilterExpression': 'longVideoEditId = :vid',
        'ExpressionAttributeValues': {':vid': video_id},
        'ProjectionExpression': 'id'
    }
    with segment_table.batch_writer() as batch:
        while True:
            response = segment_table.scan(**scan_kwargs)
            for old in response.get('Items', []):
                if old['id'] not in new_ids:
                    batch.delete_item(Key={'id': old['id']})
            if 'LastEvaluatedKey' not in response:
                break
            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

    return {
        'statusCode': 200,
        'uuid': video_id,
        'segmentCount': len(refined_segments),
    }


def analyze_with_bedrock(script, segments, boundaries, model_id, presenter_count=2,
                         speech_ratio_metadata=None, visual_analysis=None):
    """Use Bedrock to refine segment classification using AI."""
    # Build segment lines with sanitized data
    seg_lines = []
    for i, seg in enumerate(segments):
        speaker = html.escape(str(seg.get('speakerLabel', '?')))[:32]
        start_t = float(seg.get('startTime', 0))
        end_t = float(seg.get('endTime', 0))
        seg_lines.append(
            f"{i}: {start_t:.1f}-{end_t:.1f}s "
            f"speaker={speaker} dur={end_t - start_t:.1f}s"
        )
    segments_text = "\n".join(seg_lines)

    # Use first and last parts of transcript for context
    script_start = script[:4000]
    script_end = script[-4000:] if len(script) > 8000 else ""

    if presenter_count == 1:
        presenter_desc = "1 presenter (single speaker)"
        speaker_instruction = "1. All speech segments belong to presenter1. Keep speakerLabel as 'presenter1' for all presentation segments."
    else:
        presenter_desc = "exactly 2 presenters"
        speaker_instruction = "1. The segments already have speaker labels (presenter1/presenter2) from speech duration analysis. Keep these assignments unless transcript content clearly contradicts them."

    # Build speech ratio context
    ratio_lines = []
    if speech_ratio_metadata:
        for spk, info in speech_ratio_metadata.items():
            if isinstance(info, dict):
                ratio_lines.append(
                    f"  {html.escape(str(spk))} -> {info.get('mapped_label', '?')}: "
                    f"{info.get('total_seconds', 0)}s "
                    f"({info.get('speech_ratio', 0) * 100:.1f}% of total speech)"
                )
    ratio_context = "\n".join(ratio_lines) if ratio_lines else "Not available"

    # Build visual analysis context
    visual_lines = []
    if visual_analysis:
        for va in visual_analysis[:10]:
            v = va.get('visual', {})
            ts = va.get('timestamp', 0)
            visual_lines.append(
                f"  t={float(ts):.1f}s: {v.get('people_count', '?')} people, "
                f"layout={html.escape(str(v.get('layout', '?'))[:30])}, "
                f"transition_visible={v.get('transition_visible', '?')}, "
                f"visual_confidence={html.escape(str(v.get('confidence', '?'))[:10])}"
            )
    visual_context = "\n".join(visual_lines) if visual_lines else "Not available"

    prompt = f"""Below is a webinar/seminar video with {presenter_desc}.

The transcript beginning:
<script_start>{script_start}</script_start>

{"The transcript ending:" if script_end else ""}
{"<script_end>" + script_end + "</script_end>" if script_end else ""}

Here are {len(segments)} detected segments with speaker labels:
<segments>
{segments_text}
</segments>

Speaker change boundaries detected:
<boundaries>{json.dumps(boundaries[:30], indent=1)}</boundaries>

Speaker speech-time analysis (speaker with most total speech is mapped as presenter1):
<speech_ratios>
{ratio_context}
</speech_ratios>

Visual frame analysis at boundary points:
<visual_analysis>
{visual_context}
</visual_analysis>

Content-based presenter identification hints:
- Phrases like "welcome", "good morning", "my name is", "I'll be presenting" near the start strongly indicate the host/presenter1.
- A speaker who only asks short questions is likely audience/moderator, not a main presenter.
- Keep the speech-ratio mapping unless transcript content clearly contradicts it.
- Use visual analysis to boost confidence where transition_visible=True and confidence=high.

Tasks:
{speaker_instruction}
2. Identify non-presentation sections by analyzing transcript content and timing:
   - "intro": opening remarks, greetings, agenda before main content (typically first few minutes)
   - "outro": closing remarks, wrap-up at the end
   - "transition": between-presenter transitions, "thank you, next speaker" moments
   - "qa": Q&A sections (audience questions, discussion)
   - "silence": gaps with no meaningful content
3. For segments already labeled presenter1{'/presenter2' if presenter_count >= 2 else ''}, keep that label unless it's clearly a non-presentation section.
4. Set includeInOutput=false for intro/outro/transition/qa/silence segments.
5. Merge very short segments (<3s) with their neighbors where possible.

Return JSON:
<JSON>
{{
  "segments": [
    {{"id": "existing_id", "startTime": 0.0, "endTime": 30.5, "speakerLabel": "presenter1", "segmentType": "presenter1", "includeInOutput": true, "aiConfidence": 0.9}}
  ]
}}
</JSON>

Important: Return ALL {len(segments)} segments. Keep existing IDs. Respond only with JSON."""

    messages = [{"role": "user", "content": [{"text": prompt}]}]
    system_prompts = [{"text": "You are an expert video editor analyzing webinar recordings to identify presenter segments and non-presentation sections. Be precise with segment classification."}]
    inference_config = {"maxTokens": 16384}
    if "opus" not in model_id:
        inference_config["temperature"] = 0.3

    try:
        response = bedrock.converse(
            modelId=model_id,
            messages=messages,
            system=system_prompts,
            inferenceConfig=inference_config
        )

        # Opus 5 emits a reasoningContent block before the text block, so the
        # text is not always content[0] — collect every text block.
        raw_result = ''.join(
            chunk['text'] for chunk in response['output']['message']['content']
            if 'text' in chunk
        )

        first_index = raw_result.find('{')
        end_index = raw_result.rfind('}')
        if first_index == -1 or end_index == -1:
            print("No JSON found in Bedrock response")
            return segments

        try:
            result = json.loads(raw_result[first_index:end_index + 1])
        except json.JSONDecodeError as json_err:
            print(f"JSON parse error from Bedrock response: {json_err}")
            return segments

        ai_segments = result.get('segments', [])
        if ai_segments:
            return ai_segments

        return segments

    except Exception as e:
        print(f"Error in analyze_with_bedrock: {str(e)}")
        return [{
            'id': seg.get('id') or str(uuid.uuid4()),
            'startTime': seg['startTime'],
            'endTime': seg['endTime'],
            'speakerLabel': seg.get('speakerLabel') or 'unknown',
            'segmentType': seg.get('segmentType') or seg.get('speakerLabel') or 'unknown',
            'includeInOutput': True,
            'aiConfidence': 0.5
        } for seg in segments]
