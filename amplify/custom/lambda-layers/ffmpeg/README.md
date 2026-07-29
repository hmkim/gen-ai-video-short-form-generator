# FFmpeg Lambda Layer

This layer provides a static **FFmpeg** binary to the `AnalyzeVideoFrames`
Lambda (Unit U5 / F5b — Vision opt-in). The Lambda uses FFmpeg to extract a
single downscaled JPEG frame at each speaker-transition boundary before sending
it to Bedrock Vision.

## ⚠️ The binary is intentionally NOT committed

A statically-linked FFmpeg binary is ~70–80 MB compressed and **~250 MB
unzipped** — too large for the git repository. You must place it manually
before deploying:

```
amplify/custom/lambda-layers/ffmpeg/
└── bin/
    └── ffmpeg          # <-- you provide this (linux-x86_64, static, executable)
```

Lambda mounts layer content under `/opt`, so the binary ends up at
`/opt/bin/ffmpeg` at runtime. The handler invokes it from there (overridable via
the `FFMPEG_PATH` env var; default `/opt/bin/ffmpeg`).

> Without `bin/ffmpeg` present, the layer still synthesizes and deploys, but the
> Lambda will fail at frame-extraction time. Because Vision is opt-in and the
> state machine has a `Catch` that degrades to the audio-only path, a missing
> binary degrades gracefully rather than breaking the pipeline — but Vision
> analysis will simply produce no results until the binary is added.

## How to obtain the binary

Use a trusted prebuilt static build (recommended) or build from source.

### Option A — John Van Sickle static build (Linux x86_64)

```sh
cd amplify/custom/lambda-layers/ffmpeg
mkdir -p bin
curl -L -o /tmp/ffmpeg.tar.xz \
  https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf /tmp/ffmpeg.tar.xz -C /tmp
cp /tmp/ffmpeg-*-amd64-static/ffmpeg bin/ffmpeg
chmod +x bin/ffmpeg
rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-amd64-static
```

### Option B — build from source

Build a static `ffmpeg` targeting `linux-x86_64` and copy the resulting binary
to `bin/ffmpeg`. Match the Lambda architecture (this construct uses the default
x86_64 Lambda architecture / `Runtime.PYTHON_3_12`).

## Architecture

The `AnalyzeVideoFrames` Lambda runs on the **x86_64** architecture (CDK default
for `Runtime.PYTHON_3_12`). The FFmpeg binary **must** be a `linux-x86_64`
static build. If you switch the Lambda to `arm64`, supply an `aarch64` build
instead.

## Provenance & License

- **FFmpeg** is licensed under the **LGPL-2.1+** (or **GPL-2.0+** for builds that
  enable GPL-only components such as libx264). Record which build you used.
- The John Van Sickle builds are GPL builds — review and comply with the GPL
  terms (notably source-availability obligations) before distributing.
- Keep a note of the exact version (`ffmpeg -version`) and source URL alongside
  your deployment records for audit/attribution. Add the attribution to the
  project `ATTRIBUTION.md` if you ship this binary.

## Size note

The unzipped static binary is roughly **250 MB**. AWS Lambda layers allow up to
250 MB unzipped across all layers attached to a function, so this binary alone
is close to the ceiling — do not add other large content to this layer.
