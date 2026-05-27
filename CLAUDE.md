# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (requires sandbox running)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint with zero warnings threshold
npm run preview      # Preview production build locally
npx ampx sandbox     # Deploy AWS cloud sandbox (must stay running during dev)
npx ampx sandbox delete  # Tear down sandbox resources
```

There is no test framework configured in this project.

## Architecture

This is a **GenAI video short-form generator** with two major feature paths:
1. **Short-form clips** — takes long-form videos and uses AI to extract up to 15 short-form highlight clips with titles and subtitles
2. **Long video editing** — presenter-aware segmentation and output generation with YouTube upload integration

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, using Cloudscape Design Components and Amplify UI React
- **Backend**: AWS Amplify Gen2 (CDK-based), Python 3.12 Lambda functions, Step Functions
- **AI/ML**: Amazon Bedrock (Claude 3.x, Nova, DeepSeek R1) in **us-west-2** region
- **Video**: AWS MediaConvert for transcoding, Amazon Transcribe for speech-to-text

### Frontend (`src/`)

Single-page React app wrapped in `<Authenticator>` (Cognito). Routes defined in `App.tsx`:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `VideoUploadComponent` | Upload videos, select AI model |
| `/history` | `ShortsHistoryComponent` | View processing history |
| `/gallery` | `ShortsGalleryComponent` | Browse generated shorts |
| `/history/:id` | `VideoShortifyComponent` | Process a specific video |
| `/shorts/:id/:highlight` | `FinalShortComponent` | View/edit final short |
| `/longvideo` | `LongVideoUploadComponent` | Upload long videos |
| `/longvideo/history` | `LongVideoHistoryComponent` | Long video history |
| `/longvideo/edit/:id` | `LongVideoEditorComponent` | Edit segments/presenters |
| `/longvideo/output/:id` | `LongVideoOutputComponent` | View/manage outputs |
| `/youtube/connect` | `YouTubeConnectComponent` | OAuth connection |
| `/youtube/callback` | `YouTubeCallbackComponent` | OAuth callback |
| `/youtube/uploads` | `YouTubeUploadsComponent` | Manage uploads |

- `src/apis/` — GraphQL client utilities (history, highlight, gallery, longVideoEdit, longVideoSegment, longVideoOutput, youtube)
- `src/data/modelList.tsx` — Supported Bedrock model definitions
- `src/pages/shortify/` — Short-form video editing subcomponents
- `src/pages/longvideo/` — Long video editing UI with presenter segmentation
- `src/pages/youtube/` — YouTube OAuth and upload management

### Backend (`amplify/`)

Infrastructure defined via Amplify Gen2 in `amplify/backend.ts`. Key resources:

- **Auth** (`auth/resource.ts`): Cognito user pool with email login
- **Storage** (`storage/resource.ts`): S3 bucket with Transfer Acceleration and EventBridge notifications
- **Data** (`data/resource.ts`): AppSync GraphQL API with DynamoDB models:
  - `History` — video processing records (owner-authorized)
  - `Highlight` — extracted highlight segments (composite key: VideoName + Index)
  - `Gallery` — generated short videos (authenticated access, secondary index on type/createdAt)
  - `LongVideoEdit` — long video processing records with presenter metadata
  - `LongVideoSegment` — time-based segments with speaker labels and types
  - `LongVideoOutput` — generated output files per presenter, with YouTube upload state
  - `YouTubeUpload` — YouTube upload tracking records
- **Custom mutations/subscriptions**: `publish`/`receive` for short-form, `publishLongVideo`/`receiveLongVideo` for long video real-time stage updates
- **Custom queries**: `generateShort`, `generateLongVideoOutput`, `uploadToYouTube`, `suggestVideoMetadata`, `exchangeYouTubeToken`, `checkYouTubeConnection`, `saveYouTubeChannel`

### Processing Pipeline

Five Step Functions orchestrate video processing (`amplify/custom/step-functions/`):

1. **VideoUploadStateMachine** — Triggered by S3 EventBridge when `**/RAW.mp4` uploaded. Runs transcription, topic extraction, and timeframe matching.
2. **UnifiedReasoningStateMachine** — Handles reasoning model processing (Claude/DeepSeek).
3. **GenerateShortStateMachine** — Triggered via `generateShort` GraphQL query. Creates MediaConvert jobs for final short videos.
4. **LongVideoProcessStateMachine** — Triggered by S3 EventBridge when `**/LONG_RAW.mp4` uploaded. Runs presenter boundary detection and segment analysis.
5. **GenerateLongVideoStateMachine** — Triggered via `generateLongVideoOutput` query. Creates per-presenter output videos.

### Lambda Functions (`amplify/custom/lambda-functions/`)

All Python 3.12 unless noted:

| Function | Purpose |
|----------|---------|
| `extract-topics-bedrock` | Extract highlight topics from transcript via Bedrock |
| `process-topics-bedrock` | Process and refine extracted topics |
| `extract-timeframe` | Match topics to video timestamps |
| `detect-shot-changes` | Detect scene changes (Node.js) |
| `create-background` | Generate video backgrounds using Pillow layer |
| `make-short-template` | Create MediaConvert job templates |
| `unified-reasoning` | Invoke reasoning models (Claude/DeepSeek) |
| `detect-presenter-boundaries` | Identify presenter transitions in video |
| `analyze-presenter-segments` | Classify and label segments by presenter |
| `generate-long-video-output` | Create MediaConvert jobs for long video outputs |
| `youtube-upload` | Upload videos to YouTube via OAuth |

### Event-Driven Communication

- S3 upload events trigger state machines via EventBridge (`RAW.mp4` → short-form, `LONG_RAW.mp4` → long video)
- Step Functions emit `StageChanged` / `LongVideoStageChanged` events to EventBridge
- EventBridge forwards stage changes to AppSync via GraphQL mutations (`publish` / `publishLongVideo`)
- Frontend subscribes to `receive` / `receiveLongVideo` subscriptions filtered by `videoId` for real-time progress

### Key Configuration

- `amplify_outputs.json` (gitignored) — Generated Amplify config consumed by `Amplify.configure()` in `App.tsx`
- Lambda environment variables (`BUCKET_NAME`, `*_TABLE_NAME`, `STATE_MACHINE`, etc.) are set via CDK constructs in `backend.ts`, not `.env` files
- YouTube OAuth credentials stored in AWS Secrets Manager
- Bedrock model access must be enabled in **us-west-2**
