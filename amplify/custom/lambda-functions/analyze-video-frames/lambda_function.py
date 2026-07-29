"""AnalyzeVideoFrames Lambda (Unit U5, F5b — Vision opt-in).

Extracts a single video frame at selected speaker-transition boundaries and runs
Bedrock Vision over each frame to cross-check the audio-only diarization produced
by detect-presenter-boundaries. The result (`visual_analysis`) is passed forward
to analyze-presenter-segments to boost / adjust boundary classification.

Design refs:
- ARCHITECTURE_AND_IMPROVEMENT_PLAN.md §9 (Presenter 인식 개선 B)
- aidlc .../U5-vision-optin/{functional-design,nfr-design,infrastructure-design}

Safety / cost posture (ADR-4):
- opt-in only — the state machine only invokes this Lambda when visionEnabled=true.
- MAX_BOUNDARIES hard cap, low-cost vision model, 640px frames → bounded cost.
- S3 key forced to the `videos/{uuid}/` prefix (path-traversal prevention).
- Presigned URL is short-lived (600s) and used only inside this Lambda.
- /tmp frames are always removed in a finally block (no residual PII frames).
- Per-boundary extraction/analysis failures are non-blocking (the boundary is
  skipped); whole-task failure is handled by the state machine's Catch →
  graceful degrade to the audio-only path.
"""
import json
import os
import re
import subprocess

import boto3
import botocore

# --------------------------------------------------------------------------- #
# Constants — cost / safety caps (see §9.5, §10.4 of the improvement plan)
# --------------------------------------------------------------------------- #
MAX_BOUNDARIES = 10                 # hard cap on how many frames we analyze
MAX_FRAME_SIZE_BYTES = 5 * 1024 * 1024  # reject frames >= 5MB
FRAME_WIDTH_PX = 640                # downscale width; height keeps aspect ratio
PRESIGNED_URL_TTL_SECONDS = 600     # short-lived, Lambda-internal only
FFMPEG_SUBPROCESS_TIMEOUT_S = 60    # per-frame extraction wall-clock cap
BEDROCK_MAX_TOKENS = 300            # vision response is a tiny JSON object
RAW_VIDEO_FILENAME = "LONG_RAW.mp4"

# Claude 3 Haiku is the low-cost vision-capable default (Claude 3.5 Haiku does
# NOT accept image input). Overridable via the VISION_MODEL_ID env var.
DEFAULT_VISION_MODEL_ID = "us.anthropic.claude-3-haiku-20240307-v1:0"

# Lambda layers mount under /opt; an ffmpeg layer places the binary at bin/ffmpeg.
DEFAULT_FFMPEG_PATH = "/opt/bin/ffmpeg"

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

s3 = boto3.client("s3")
bedrock = boto3.client(
    service_name="bedrock-runtime",
    region_name="us-west-2",
    config=botocore.config.Config(
        connect_timeout=10,
        read_timeout=300,
        retries={"max_attempts": 2},
    ),
)


# --------------------------------------------------------------------------- #
# Input validation
# --------------------------------------------------------------------------- #
def validate_input(event):
    """Validate event inputs; raise ValueError on anything malformed.

    Returns (video_id, presenter_count, boundaries).
    """
    video_id = event.get("uuid", "")
    if not isinstance(video_id, str) or not UUID_PATTERN.match(video_id):
        raise ValueError(f"Invalid uuid format: {video_id!r}")

    raw_count = event.get("presenterCount", 2)
    try:
        presenter_count = int(raw_count)
    except (TypeError, ValueError):
        raise ValueError(f"presenterCount must be an integer, got {type(raw_count)}")
    if presenter_count not in (1, 2):
        raise ValueError(f"presenterCount must be 1 or 2, got {presenter_count}")

    boundaries = event.get("boundaries", [])
    if not isinstance(boundaries, list):
        raise ValueError("boundaries must be a list")

    return video_id, presenter_count, boundaries


def build_video_key(video_id):
    """Force the S3 key under the `videos/{uuid}/` prefix (path-traversal safe).

    The key is derived deterministically from the validated uuid, never taken
    from caller-supplied free text, so traversal sequences cannot leak in.
    """
    key = f"videos/{video_id}/{RAW_VIDEO_FILENAME}"
    expected_prefix = f"videos/{video_id}/"
    normalized = os.path.normpath(key)
    if not normalized.startswith(expected_prefix):
        raise ValueError(f"Refusing S3 key outside the video prefix: {key!r}")
    return key


# --------------------------------------------------------------------------- #
# Boundary selection (cost cap)
# --------------------------------------------------------------------------- #
def select_boundaries(boundaries):
    """Pick the boundaries worth a (paid) visual check.

    Rules (ARCHITECTURE_AND_IMPROVEMENT_PLAN §9.4 / §10.4):
    - only boundaries with an actual speaker transition,
    - lowest audio confidence first (visual verification has the most value there),
    - capped at MAX_BOUNDARIES.
    """
    transitions = []
    for b in boundaries:
        if not isinstance(b, dict):
            continue
        time_value = b.get("time")
        if not isinstance(time_value, (int, float)) or time_value < 0:
            continue
        if b.get("from_speaker") == b.get("to_speaker"):
            continue  # same-speaker edge — nothing to verify visually
        transitions.append(b)

    transitions.sort(key=lambda b: float(b.get("confidence", 1.0)))
    return transitions[:MAX_BOUNDARIES]


