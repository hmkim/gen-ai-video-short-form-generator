# GenAI Video Short-Form Generator — Architecture Review & Improvement Plan

> **작성일:** 2026-05-28  
> **목적:** AWS SA 전문가 리뷰를 위한 현재 아키텍처 상세 분석 + 개선 계획 (Timeline UX, Presenter 인식 개선)

---

## Table of Contents

1. [프로젝트 개요](#1-프로젝트-개요)
2. [현재 아키텍처 상세](#2-현재-아키텍처-상세)
3. [데이터 모델](#3-데이터-모델)
4. [처리 파이프라인 상세](#4-처리-파이프라인-상세)
5. [보안 현황 및 이슈](#5-보안-현황-및-이슈)
6. [비용 분석](#6-비용-분석)
7. [개선 계획 1: Timeline UX 개선](#7-개선-계획-1-timeline-ux-개선)
8. [개선 계획 2: Presenter 인식 개선 A (발화 비율 기반)](#8-개선-계획-2-presenter-인식-개선-a)
9. [개선 계획 3: Presenter 인식 개선 B (영상 프레임 분석)](#9-개선-계획-3-presenter-인식-개선-b)
10. [비용 영향 분석](#10-비용-영향-분석)
11. [보안 개선 사항](#11-보안-개선-사항)
12. [검증 계획](#12-검증-계획)

---

## 1. 프로젝트 개요

### 1.1 목적
장시간 동영상(웨비나, 세미나 등)을 업로드하면 AI가 발표자를 인식하고 구간을 분류하여, 발표자별 개별 출력 영상을 생성하는 GenAI 기반 비디오 편집 도구.

### 1.2 주요 기능 경로

| Feature Path | 설명 |
|---|---|
| **Short-form clips** | 장시간 영상에서 15개 이내 하이라이트 클립 자동 추출 |
| **Long video editing** | 발표자 인식 기반 세그먼테이션 + 발표자별 출력 생성 + YouTube 업로드 |

### 1.3 기술 스택

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | Cloudscape Design System + Amplify UI React |
| Backend Framework | AWS Amplify Gen2 (CDK-based) |
| Runtime | Python 3.12 Lambda (backend), Node.js Lambda (data layer) |
| AI/ML | Amazon Bedrock (Claude, Nova, DeepSeek R1) in us-west-2 |
| Video Processing | AWS MediaConvert |
| Speech-to-Text | Amazon Transcribe (speaker diarization) |
| Auth | Amazon Cognito (User Pool, email login) |
| Storage | Amazon S3 (Transfer Acceleration, EventBridge notifications) |
| Database | Amazon DynamoDB (via AppSync) |
| API | AWS AppSync (GraphQL) |
| Orchestration | AWS Step Functions |
| Events | Amazon EventBridge |

---

## 2. 현재 아키텍처 상세

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                       │
│  Cognito Auth → AppSync GraphQL → S3 Upload (Transfer Acceleration)  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  AWS AppSync (GraphQL)│
                    │  - Queries/Mutations  │
                    │  - Subscriptions      │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐     ┌───────▼───────┐    ┌──────▼──────┐
    │ DynamoDB   │     │  EventBridge   │    │   S3 Bucket  │
    │ (7 tables) │     │  (default bus) │    │ (videos/*)   │
    └────────────┘     └───────┬───────┘    └──────┬──────┘
                               │                    │
                    ┌──────────▼──────────┐         │ Object Created
                    │  Step Functions      │◄────────┘ (EventBridge)
                    │  (5 state machines)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼───┐  ┌────────▼────┐  ┌───────▼────────┐
    │  Transcribe  │  │   Bedrock    │  │  MediaConvert   │
    │  (STT+Diar.) │  │  (LLM/Vision)│  │  (Transcoding)  │
    └──────────────┘  └─────────────┘  └────────────────┘
```

### 2.2 Frontend Route Structure

| Route | Component | 기능 |
|-------|-----------|------|
| `/` | VideoUploadComponent | 동영상 업로드, AI 모델 선택 |
| `/history` | ShortsHistoryComponent | 처리 이력 조회 |
| `/gallery` | ShortsGalleryComponent | 생성된 숏폼 브라우징 |
| `/history/:id` | VideoShortifyComponent | 특정 영상 처리 |
| `/shorts/:id/:highlight` | FinalShortComponent | 최종 숏폼 확인/편집 |
| `/longvideo` | LongVideoUploadComponent | 장시간 영상 업로드 |
| `/longvideo/history` | LongVideoHistoryComponent | 장시간 영상 이력 |
| `/longvideo/edit/:id` | LongVideoEditorComponent | 세그먼트/발표자 편집 |
| `/longvideo/output/:id` | LongVideoOutputComponent | 출력 관리 |
| `/youtube/connect` | YouTubeConnectComponent | YouTube OAuth 연결 |
| `/youtube/callback` | YouTubeCallbackComponent | OAuth 콜백 |
| `/youtube/uploads` | YouTubeUploadsComponent | YouTube 업로드 관리 |

### 2.3 Backend Infrastructure (amplify/backend.ts)

#### CDK Stacks 구성
| Stack | Resources |
|-------|-----------|
| Default (auth/data/storage) | Cognito, AppSync, S3, DynamoDB tables |
| EventBridgeStack | EventBus rules, AppSync invoke role |
| StepFunctionStack | VideoUploadStateMachine, LongVideoProcessStateMachine |
| UnifiedReasoningStack | UnifiedReasoningStateMachine |
| generateShortFunction.stack | GenerateShortStateMachine |
| generateLongVideoOutputFunction.stack | GenerateLongVideoStateMachine |
| uploadToYouTubeFunction.stack | YouTubeUpload Lambda |

#### S3 Bucket Configuration
- **Transfer Acceleration**: Enabled
- **EventBridge Notifications**: Enabled
- **Access Paths**:
  - `videos/*` — identity-scoped read/write/delete
  - `assets/*` — identity-scoped read-only
- **Asset Deployment**: `amplify/assets/` → `assets/` prefix (BucketDeployment)

### 2.4 Lambda Functions

| Function | Runtime | Memory | Timeout | 역할 |
|----------|---------|--------|---------|------|
| `detect-presenter-boundaries` | Python 3.12 | 512MB | 600s | Transcribe diarization 기반 경계 감지 |
| `analyze-presenter-segments` | Python 3.12 | 512MB | 600s | Bedrock LLM으로 세그먼트 분류 |
| `extract-topics-bedrock` | Python 3.12 | 512MB | 600s | 하이라이트 토픽 추출 |
| `process-topics-bedrock` | Python 3.12 | 512MB | 600s | 토픽 정제 |
| `extract-timeframe` | Python 3.12 | 512MB | 600s | 토픽-타임스탬프 매칭 |
| `detect-shot-changes` | Node.js | - | - | 장면 전환 감지 |
| `create-background` | Python 3.12 (Pillow layer) | - | - | 배경 생성 |
| `make-short-template` | Python 3.12 | - | - | MediaConvert 템플릿 |
| `unified-reasoning` | Python 3.12 | 512MB | 600s | 추론 모델 호출 |
| `generate-long-video-output` | Python 3.12 | - | - | 장시간 영상 MediaConvert 작업 |
| `youtube-upload` | Python 3.12 (google-api-python layer) | - | - | YouTube 업로드 |

---

## 3. 데이터 모델

### 3.1 DynamoDB Tables (AppSync 모델)

```
┌─────────────────────────────────────────────────────────────────┐
│                        History (owner-auth)                       │
│  PK: id | videoName, modelID, shortified, stage, numberOfVideos  │
│         | theme, videoLength                                     │
├──────────────────────────────────────────────────────────────────┤
│                       Highlight (owner-auth)                      │
│  Composite PK: VideoName + Index | duration, Question, Text      │
├──────────────────────────────────────────────────────────────────┤
│                      Gallery (authenticated)                      │
│  PK: id | historyId, highlightId, location, question, text       │
│  GSI: type-createdAt                                             │
├──────────────────────────────────────────────────────────────────┤
│                    LongVideoEdit (owner-auth)                     │
│  PK: id | videoName, modelID, stage, presenterCount(1|2)         │
│         | presenter1Name, presenter2Name                         │
├──────────────────────────────────────────────────────────────────┤
│                  LongVideoSegment (owner-auth)                    │
│  PK: id | longVideoEditId, startTime, endTime, speakerLabel      │
│         | segmentType, includeInOutput, aiConfidence              │
├──────────────────────────────────────────────────────────────────┤
│                   LongVideoOutput (owner-auth)                    │
│  PK: id | longVideoEditId, presenterNumber, s3Location           │
│         | youtubeVideoId, title, description, tags, uploadStatus │
├──────────────────────────────────────────────────────────────────┤
│                 YouTubeUpload (authenticated)                     │
│  PK: id | longVideoOutputId, longVideoEditId, presenterNumber    │
│         | youtubeVideoId, title, description, tags, uploadStatus │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Authorization Rules

| Model | Rule | 비고 |
|-------|------|------|
| History | `allow.owner()` | 생성자만 접근 가능 |
| Highlight | `allow.owner()` | 생성자만 접근 가능 |
| Gallery | `allow.authenticated()` | 모든 인증 사용자 접근 |
| LongVideoEdit | `allow.owner()` | 생성자만 접근 가능 |
| LongVideoSegment | `allow.owner()` | 생성자만 접근 가능 |
| LongVideoOutput | `allow.owner()` | 생성자만 접근 가능 |
| YouTubeUpload | `allow.authenticated()` | 모든 인증 사용자 접근 |

### 3.3 Custom Operations

| Type | Operation | Auth | Handler |
|------|-----------|------|---------|
| Mutation | `publish` | authenticated + **guest** | publish.js |
| Subscription | `receive` | authenticated | receive.js |
| Mutation | `publishLongVideo` | authenticated + **guest** | publishLongVideo.js |
| Subscription | `receiveLongVideo` | authenticated | receiveLongVideo.js |
| Query | `generateShort` | authenticated | generateShort.ts |
| Query | `generateLongVideoOutput` | authenticated | generateLongVideoOutput.ts |
| Query | `uploadToYouTube` | authenticated | uploadToYouTube.ts |
| Query | `suggestVideoMetadata` | authenticated | suggestVideoMetadata.ts |
| Query | `exchangeYouTubeToken` | authenticated | exchangeYouTubeToken.ts |
| Query | `checkYouTubeConnection` | authenticated | checkYouTubeConnection.ts |
| Query | `saveYouTubeChannel` | authenticated | saveYouTubeChannel.ts |

---

## 4. 처리 파이프라인 상세

### 4.1 Long Video Process Pipeline (LongVideoProcessStateMachine)

```
S3 Upload (LONG_RAW.mp4)
    │ EventBridge: Object Created
    ▼
┌─────────────────────┐
│  PrepareParameters   │ ← uuid, job name, S3 URI 추출
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│   GetEditRecord      │ ← DynamoDB: owner, presenterCount 조회
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ StartTranscriptionJob│ ← Transcribe: speaker diarization ON
│                     │   MaxSpeakerLabels: 10
│                     │   LanguageOptions: [en-US, ko-KR]
│                     │   Subtitles: VTT
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Wait (10s poll loop) │ ← GetTranscriptionJobStatus → COMPLETED?
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  UpdateDDB Stage=1   │ + EventBridge: LongVideoStageChanged
└─────────┬───────────┘
          ▼
┌─────────────────────────────────────┐
│  DetectPresenterBoundaries (Lambda)  │
│  Input:                              │
│    - uuid, bucket_name               │
│    - owner (from DDB)                │
│    - presenterCount (from DDB, "N")  │
│    - timestamp (State.EnteredTime)   │
│  Output (resultSelector):            │
│    - segments[]                       │
│    - boundaries[]                     │
│    - speaker_map{}                    │
│    - presenterCount                   │
└─────────┬───────────────────────────┘
          ▼
┌─────────────────────────────────────┐
│  AnalyzePresenterSegments (Lambda)   │
│  Input:                              │
│    - uuid, bucket_name               │
│    - segments (from boundary result) │
│    - boundaries                      │
│    - presenterCount                  │
│  Output:                             │
│    - statusCode, uuid, segmentCount  │
└─────────┬───────────────────────────┘
          ▼
┌─────────────────────┐
│  UpdateDDB Stage=2   │ + EventBridge: LongVideoStageChanged
└─────────────────────┘
```

### 4.2 DetectPresenterBoundaries 알고리즘 상세

```python
# 입력: videos/{uuid}/LongVideoTranscript.json (Amazon Transcribe output)

Step 1: detect_silence_gaps(transcript_json, min_gap=3.0s)
  - results.items 순회
  - 단어 간 갭 ≥ 3초면 silence gap 기록
  
Step 2: extract_speaker_segments(transcript_json)
  - results.speaker_labels.segments 읽기
  - 각 세그먼트의 첫/마지막 item에서 start/end time 추출
  
Step 3: merge_consecutive_speaker_segments(segments, max_gap=3.0s)
  - Pass 1: 같은 화자 + 갭 ≤ 3초 → 병합
  - Pass 2: 5초 미만 세그먼트 → 이전 세그먼트에 흡수
  
Step 4: detect_boundaries(transcript_json)
  - 인접 세그먼트의 화자가 다르면 boundary 생성
  - silence gap이 겹치면 confidence=0.9, 아니면 0.7
  
Step 5: Speaker Mapping (현재 문제점)
  - speakers = 등장 순서대로 리스트
  - speakers[0] = presenter1, speakers[1] = presenter2
  - ⚠️ 단순 순서 기반으로, 실제 메인 발표자가 아닐 수 있음
  
Step 6: DynamoDB BatchWrite
  - 모든 세그먼트를 LongVideoSegment 테이블에 저장
  - aiConfidence: 0.8 (전체 동일)
```

**제약사항:**
- `presenterCount`는 사용자가 업로드 시 지정 (1 또는 2)
- 3명 이상 화자는 현재 미지원 (추가 화자는 매핑되지 않아 'unknown' 처리)

### 4.3 AnalyzePresenterSegments 알고리즘 상세

```python
# 입력: detect-presenter-boundaries의 출력 + S3 transcript + DDB modelID

Step 1: DDB에서 modelID 조회 (사용자가 선택한 Bedrock 모델)
Step 2: S3에서 전체 transcript 텍스트 조회
Step 3: Bedrock Converse API 호출
  - 모델: 사용자 선택 모델 (예: us.anthropic.claude-sonnet-4-6-v1)
  - temperature: 0.3, maxTokens: 16384
  - 프롬프트에 포함:
    - transcript 앞 4000자 + (8000자 초과시) 뒤 4000자
    - 세그먼트 목록 (index: start-end speaker=X dur=Ys)
    - boundary 목록 (최대 30개, JSON)
  - AI 작업:
    - presenter1/2 라벨 유지 (Transcribe diarization 신뢰)
    - intro/outro/transition/qa/silence 구간 분류
    - includeInOutput=false 설정
    - <3초 세그먼트 병합
Step 4: 기존 세그먼트 삭제 (scan + batch delete)
Step 5: AI 결과 세그먼트 DDB 저장

# Fallback: Bedrock 오류 시 원본 세그먼트 유지 (aiConfidence=0.5)
```

### 4.4 Real-time Event Communication

```
Step Function → EventBridge (PutEvents)
    │ detail-type: "LongVideoStageChanged"
    │ detail: { videoId, stage }
    ▼
EventBridge Rule → AppSync Mutation (publishLongVideo)
    │
    ▼
AppSync Subscription (receiveLongVideo) → Frontend (real-time UI update)
    │ filter: videoId
    ▼
LongVideoEditorComponent: stage state 업데이트 → UI 변경
```

---

## 5. 보안 현황 및 이슈

### 5.1 인증 (Authentication)

| 항목 | 현재 상태 | 위험도 |
|------|-----------|--------|
| 인증 방식 | Cognito User Pool, email login | - |
| MFA | 미설정 | Low |
| 비밀번호 정책 | Cognito 기본값 (8자 이상) | Low |
| 세션 관리 | Cognito default token expiry | - |

### 5.2 인가 (Authorization)

| 이슈 | 현재 상태 | 위험도 | 설명 |
|------|-----------|--------|------|
| Gallery 모델 | `allow.authenticated()` | **Medium** | 다른 사용자의 Gallery 아이템 접근 가능 |
| YouTubeUpload 모델 | `allow.authenticated()` | **Medium** | 다른 사용자의 업로드 기록 접근 가능 |
| publish/publishLongVideo | `allow.guest()` 포함 | **Medium** | 미인증 사용자가 가짜 stage 이벤트 전송 가능 |

### 5.3 IAM 정책

| 리소스 | 현재 상태 | 위험도 | 권장 |
|--------|-----------|--------|------|
| Bedrock 정책 (AnalyzePresenterSegments) | `resources: ["*"]` | **High** | 모델 ARN 패턴으로 제한 |
| Secrets Manager 정책 (3개 YouTube 함수) | `resources: ["*"]` | **High** | 특정 secret ARN으로 제한 |
| states:StartExecution (4곳) | `resources: ["*"]` | Medium | 특정 StateMachine ARN으로 제한 |
| lambda:InvokeFunction (SM role) | `resources: ["*"]` | Medium | 특정 함수 ARN으로 제한 |
| MediaConvert role | AmazonS3FullAccess managed policy | Medium | 버킷 ARN으로 제한 |

### 5.4 입력 검증

| Lambda | 검증 여부 | 위험도 |
|--------|-----------|--------|
| detect-presenter-boundaries | ❌ 없음 | Medium |
| analyze-presenter-segments | ❌ 없음 | Medium |
| generateShort.ts | ❌ 없음 | Medium |
| generateLongVideoOutput.ts | ❌ 없음 | Medium |
| uploadToYouTube.ts | ❌ `JSON.parse(tags)` 미보호 | Medium |
| exchangeYouTubeToken.ts | ❌ `redirectUri` 미검증 | **High** |

### 5.5 데이터 보안

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| S3 암호화 | Amplify 기본값 (SSE-S3) | 명시 설정 없음 |
| DynamoDB 암호화 | AWS managed key (기본값) | - |
| HTTPS | CloudFront + AppSync 기본 적용 | - |
| YouTube OAuth | Secrets Manager 사용 | 올바른 구현 |
| localStorage에 client_id | 지속 저장 | Low risk |
| 프롬프트 인젝션 | 사용자 콘텐츠가 LLM 프롬프트에 직접 삽입 | Low-Medium |

---

## 6. 비용 분석

### 6.1 현재 파이프라인 비용 (1회 Long Video 처리 기준)

| 서비스 | 사용량 (예: 1시간 영상) | 예상 비용 |
|--------|------------------------|-----------|
| Amazon Transcribe | 60분 (speaker diarization) | ~$1.44 |
| Amazon Bedrock (Converse) | ~30K input + ~4K output tokens | ~$0.15-0.50 (모델에 따라) |
| AWS Lambda | 2 invocations × 512MB × ~60s | ~$0.001 |
| DynamoDB | ~50 writes + reads | ~$0.0001 |
| S3 | 1 GET + 1 PUT (transcript) | ~$0.000005 |
| Step Functions | ~15 state transitions | ~$0.000375 |
| **합계** | | **~$1.60-2.00/영상** |

### 6.2 비용 최적화 현황

- Transcribe: 언어 자동 감지 사용 (수동 지정이면 더 저렴할 수 있음)
- Bedrock: 사용자 모델 선택 가능 (비용/품질 트레이드오프)
- Lambda: 512MB 적정 (Python 3.12 최적)
- S3 Transfer Acceleration: 대용량 업로드에 유리하나 추가 비용 발생

---

## 7. 개선 계획 1: Timeline UX 개선

### 7.1 현재 상태

**파일:** `src/pages/longvideo/components/TimelineComponent.tsx`

```
현재 Timeline: 단일 40px 높이 flex bar
┌──────────────────────────────────────────────────────┐
│ [P1] [P2] [P1] [silence] [P1] [outro]               │ ← 비례 % 너비
└──────────────────────────────────────────────────────┘
0:00                                              45:30

문제점:
- 줌/스크롤 없음 → 긴 영상에서 세그먼트 구분 어려움
- 플레이헤드 없음 → 현재 재생 위치 파악 불가
- 드래그 리사이즈 없음 → 시간 수정은 텍스트 입력만 가능
- 멀티트랙 없음 → 발표자별 구분 시각화 불가
```

### 7.2 목표

```
개선 후 Timeline: 동영상 편집기 스타일
                    [Zoom -] [Zoom +] [160px/sec]
┌──────────────────────────────────────────────────────┐
│ P1 Track  │▓▓▓▓▓▓▓│    │▓▓▓▓▓▓▓▓▓│    │▓▓▓▓▓▓│     │
│ P2 Track  │    │▓▓▓│                │▓▓▓│            │
│ Other     │▓intro▓│         │▓silence│       │▓outro▓│
├───────────┼──────────────────────────────────────────┤
│ 0:00  1:00  2:00  3:00  4:00  5:00  ... ▼(playhead) │
└──────────────────────────────────────────────────────┘
            ←← 수평 스크롤 가능 →→
```

### 7.3 구현 방안

**라이브러리:** `@xzdarcy/react-timeline-editor` (MIT, v1.0.0, React 18 네이티브)

| 기능 | 구현 방법 |
|------|-----------|
| 수평 스크롤 | `scaleWidth` prop (px/sec) + 라이브러리 내장 스크롤 |
| 줌 인/아웃 | `scaleWidth` state 조절 (Cloudscape Button) |
| 플레이헤드 | `TimelineState.setTime()` + video.ontimeupdate 연동 |
| 드래그 리사이즈 | `onActionResizeEnd` → `updateSegment` API |
| 멀티트랙 | segments → TimelineRow[] 변환 (presenter1, presenter2, other) |
| 세그먼트 색상 | `getActionRender` custom renderer |
| 세그먼트 클릭 | `onClickAction` → video.currentTime = action.start |

### 7.4 데이터 변환

```typescript
// LongVideoSegment[] → TimelineRow[]
const rows: TimelineRow[] = [
  {
    id: 'presenter1',
    actions: segments
      .filter(s => s.segmentType === 'presenter1')
      .map(s => ({ id: s.id, start: s.startTime, end: s.endTime }))
  },
  {
    id: 'presenter2',  // presenterCount >= 2일 때만
    actions: segments
      .filter(s => s.segmentType === 'presenter2')
      .map(s => ({ id: s.id, start: s.startTime, end: s.endTime }))
  },
  {
    id: 'other',
    actions: segments
      .filter(s => !['presenter1','presenter2'].includes(s.segmentType))
      .map(s => ({ id: s.id, start: s.startTime, end: s.endTime }))
  }
];
```

### 7.5 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | `@xzdarcy/react-timeline-editor` 추가 |
| `src/pages/longvideo/components/TimelineComponent.tsx` | 전체 재작성 |
| `src/pages/longvideo/LongVideoEditorComponent.tsx` | `handleSegmentUpdate` 추가, props 전달 |

### 7.6 비용 영향
- **추가 비용 없음** (프론트엔드 전용 변경)
- npm 패키지 번들 사이즈 증가: ~50KB gzipped (추정)

---

## 8. 개선 계획 2: Presenter 인식 개선 A

### 8.1 현재 문제점

```python
# 현재 순서 기반 매핑 (detect-presenter-boundaries, line 137-146)
speakers = list(dict.fromkeys(seg['speaker_label'] for seg in merged_segments))
speaker_map = {}
if presenter_count == 1:
    for spk in speakers:
        speaker_map[spk] = 'presenter1'
elif len(speakers) >= 2:
    speaker_map[speakers[0]] = 'presenter1'  # ← 첫 등장 = presenter1 (부정확)
    speaker_map[speakers[1]] = 'presenter2'
```

**문제:** 첫 번째로 등장한 화자가 메인 발표자가 아닐 수 있음 (예: MC가 먼저 인사하고 메인 발표자를 소개하는 경우)

### 8.2 개선 방안: 발화 비율 기반 매핑

**제약사항 적용:**
- `presenterCount`는 반드시 1 또는 2 (사용자 지정, UI에서 선택)
- 3명 이상 화자가 감지되어도 최종 매핑은 1명 또는 2명 발표자로만

```python
# 개선된 매핑 로직
speech_durations: dict[str, float] = {}
for seg in merged_segments:
    lbl = seg['speaker_label']
    speech_durations[lbl] = speech_durations.get(lbl, 0.0) + (seg['end_time'] - seg['start_time'])

# 발화 시간 내림차순 정렬
ranked_speakers = sorted(speech_durations.keys(), key=lambda s: speech_durations[s], reverse=True)

speaker_map = {}
if presenter_count == 1:
    # 모든 화자를 presenter1로 매핑
    for spk in ranked_speakers:
        speaker_map[spk] = 'presenter1'
elif presenter_count == 2:
    if len(ranked_speakers) >= 2:
        speaker_map[ranked_speakers[0]] = 'presenter1'  # 가장 많이 말한 화자
        speaker_map[ranked_speakers[1]] = 'presenter2'  # 두 번째로 많이 말한 화자
        # 3명 이상 화자는 가장 가까운 발표자에 매핑 또는 presenter2로 통합
        for spk in ranked_speakers[2:]:
            speaker_map[spk] = 'presenter2'
    elif len(ranked_speakers) == 1:
        speaker_map[ranked_speakers[0]] = 'presenter1'
```

### 8.3 LLM 프롬프트 보강

`analyze-presenter-segments`에 추가 컨텍스트:

```
Speaker speech-time analysis:
  spk_0 → presenter1: 2145.3s (72.3% of total speech)
  spk_1 → presenter2: 821.7s (27.7% of total speech)

Content-based presenter identification hints:
- "welcome", "good morning" 등 인사말이 첫 세그먼트에 있으면 host/presenter1 가능성 높음
- 짧은 질문만 하는 화자는 청중/모더레이터 (main presenter가 아님)
- 발화 비율 매핑을 유지하되, 콘텐츠가 명확히 모순되면 재분류 가능
```

### 8.4 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `.../detect-presenter-boundaries/lambda_function.py` | Input validation + 발화 비율 매핑 + speech_ratio_metadata 반환 |
| `.../step-functions/LongVideoProcessStateMachine.ts` | resultSelector/payload에 speech_ratio_metadata 추가 |
| `.../analyze-presenter-segments/lambda_function.py` | Input validation + 프롬프트 보강 + 데이터 새니타이징 |
| `.../AnalyzePresenterSegments/resource.ts` | Bedrock IAM scope 축소 |

### 8.5 비용 영향
- **추가 비용 없음** — 동일 Lambda 실행 내에서 로직만 변경
- Bedrock 프롬프트 길이 미세 증가: ~200 tokens → ~$0.001 추가

---

## 9. 개선 계획 3: Presenter 인식 개선 B

### 9.1 목표

세그먼트 경계 지점에서 영상 프레임을 추출하여 Bedrock Vision으로 시각 분석, 음성 diarization과 교차 검증.

### 9.2 아키텍처 변경

```
기존: DetectPresenterBoundaries → AnalyzePresenterSegments
개선: DetectPresenterBoundaries → AnalyzeVideoFrames (NEW) → AnalyzePresenterSegments
```

### 9.3 AnalyzeVideoFrames Lambda 설계

| 속성 | 값 |
|------|---|
| Runtime | Python 3.12 |
| Memory | 2048 MB (FFmpeg 처리용) |
| Ephemeral Storage | 2048 MB |
| Timeout | 600s |
| Layer | FFmpeg static binary (linux-amd64) |
| Bedrock Model | Claude Sonnet (Vision 지원) — 고정 (비용 최적화) |

### 9.4 처리 플로우

```
Input: { uuid, segments, boundaries, speech_ratio_metadata, presenterCount }
  │
  ▼
1. Validate inputs (uuid format, presenterCount, timestamps)
  │
  ▼
2. Select boundaries to analyze
   - 화자 전환이 있는 boundary만 선택
   - 최대 10개로 제한 (비용 캡)
   - confidence가 낮은 순으로 우선 선택 (0.7 우선 → 시각 검증 가치 높음)
  │
  ▼
3. Generate presigned URL for video
  │
  ▼
4. For each boundary (최대 10개):
   ├─ FFmpeg: -ss {timestamp} -i {presigned_url} -vframes 1 -vf scale=640:-1 -q:v 5
   ├─ Validate frame size (< 5MB)
   └─ Bedrock Vision API (Claude Sonnet):
      ├─ Input: JPEG frame + structured prompt
      └─ Output: { people_count, layout, transition_visible, confidence }
  │
  ▼
5. Return: { ...event, visual_analysis: [...results] }
```

### 9.5 보안 설계

| 위협 | 대응 |
|------|------|
| S3 path traversal | `videos/{uuid}/` prefix 강제 검증 + Path normalization |
| Timestamp manipulation | 0 ≤ t ≤ video_duration 범위 검증 |
| DoS via excessive frames | MAX_BOUNDARIES=10 하드캡 |
| Large frame file | MAX_FRAME_SIZE=5MB 검증 |
| /tmp 잔여 파일 | finally 블록에서 항상 삭제 |
| Bedrock cost explosion | boundary 수 제한 + 작은 이미지(640px) |
| Presigned URL 노출 | 600초 만료, Lambda 내부에서만 사용 |

### 9.6 Bedrock Vision 프롬프트

```
This is a video frame captured at {timestamp:.1f} seconds, at a speaker transition point.

Please analyze:
1. How many people are visible? (0, 1, 2, or more)
2. Describe the screen layout: single speaker, split screen, slides only, or other.
3. Is there a visible change in who is speaking (new person at podium, camera angle change)?
4. Rate your confidence that a real speaker transition occurs here: low/medium/high.

Respond as JSON: { people_count, layout, transition_visible, confidence }
```

### 9.7 AnalyzePresenterSegments 활용

`visual_analysis` 결과를 프롬프트에 추가:

```
Visual frame analysis at boundary points:
  t=125.3s: 2 people, layout=split screen, transition_visible=True, visual_confidence=high
  t=340.7s: 1 person, layout=single speaker, transition_visible=False, visual_confidence=low
  ...

Use visual analysis to:
- Boost boundary confidence where transition_visible=True and confidence=high
- Reduce confidence where visual shows single person with no layout change
- If people_count=0 (slides only), classify as 'transition' rather than presenter segment
```

### 9.8 변경 파일

| 파일 | 변경 |
|------|------|
| `amplify/custom/lambda-layers/ffmpeg/bin/ffmpeg` | 신규 — FFmpeg 바이너리 |
| `amplify/custom/AnalyzeVideoFrames/resource.ts` | 신규 — CDK Construct |
| `amplify/custom/lambda-functions/analyze-video-frames/lambda_function.py` | 신규 — Lambda 코드 |
| `amplify/custom/resource.ts` | export 추가 |
| `amplify/custom/step-functions/LongVideoProcessStateMachine.ts` | 파이프라인에 단계 삽입 |
| `amplify/custom/lambda-functions/analyze-presenter-segments/lambda_function.py` | visual_analysis 활용 |

---

## 10. 비용 영향 분석

### 10.1 개선 후 비용 (1회 Long Video 처리, 1시간 영상 기준)

| 서비스 | 기존 비용 | 추가 비용 (개선 A) | 추가 비용 (개선 B) |
|--------|-----------|-------------------|-------------------|
| Amazon Transcribe | ~$1.44 | $0 | $0 |
| Bedrock (analyze-segments) | ~$0.15-0.50 | ~$0.001 (프롬프트 증가) | ~$0.001 (프롬프트 증가) |
| **Bedrock Vision (NEW)** | - | - | **~$0.30-0.60** |
| Lambda (analyze-video-frames) | - | - | ~$0.002 (2048MB × 60s) |
| S3 | ~$0.000005 | $0 | ~$0.00005 (presigned GET) |
| **합계** | ~$1.60-2.00 | **~$1.60-2.00** | **~$1.90-2.60** |

### 10.2 Bedrock Vision 비용 상세 (개선 B)

```
Claude Sonnet Vision (us-west-2):
- Input: ~1,500 tokens/image + ~200 tokens prompt = ~1,700 tokens
- Output: ~100 tokens (JSON response)

최대 10 boundaries × 1 frame:
- Input: 10 × 1,700 = 17,000 tokens × $0.003/1K = $0.051
- Output: 10 × 100 = 1,000 tokens × $0.015/1K = $0.015
- Image processing fee: 별도 과금 없음 (token에 포함)

⚠️ 이미지 토큰 계산: 640×360 JPEG ≈ ~800 tokens
실제: 10 × (800+200) input = 10,000 tokens = ~$0.03
     10 × 100 output = 1,000 tokens = ~$0.015

예상 범위: $0.05 - $0.60 (boundary 수와 이미지 크기에 따라)
```

### 10.3 비용 최적화 전략

| 전략 | 절감 효과 | 구현 복잡도 |
|------|-----------|-------------|
| boundary 분석 수 제한 (10개 캡) | 비용 상한 보장 | 낮음 |
| confidence < 0.8인 boundary만 분석 | ~50% 절감 | 낮음 |
| 이미지 해상도 축소 (640→320px) | ~30% 절감 | 낮음 |
| Haiku 모델 사용 (Vision 지원) | ~80% 절감 | 낮음 |
| 1시간 미만 영상만 프레임 분석 적용 | 비용 폭발 방지 | 중간 |
| 프레임 분석 opt-in (사용자 선택) | 불필요 호출 제거 | 중간 |

### 10.4 비용 캡 권장

```python
# 비용 상한 설정
MAX_BOUNDARIES_TO_ANALYZE = 10          # 최대 10개 boundary
MAX_FRAME_COST_ESTIMATE = 0.60          # $0.60 이상이면 skip (예비)
USE_HAIKU_FOR_VISION = True             # Haiku 사용 시 ~$0.05-0.10으로 절감

# boundary 선택 우선순위 (비용 대비 효과 최대화)
# 1. confidence가 낮은 boundary 우선 (시각 검증 가치 높음)
# 2. 화자 전환이 있는 boundary만 (같은 화자 경계는 skip)
```

---

## 11. 보안 개선 사항

### 11.1 Phase 2에서 수정할 보안 이슈

| # | 이슈 | 대응 | 파일 |
|---|------|------|------|
| 1 | Lambda 입력 미검증 | uuid, presenterCount, timestamp 검증 추가 | detect-presenter-boundaries, analyze-presenter-segments |
| 2 | Bedrock IAM wildcard | 모델 ARN 패턴으로 scope 축소 | AnalyzePresenterSegments/resource.ts |
| 3 | 프롬프트 인젝션 위험 | `html.escape` + XML tag 구분자 | analyze-presenter-segments |
| 4 | transcript 접근 오류 미처리 | try/except + fallback | analyze-presenter-segments |

### 11.2 Phase 3에서 수정할 보안 이슈

| # | 이슈 | 대응 | 파일 |
|---|------|------|------|
| 5 | S3 path traversal | prefix 패턴 강제 + Path normalization | analyze-video-frames |
| 6 | 리소스 소진 공격 | frame 수/크기 제한, /tmp cleanup | analyze-video-frames |
| 7 | 새 Lambda Bedrock 권한 | scoped ARN (anthropic.claude-*/amazon.nova-*) | AnalyzeVideoFrames/resource.ts |

### 11.3 추후 개선 권장 (본 계획 범위 밖)

| # | 이슈 | 위험도 | 권장 |
|---|------|--------|------|
| A | Secrets Manager wildcard IAM | High | youtube-oauth-credentials ARN으로 제한 |
| B | exchangeYouTubeToken redirectUri 미검증 | High | 허용 origin 목록으로 검증 |
| C | publish/publishLongVideo guest 접근 | Medium | `allow.guest()` 제거 |
| D | Gallery/YouTubeUpload authenticated 접근 | Medium | `allow.owner()`로 변경 |
| E | states:StartExecution wildcard | Medium | 각 StateMachine ARN으로 제한 |
| F | JSON.parse(tags) 미보호 | Medium | try/catch 추가 |

---

## 12. 검증 계획

### 12.1 Phase 1 (Timeline) 검증

```bash
npm run build     # TypeScript 에러 없음
npm run lint      # ESLint 경고 없음
npm run dev       # 개발 서버 실행
```

**브라우저 테스트:**
- [ ] /longvideo/edit/:id 접속 → 멀티트랙 타임라인 렌더링
- [ ] 줌 인/아웃 버튼 동작
- [ ] 수평 스크롤 동작
- [ ] 비디오 재생 → 플레이헤드 이동
- [ ] 세그먼트 클릭 → 비디오 seek
- [ ] 세그먼트 드래그 리사이즈 → API 저장 확인 (Network 탭)
- [ ] presenterCount=1일 때 presenter2 트랙 미표시

### 12.2 Phase 2 (Presenter A) 검증

```bash
npx ampx sandbox  # CDK 배포 성공
```

**파이프라인 테스트:**
- [ ] 테스트 영상 업로드 → Step Function 실행
- [ ] CloudWatch Logs: input validation 통과
- [ ] CloudWatch Logs: speech_ratio_metadata 출력 확인
- [ ] DynamoDB: presenter1이 실제 더 많이 말한 화자에 매핑됨
- [ ] 잘못된 presenterCount(예: 3) 전달 시 ValueError 발생

### 12.3 Phase 3 (Presenter B) 검증

```bash
npx ampx sandbox  # CDK 배포 성공 (새 Lambda + Layer)
```

**파이프라인 테스트:**
- [ ] Step Function에서 AnalyzeVideoFrames 단계 정상 실행
- [ ] CloudWatch Logs: frame extraction 성공/실패 로그
- [ ] CloudWatch Logs: Bedrock Vision 응답 확인
- [ ] visual_analysis가 analyze-presenter-segments로 전달됨
- [ ] boundary 10개 초과 시 제한 동작
- [ ] /tmp cleanup 확인 (Lambda 재사용 시 디스크 풀 방지)

---

## Appendix A: 현재 파일 구조 (관련 부분)

```
amplify/
├── auth/resource.ts                    # Cognito 설정
├── storage/resource.ts                 # S3 설정
├── data/
│   ├── resource.ts                     # GraphQL 스키마 + 함수 정의
│   ├── publish.js                      # Stage change publisher
│   ├── publishLongVideo.js             # Long video stage publisher
│   ├── generateShort.ts                # Short 생성 쿼리 핸들러
│   ├── generateLongVideoOutput.ts      # Long video output 쿼리 핸들러
│   ├── uploadToYouTube.ts              # YouTube 업로드 핸들러
│   ├── suggestVideoMetadata.ts         # 메타데이터 제안 핸들러
│   ├── exchangeYouTubeToken.ts         # YouTube OAuth 토큰 교환
│   ├── checkYouTubeConnection.ts       # YouTube 연결 확인
│   └── saveYouTubeChannel.ts           # YouTube 채널 저장
├── backend.ts                          # 전체 인프라 연결 (CDK)
└── custom/
    ├── resource.ts                     # Export 집합
    ├── DetectPresenterBoundaries/resource.ts    # CDK Construct
    ├── AnalyzePresenterSegments/resource.ts     # CDK Construct
    ├── lambda-functions/
    │   ├── detect-presenter-boundaries/lambda_function.py
    │   ├── analyze-presenter-segments/lambda_function.py
    │   ├── analyze-video-frames/lambda_function.py  (NEW - Phase 3)
    │   └── ...
    ├── lambda-layers/
    │   ├── pillow/
    │   ├── google-api-python/
    │   └── ffmpeg/                     (NEW - Phase 3)
    ├── step-functions/
    │   ├── LongVideoProcessStateMachine.ts
    │   ├── GenerateLongVideoStateMachine.ts
    │   ├── VideoUploadStateMachine.ts
    │   ├── GenerateShortStateMachine.ts
    │   └── UnifiedReasoningStateMachine.ts
    └── AnalyzeVideoFrames/resource.ts  (NEW - Phase 3)

src/
├── pages/longvideo/
│   ├── LongVideoEditorComponent.tsx    # 편집기 메인 (수정)
│   └── components/
│       ├── TimelineComponent.tsx        # 타임라인 (전체 재작성)
│       └── SegmentListComponent.tsx     # 세그먼트 목록 (변경 없음)
└── apis/
    └── longVideoSegment.ts             # API 유틸리티 (변경 없음)
```

## Appendix B: 의존성 추가

```json
// package.json에 추가
{
  "dependencies": {
    "@xzdarcy/react-timeline-editor": "^1.0.0"   // Phase 1
  }
}
```

## Appendix C: Presenter Count 제약사항

현재 시스템에서 `presenterCount`는:
- **값 범위**: 1 또는 2 (DynamoDB: `a.integer().default(2)`)
- **설정 시점**: 사용자가 Long Video 업로드 시 UI에서 선택
- **사용처**:
  - `detect-presenter-boundaries`: 화자 매핑 로직 분기
  - `analyze-presenter-segments`: LLM 프롬프트 분기 (1명 vs 2명 지시)
  - Frontend: presenter2 관련 UI 요소 표시/숨김

**개선 시 고려:**
- 3명 이상 발표자는 현재 미지원이며, 본 개선 계획에서도 지원하지 않음
- Transcribe가 10명까지 diarization 가능하나, 3명 이상 화자는 가장 많이 말한 2명으로 매핑
- 향후 확장 시: presenterCount validation을 `range(1, MAX_PRESENTERS+1)`로 변경 가능
