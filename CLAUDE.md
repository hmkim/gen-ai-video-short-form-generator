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

This is a **GenAI video short-form generator** that takes long-form videos and uses AI to extract and generate up to 15 short-form highlight clips with titles and subtitles.

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

- `src/apis/` — GraphQL client utilities for History, Highlight, and Gallery CRUD
- `src/data/modelList.tsx` — Supported Bedrock model definitions
- `src/pages/shortify/` — Video editing subcomponents (frame selection, subtitle editing)

### Backend (`amplify/`)

Infrastructure defined via Amplify Gen2 in `amplify/backend.ts`. Key resources:

- **Auth** (`auth/resource.ts`): Cognito user pool with email login
- **Storage** (`storage/resource.ts`): S3 bucket with Transfer Acceleration and EventBridge notifications
- **Data** (`data/resource.ts`): AppSync GraphQL API with three DynamoDB models:
  - `History` — video processing records (owner-authorized)
  - `Highlight` — extracted highlight segments (composite key: VideoName + Index)
  - `Gallery` — generated short videos (authenticated access, secondary index on type/createdAt)
- **Custom mutations**: `publish` / `receive` for real-time stage updates via subscriptions

### Processing Pipeline

Three Step Functions orchestrate the video processing:

1. **VideoUploadStateMachine** — Triggered by S3 EventBridge when `**/RAW.mp4` uploaded. Runs transcription, topic extraction, and timeframe matching.
2. **UnifiedReasoningStateMachine** — Handles reasoning model processing (Claude/DeepSeek).
3. **GenerateShortStateMachine** — Triggered via `generateShort` GraphQL query. Creates MediaConvert jobs for final short videos.

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

### Event-Driven Communication

- S3 upload events trigger VideoUploadStateMachine via EventBridge
- Step Functions emit `StageChanged` events to EventBridge
- EventBridge forwards stage changes to AppSync via GraphQL mutation (`publish`)
- Frontend subscribes to `receive` subscription filtered by `videoId` for real-time progress

### Key Configuration

- `amplify_outputs.json` (gitignored) — Generated Amplify config consumed by `Amplify.configure()` in `App.tsx`
- Lambda environment variables (`BUCKET_NAME`, `HISTORY_TABLE_NAME`, `HIGHLIGHT_TABLE_NAME`, `STATE_MACHINE`) are set via CDK constructs, not `.env` files
- Bedrock model access must be enabled in **us-west-2**
