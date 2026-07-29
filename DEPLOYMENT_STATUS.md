# Deployment Status

> Last verified: 2026-04-20

## Overview

| Item | Value |
|------|-------|
| **App Name** | gen-ai-video-short-form-generator |
| **Amplify App ID** | `d32g3633tipi0o` |
| **Region** | `us-west-2` |
| **AWS Account** | `664263524008` |
| **Repository** | https://github.com/hmkim/gen-ai-video-short-form-generator |
| **Production URL** | https://main.d32g3633tipi0o.amplifyapp.com |
| **Production Branch** | `main` |
| **Last Deploy** | 2026-02-27 (Job #22, SUCCEED) |
| **Platform** | WEB (Amplify Hosting) |

## Deployment Environments

### Production (Amplify Hosting - main branch)

**Status: ACTIVE**

- **CloudFormation Root Stack**: `amplify-d32g3633tipi0o-main-branch-fe1e600255` (UPDATE_COMPLETE)
- **Auto Build**: Enabled (GitHub webhook triggers on push to main)
- **Build Compute**: STANDARD_8GB

### Sandbox (Local Dev)

**Status: PARTIALLY DELETED** - AppSync API no longer exists. The `amplify_outputs.json` in the repo references sandbox resources, some of which have been removed. Run `npx ampx sandbox` to recreate if needed for local development.

## AWS Resources (Production)

### Authentication (Cognito)

| Resource | Value |
|----------|-------|
| User Pool ID | `us-west-2_FEXGF0yDA` |
| User Pool Name | `amplifyAuthUserPool4BA7F805-9Gnr8usRc9Nb` |
| MFA | OFF |
| Estimated Users | 2 |
| Login Method | Email |
| Created | 2026-02-24 |

### Data (AppSync GraphQL + DynamoDB)

Two AppSync APIs exist (sandbox + production):

| API Name | API ID |
|----------|--------|
| AWS-Shorts | `6e5ev4ekqvauhngiq5paev2txa` |
| AWS-Shorts | `lamel44w4nexdjvfsteyq26e2q` |

**DynamoDB Tables** (production API: `lamel44w4nexdjvfsteyq26e2q`):

| Table | Description |
|-------|-------------|
| `History-lamel44w4nexdjvfsteyq26e2q-NONE` | Video processing records |
| `Highlight-lamel44w4nexdjvfsteyq26e2q-NONE` | Extracted highlight segments |
| `Gallery-lamel44w4nexdjvfsteyq26e2q-NONE` | Generated short videos |
| `LongVideoEdit-lamel44w4nexdjvfsteyq26e2q-NONE` | Long video edit sessions |
| `LongVideoSegment-lamel44w4nexdjvfsteyq26e2q-NONE` | Video segments |
| `LongVideoOutput-lamel44w4nexdjvfsteyq26e2q-NONE` | Rendered output videos |
| `YouTubeUpload-lamel44w4nexdjvfsteyq26e2q-NONE` | YouTube upload history |

### Storage (S3)

| Bucket | Purpose |
|--------|---------|
| `amplify-d32g3633tipi0o-mai-awsshortsbucketd126983b-6zj9w3slxjfv` | Production video storage |
| `amplify-d32g3633tipi0o-ma-awsshortsamplifycodegena-xdakeilnkikw` | Amplify codegen assets |
| `amplify-d32g3633tipi0o-ma-modelintrospectionschema-o1sprrbdbwec` | Model introspection schema |

### Step Functions

| State Machine | ARN |
|---------------|-----|
| VideoUploadStateMachine | `arn:aws:states:us-west-2:664263524008:stateMachine:VideoUploadStateMachine3E230CD6-7GAhFGyyGWxo` |
| UnifiedReasoningStateMachine | `arn:aws:states:us-west-2:664263524008:stateMachine:UnifiedReasoningStateMachineB786F76A-vkAKhhlgaPt9` |
| GenerateShortStateMachine | `arn:aws:states:us-west-2:664263524008:stateMachine:GenerateShortStateMachine9B91208F-rgLPjykkglQG` |

### Lambda Functions (28 total)

Key functions deployed for this app:

| Function | Runtime |
|----------|---------|
| VideoUploadStateMachine (Extract Topics) | Python 3.12 |
| VideoUploadStateMachine (Process Topics) | Python 3.12 |
| VideoUploadStateMachine (Extract Timeframe) | Python 3.12 |
| VideoUploadStateMachine (Detect Shot Changes) | Node.js 18.x |
| UnifiedReasoningStateMachine | Python 3.12 |
| GenerateShortStateMachine | Python 3.12 |
| LongVideoProcessStateMachine | Python 3.12 |
| GenerateLongVideoStateMachine | Python 3.12 |
| generateShort (Query handler) | Node.js 20.x |
| generateLongVideoOutput (Query handler) | Node.js 20.x |
| uploadToYouTube | Node.js 20.x |
| checkYouTubeConnection | Node.js 20.x |
| exchangeYouTubeToken | Node.js 20.x |
| saveYouTubeChannel | Node.js 20.x |
| suggestVideoMetadata | Node.js 20.x |
| publish (Real-time events) | Node.js 20.x |
| publishLongVideo | Node.js 20.x |
| YouTubeUpload | Python 3.12 |

### Other Services

| Service | Endpoint / Detail |
|---------|-------------------|
| MediaConvert | `https://mediaconvert.us-west-2.amazonaws.com` |
| EventBridge | Stack: `EventBridgeStack71DACCEB` (S3 events, Step Function stage changes) |

## CloudFormation Nested Stacks (Production)

| Stack | Status |
|-------|--------|
| `amplify-d32g3633tipi0o-main-branch-fe1e600255` (root) | UPDATE_COMPLETE |
| `...-auth179371D7-...` | CREATE_COMPLETE |
| `...-storage0EC3F24A-...` | CREATE_COMPLETE |
| `...-data7552DF31-...` | UPDATE_COMPLETE |
| `...-function1351588B-...` | CREATE_COMPLETE |
| `...-StepFunctionStack-...` | UPDATE_COMPLETE |
| `...-UnifiedReasoningStack-...` | CREATE_COMPLETE |
| `...-EventBridgeStack-...` | CREATE_COMPLETE |
| `...-FunctionDirectiveStack-...` | UPDATE_COMPLETE |
| `...-ConnectionStack-...` | CREATE_COMPLETE |
| `...-HistoryNestedStack-...` | CREATE_COMPLETE |
| `...-HighlightNestedStack-...` | CREATE_COMPLETE |
| `...-GalleryNestedStack-...` | CREATE_COMPLETE |
| `...-LongVideoEditNestedStack-...` | CREATE_COMPLETE |
| `...-LongVideoSegmentNestedStack-...` | CREATE_COMPLETE |
| `...-LongVideoOutputNestedStack-...` | UPDATE_COMPLETE |
| `...-YouTubeUploadNestedStack-...` | CREATE_COMPLETE |
| `...-AmplifyTableManagerNestedStack-...` | CREATE_COMPLETE |

## Recent Deployments

| Job | Date | Status | Commit |
|-----|------|--------|--------|
| #22 | 2026-02-27 | SUCCEED | Fix ButtonDropdown menu clipped by table overflow |
| #21 | 2026-02-27 | SUCCEED | Replace Actions buttons with ButtonDropdown in YouTube uploads table |
| #20 | 2026-02-27 | SUCCEED | Add separate YouTubeUpload model for upload history tracking |
| #19 | 2026-02-27 | SUCCEED | Fix Actions column button wrapping in YouTube uploads table |
| #18 | 2026-02-27 | SUCCEED | Fix YouTube uploads table layout and add channel column |

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | VideoUploadComponent | Upload videos, select AI model |
| `/history` | ShortsHistoryComponent | View processing history |
| `/gallery` | ShortsGalleryComponent | Browse generated shorts |
| `/history/:id` | VideoShortifyComponent | Process a specific video |
| `/shorts/:id/:highlight` | FinalShortComponent | View/edit final short |
| `/youtube/uploads` | YouTubeUploadsComponent | YouTube upload history |

## Notes

- Production is deployed via **Amplify Hosting CI/CD** (GitHub webhook on `main` branch push)
- The local `amplify_outputs.json` points to **sandbox** resources (some of which are deleted). For production config, Amplify Hosting generates its own outputs during build
- Bedrock model access must be enabled in **us-west-2**
- The sandbox S3 bucket (`amplify-app-ec2user-sandbo-...`) still exists with some assets
