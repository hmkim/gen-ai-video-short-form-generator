"""Pytest configuration for the detect-presenter-boundaries unit tests.

The Lambda module (`lambda_function.py`) constructs its boto3 S3 client and
DynamoDB resource at *import* time:

    s3 = boto3.client('s3')
    dynamodb = boto3.resource('dynamodb')

Constructing a client/resource is a purely local operation (no network call),
but botocore still needs a region to resolve endpoints or it raises
``NoRegionError``. We therefore guarantee a region is present *before* the test
module imports `lambda_function`. conftest.py is imported by pytest ahead of
test collection, so this runs first.

No AWS APIs are ever invoked by these tests — only module-level functions that
operate on in-memory data are exercised.
"""
import os
import sys

# botocore needs a region for client/resource construction at module import.
# AWS_DEFAULT_REGION may be unset/empty in CI even when AWS_REGION is set, and
# this botocore version only honours AWS_DEFAULT_REGION for the default region.
if not os.environ.get("AWS_DEFAULT_REGION"):
    os.environ["AWS_DEFAULT_REGION"] = os.environ.get("AWS_REGION") or "us-west-2"

# Dummy credentials so no credential-provider chain (e.g. IMDS) is ever reached.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")

# Make `import lambda_function` resolve to the module in this directory,
# regardless of the directory pytest is invoked from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
