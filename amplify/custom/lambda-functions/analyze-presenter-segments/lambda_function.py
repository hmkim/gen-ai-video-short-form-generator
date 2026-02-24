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
    """Use Bedrock to classify segments as presenter1/presenter2/intro/outro/transition/qa/silence."""
    segments_summary = json.dumps(segments[:50], indent=2)  # Limit for context window
    boundaries_summary = json.dumps(boundaries[:20], indent=2)

    prompt = f"""
    Below is a transcript of a webinar/seminar video with two presenters.
    <script>{script[:8000]}</script>

    Here are the detected speaker segments (speaker boundaries from Amazon Transcribe):
    <segments>{segments_summary}</segments>

    Here are the detected speaker change boundaries:
    <boundaries>{boundaries_summary}</boundaries>

    Analyze these segments and classify each one. The video has exactly 2 presenters.
    For each segment, determine:
    1. Whether it belongs to presenter1, presenter2, or is a non-presentation segment
    2. Non-presentation types: "intro", "outro", "transition", "qa", "silence"
    3. Whether it should be included in the final output (exclude intros, outros, transitions, Q&A sections)
    4. Your confidence level (0.0-1.0)

    Return the analysis in this JSON format:
    <JSON>
    {{
      "segments": [
        {{
          "id": "segment_id",
          "startTime": 0.0,
          "endTime": 30.5,
          "speakerLabel": "presenter1",
          "segmentType": "presenter1",
          "includeInOutput": true,
          "aiConfidence": 0.95
        }}
      ]
    }}
    </JSON>

    Important:
    - Keep existing segment IDs where available
    - Presenter segments should have segmentType matching their speakerLabel
    - Mark intro/outro/transition/qa/silence segments with includeInOutput: false
    - Respond only with the JSON structure above
    """

    messages = [{"role": "user", "content": [{"text": prompt}]}]
    system_prompts = [{"text": "You are an AI assistant that analyzes video transcripts to identify presenter segments and non-presentation segments."}]
    inference_config = {"temperature": 0.3, "maxTokens": 8192, "topP": 0.9}

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

        return result.get('segments', segments)

    except Exception as e:
        print(f"Error in analyze_with_bedrock: {str(e)}")
        # Fall back to original segments with default classification
        return [{
            'id': seg.get('id', str(uuid.uuid4())),
            'startTime': seg['startTime'],
            'endTime': seg['endTime'],
            'speakerLabel': seg.get('speakerLabel', 'unknown'),
            'segmentType': seg.get('segmentType', seg.get('speakerLabel', 'unknown')),
            'includeInOutput': True,
            'aiConfidence': 0.5
        } for seg in segments]
