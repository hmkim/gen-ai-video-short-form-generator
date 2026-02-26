import json
import boto3
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')


def convert_seconds_to_timecode(seconds):
    """Convert seconds to HH:MM:SS:FF timecode format."""
    seconds = float(seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = int(seconds % 60)
    frames = int((seconds - int(seconds)) * 25)
    return "{:02d}:{:02d}:{:02d}:{:02d}".format(hours, minutes, remaining_seconds, frames)


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    edit_table_name = os.environ["LONG_VIDEO_EDIT_TABLE_NAME"]
    segment_table_name = os.environ["LONG_VIDEO_SEGMENT_TABLE_NAME"]
    output_table_name = os.environ["LONG_VIDEO_OUTPUT_TABLE_NAME"]

    video_id = event['videoId']
    presenter_number = event['presenterNumber']
    title = event.get('title', '')
    description = event.get('description', '')

    edit_table = dynamodb.Table(edit_table_name)
    segment_table = dynamodb.Table(segment_table_name)
    output_table = dynamodb.Table(output_table_name)

    # Get edit record for owner info
    edit_record = edit_table.get_item(Key={'id': video_id})
    owner = edit_record['Item'].get('owner', '')

    # Query segments for this video that are included in output
    response = segment_table.scan(
        FilterExpression='longVideoEditId = :vid AND includeInOutput = :inc AND speakerLabel = :speaker',
        ExpressionAttributeValues={
            ':vid': video_id,
            ':inc': True,
            ':speaker': f'presenter{presenter_number}',
        }
    )
    segments = response['Items']
    segments.sort(key=lambda x: float(x['startTime']))

    # Build MediaConvert InputClippings
    input_file = f's3://{bucket_name}/videos/{video_id}/LONG_RAW.mp4'
    output_key = f'videos/{video_id}/LongVideoOutput/presenter{presenter_number}'

    input_clippings = []
    for seg in segments:
        start_tc = convert_seconds_to_timecode(float(seg['startTime']))
        end_tc = convert_seconds_to_timecode(float(seg['endTime']))
        input_clippings.append({
            'StartTimecode': start_tc,
            'EndTimecode': end_tc
        })

    # Delete existing output for this presenter (prevent duplicates on regenerate)
    existing = output_table.scan(
        FilterExpression='longVideoEditId = :vid AND presenterNumber = :pn',
        ExpressionAttributeValues={
            ':vid': video_id,
            ':pn': presenter_number,
        },
        ProjectionExpression='id'
    )
    for old in existing.get('Items', []):
        output_table.delete_item(Key={'id': old['id']})

    # Create output record
    output_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()[:-6] + "Z"

    output_record = {
        'id': output_id,
        'longVideoEditId': video_id,
        'presenterNumber': presenter_number,
        's3Location': f'{output_key}.mp4',
        'title': title,
        'description': description,
        'owner': owner,
        'createdAt': timestamp,
        'updatedAt': timestamp,
    }
    output_table.put_item(Item=output_record)

    # Build MediaConvert job template
    job_template = {
        'input_file': input_file,
        'input_clippings': input_clippings,
        'output_destination': f's3://{bucket_name}/{output_key}',
        'output_id': output_id,
    }

    return {
        'statusCode': 200,
        'body': json.dumps(job_template),
        'uuid': video_id,
    }
