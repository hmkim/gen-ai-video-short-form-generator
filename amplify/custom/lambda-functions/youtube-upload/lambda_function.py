import json
import boto3
import os
import tempfile

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
secrets_manager = boto3.client('secretsmanager')


def lambda_handler(event, context):
    """
    Upload a video to YouTube using the YouTube Data API v3.
    Requires google-api-python-client and google-auth-oauthlib Lambda layer.
    """
    bucket_name = os.environ["BUCKET_NAME"]
    output_table_name = os.environ["LONG_VIDEO_OUTPUT_TABLE_NAME"]

    output_id = event['outputId']
    title = event['title']
    description = event.get('description', '')

    output_table = dynamodb.Table(output_table_name)

    # Get output record
    output_record = output_table.get_item(Key={'id': output_id})
    item = output_record['Item']
    s3_location = item['s3Location']

    try:
        # Get YouTube OAuth credentials from Secrets Manager
        secret_response = secrets_manager.get_secret_value(
            SecretId='youtube-oauth-credentials'
        )
        credentials_json = json.loads(secret_response['SecretString'])

        # Download video from S3 to /tmp
        local_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        s3.download_file(bucket_name, s3_location, local_file.name)

        # Build YouTube service and upload
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        creds = Credentials(
            token=credentials_json.get('access_token'),
            refresh_token=credentials_json.get('refresh_token'),
            token_uri='https://oauth2.googleapis.com/token',
            client_id=credentials_json.get('client_id'),
            client_secret=credentials_json.get('client_secret'),
        )

        youtube = build('youtube', 'v3', credentials=creds)

        body = {
            'snippet': {
                'title': title,
                'description': description,
                'categoryId': '22',  # People & Blogs
            },
            'status': {
                'privacyStatus': 'private',
            }
        }

        media = MediaFileUpload(
            local_file.name,
            mimetype='video/mp4',
            resumable=True,
            chunksize=1024 * 1024 * 10
        )

        request = youtube.videos().insert(
            part='snippet,status',
            body=body,
            media_body=media
        )

        response = None
        while response is None:
            status, response = request.next_chunk()

        youtube_video_id = response['id']

        # Update DDB with YouTube video ID
        output_table.update_item(
            Key={'id': output_id},
            UpdateExpression='SET youtubeVideoId = :vid',
            ExpressionAttributeValues={':vid': youtube_video_id}
        )

        # Clean up
        os.unlink(local_file.name)

        return {
            'statusCode': 200,
            'youtubeVideoId': youtube_video_id,
        }

    except ImportError:
        # google-api-python-client not available yet
        return {
            'statusCode': 500,
            'error': 'YouTube API dependencies not installed. Add google-api-python-client Lambda layer.',
        }
    except Exception as e:
        print(f"Error uploading to YouTube: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
        }
