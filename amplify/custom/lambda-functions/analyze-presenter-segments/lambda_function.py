import json
import boto3
import botocore
import os
import uuid
from decimal import Decimal

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    edit_table_name = os.environ["LONG_VIDEO_EDIT_TABLE_NAME"]
    segment_table_name = os.environ["LONG_VIDEO_SEGMENT_TABLE_NAME"]

    video_id = event['uuid']
    source_file_key = f"videos/{video_id}/LongVideoTranscript.json"

    edit_table = dynamodb.Table(edit_table_name)
    segment_table = dynamodb.Table(segment_table_name)

    # Get model ID from edit record
    edit_record = edit_table.get_item(Key={'id': video_id})
    model_id = edit_record['Item']['modelID']
    owner = edit_record['Item'].get('owner', '')

    # Get transcript
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.loads(response['Body'].read().decode('utf-8'))
    script = transcript_json['results']['transcripts'][0]['transcript']

    # Get existing segments from DetectPresenterBoundaries
    segments = event.get('segments', [])
    boundaries = event.get('boundaries', [])

    # Use Bedrock to refine segment classification
    refined_segments = analyze_with_bedrock(
        script, segments, boundaries, model_id
    )

    # Update segments in DDB
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).isoformat()[:-6] + "Z"

    with segment_table.batch_writer() as batch:
        for seg in refined_segments:
            segment_id = seg.get('id', str(uuid.uuid4()))
            item = {
                'id': segment_id,
                'longVideoEditId': video_id,
                'startTime': Decimal(str(round(seg['startTime'], 3))),
                'endTime': Decimal(str(round(seg['endTime'], 3))),
                'speakerLabel': seg.get('speakerLabel', 'unknown'),
                'segmentType': seg.get('segmentType', 'unknown'),
                'includeInOutput': seg.get('includeInOutput', True),
                'aiConfidence': Decimal(str(round(seg.get('aiConfidence', 0.5), 3))),
                'owner': owner,
                'updatedAt': timestamp,
                'createdAt': timestamp,
            }
            batch.put_item(Item=item)

    return {
        'statusCode': 200,
        'uuid': video_id,
        'segmentCount': len(refined_segments),
    }


def analyze_with_bedrock(script, segments, boundaries, model_id):
    """Use Bedrock to refine segment classification using AI.

    The segments already have speaker labels from Transcribe diarization.
    AI's job is to:
    1. Identify intro/outro/transition/qa sections
    2. Determine which Transcribe speaker (spk_0/spk_1) maps to presenter1/presenter2
    3. Mark segments for inclusion/exclusion
    """
    # Build a concise summary of segments with their speaker labels
    seg_lines = []
    for i, seg in enumerate(segments):
        seg_lines.append(
            f"{i}: {seg['startTime']:.1f}-{seg['endTime']:.1f}s "
            f"speaker={seg.get('speakerLabel','?')} "
            f"dur={seg['endTime']-seg['startTime']:.1f}s"
        )
    segments_text = "\n".join(seg_lines)

    # Use first and last parts of transcript for context (intro/outro detection)
    script_start = script[:4000]
    script_end = script[-4000:] if len(script) > 8000 else ""

    prompt = f"""Below is a webinar/seminar video with exactly 2 presenters.

The transcript beginning:
<script_start>{script_start}</script_start>

{"The transcript ending:" if script_end else ""}
{"<script_end>" + script_end + "</script_end>" if script_end else ""}

Here are {len(segments)} detected segments with Transcribe speaker diarization labels:
<segments>
{segments_text}
</segments>

Speaker change boundaries detected:
<boundaries>{json.dumps(boundaries[:30], indent=1)}</boundaries>

Tasks:
1. The segments already have speaker labels (presenter1/presenter2) from Transcribe diarization. Keep these assignments - they are reliable.
2. Identify non-presentation sections by analyzing transcript content and timing:
   - "intro": opening remarks, greetings, agenda before main content (typically first few minutes)
   - "outro": closing remarks, wrap-up at the end
   - "transition": between-presenter transitions, "thank you, next speaker" moments
   - "qa": Q&A sections (audience questions, discussion)
   - "silence": gaps with no meaningful content
3. For segments already labeled presenter1/presenter2, keep that label unless it's clearly a non-presentation section.
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
    inference_config = {"temperature": 0.3, "maxTokens": 16384}

    try:
        response = bedrock.converse(
            modelId=model_id,
            messages=messages,
            system=system_prompts,
            inferenceConfig=inference_config
        )

        raw_result = response['output']['message']['content'][0]['text']

        first_index = raw_result.find('{')
        end_index = raw_result.rfind('}')
        result = json.loads(raw_result[first_index:end_index + 1])

        ai_segments = result.get('segments', [])
        if ai_segments:
            return ai_segments

        # If AI returned empty, fall back to original
        return segments

    except Exception as e:
        print(f"Error in analyze_with_bedrock: {str(e)}")
        # Fall back to original segments - keep the speaker labels from DetectPresenterBoundaries
        return [{
            'id': seg.get('id', str(uuid.uuid4())),
            'startTime': seg['startTime'],
            'endTime': seg['endTime'],
            'speakerLabel': seg.get('speakerLabel', 'unknown'),
            'segmentType': seg.get('segmentType', seg.get('speakerLabel', 'unknown')),
            'includeInOutput': True,
            'aiConfidence': 0.5
        } for seg in segments]