# --------------------------------------------------------------------------- #
# Frame extraction + vision
# --------------------------------------------------------------------------- #
def extract_frame(presigned_url, timestamp, out_path):
    """Extract a single downscaled JPEG frame at `timestamp` via FFmpeg.

    `-ss` is placed before `-i` for fast input seeking. Returns the frame bytes.
    Raises on FFmpeg failure or an oversized frame.
    """
    ffmpeg_path = os.environ.get("FFMPEG_PATH", DEFAULT_FFMPEG_PATH)
    cmd = [
        ffmpeg_path,
        "-y",
        "-ss", f"{float(timestamp):.3f}",
        "-i", presigned_url,
        "-frames:v", "1",
        "-vf", f"scale={FRAME_WIDTH_PX}:-1",
        "-q:v", "5",
        out_path,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        timeout=FFMPEG_SUBPROCESS_TIMEOUT_S,
        check=False,
    )
    if result.returncode != 0 or not os.path.exists(out_path):
        stderr_tail = result.stderr.decode("utf-8", "replace")[-500:]
        raise RuntimeError(f"FFmpeg failed (rc={result.returncode}): {stderr_tail}")

    size = os.path.getsize(out_path)
    if size <= 0:
        raise RuntimeError("FFmpeg produced an empty frame")
    if size >= MAX_FRAME_SIZE_BYTES:
        raise RuntimeError(f"Frame too large: {size} bytes (cap {MAX_FRAME_SIZE_BYTES})")

    with open(out_path, "rb") as fh:
        return fh.read()


def analyze_frame_with_bedrock(frame_bytes, timestamp, model_id):
    """Call Bedrock Vision on one frame and return the parsed visual dict.

    Returns {people_count, layout, transition_visible, confidence}. Raises on a
    Bedrock error or unparseable response (the caller treats this as a skip).
    """
    prompt = (
        f"This is a video frame captured at {float(timestamp):.1f} seconds, at a "
        "speaker transition point in a webinar/seminar recording.\n\n"
        "Please analyze:\n"
        "1. How many people are visible? (0, 1, 2, or more)\n"
        "2. Describe the screen layout: single speaker, split screen, slides only, "
        "or other.\n"
        "3. Is there a visible change in who is speaking (new person at podium, "
        "camera angle change)?\n"
        "4. Rate your confidence that a real speaker transition occurs here: "
        "low/medium/high.\n\n"
        'Respond ONLY with JSON: '
        '{"people_count": <int>, "layout": "<string>", '
        '"transition_visible": <true|false>, "confidence": "<low|medium|high>"}'
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"image": {"format": "jpeg", "source": {"bytes": frame_bytes}}},
                {"text": prompt},
            ],
        }
    ]

    response = bedrock.converse(
        modelId=model_id,
        messages=messages,
        inferenceConfig={"maxTokens": BEDROCK_MAX_TOKENS, "temperature": 0},
    )
    raw_text = response["output"]["message"]["content"][0]["text"]

    first = raw_text.find("{")
    last = raw_text.rfind("}")
    if first == -1 or last == -1:
        raise RuntimeError("No JSON object in Bedrock vision response")
    parsed = json.loads(raw_text[first:last + 1])

    return {
        "people_count": parsed.get("people_count"),
        "layout": parsed.get("layout"),
        "transition_visible": parsed.get("transition_visible"),
        "confidence": parsed.get("confidence"),
    }


# --------------------------------------------------------------------------- #
# Handler
# --------------------------------------------------------------------------- #
def lambda_handler(event, context):
    bucket_name = event.get("bucket_name") or os.environ.get("BUCKET_NAME")
    if not bucket_name:
        raise ValueError("bucket_name is required (event or BUCKET_NAME env)")

    video_id, _presenter_count, boundaries = validate_input(event)
    model_id = os.environ.get("VISION_MODEL_ID", DEFAULT_VISION_MODEL_ID)

    source_key = build_video_key(video_id)
    selected = select_boundaries(boundaries)

    visual_analysis = []
    if not selected:
        print(f"No transition boundaries to analyze for {video_id}; returning empty visual_analysis")
        return {**event, "visual_analysis": visual_analysis}

    # One presigned URL is reused for every frame extraction in this invocation.
    presigned_url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket_name, "Key": source_key},
        ExpiresIn=PRESIGNED_URL_TTL_SECONDS,
    )

    for index, boundary in enumerate(selected):
        timestamp = float(boundary.get("time", 0))
        frame_path = f"/tmp/frame_{video_id}_{index}.jpg"
        try:
            frame_bytes = extract_frame(presigned_url, timestamp, frame_path)
            visual = analyze_frame_with_bedrock(frame_bytes, timestamp, model_id)
            visual_analysis.append({"timestamp": timestamp, "visual": visual})
        except Exception as exc:  # non-blocking: skip this boundary
            print(f"Skipping boundary at t={timestamp:.1f}s ({index}): {exc}")
        finally:
            # Always clean up the /tmp frame, even on partial failure.
            if os.path.exists(frame_path):
                try:
                    os.remove(frame_path)
                except OSError as cleanup_err:
                    print(f"Failed to remove temp frame {frame_path}: {cleanup_err}")

    print(f"Vision analysis complete: {len(visual_analysis)}/{len(selected)} boundaries analyzed for {video_id}")
    return {**event, "visual_analysis": visual_analysis}
