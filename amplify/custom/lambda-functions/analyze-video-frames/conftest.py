"""Pytest configuration for the analyze-video-frames unit tests.

The Lambda module builds its boto3 clients at *import* time:

    s3 = boto3.client("s3")
    bedrock = boto3.client(service_name="bedrock-runtime", region_name="us-west-2", ...)

Constructing a client is local (no network call), but botocore needs a region
or it raises NoRegionError. We guarantee a region before the test module imports
`lambda_function`. conftest.py is imported by pytest ahead of test collection.

No AWS APIs are invoked by these tests — only pure module-level functions that
operate on in-memory data are exercised (FFmpeg / Bedrock / S3 paths are not hit).
"""
import os
import sys

if not os.environ.get("AWS_DEFAULT_REGION"):
    os.environ["AWS_DEFAULT_REGION"] = os.environ.get("AWS_REGION") or "us-west-2"

# Dummy credentials so no credential-provider chain (e.g. IMDS) is ever reached.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")

# Make `import lambda_function` resolve to the module in this directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
