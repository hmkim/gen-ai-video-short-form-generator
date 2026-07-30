# Code Structure

## Build System
- **Type**: npm + Vite
- **Configuration**: `package.json` (`build`: tsc && vite build — noUnusedLocals 등 엄격, `lint`: --max-warnings 0, `test`: vitest run), Python Lambda는 각 디렉터리에서 pytest

## Existing Files Inventory (이번 변경의 수정 후보)

### Frontend — upload flow
- `src/App.tsx` — 라우트 정의. `/upload` → UnifiedUploadComponent
- `src/pages/UnifiedUploadComponent.tsx` — 목적 선택 런처(카드 3개, navigate만 수행). **주 수정 대상**
- `src/pages/VideoUploadComponent.tsx` — 쇼츠 업로드 폼: `useApprovedModels` 훅, Tiles(업로드/S3 URI), 클립수·테마·길이 Input, StorageManager(`path="videos/"`, accept video/mp4, `{historyId}/RAW.mp4`)
- `src/pages/longvideo/LongVideoUploadComponent.tsx` — 화자별 업로드 폼: 모델, 발표자 수 RadioGroup(1/2), 발표자 이름 Input, StorageManager(`{editId}/LONG_RAW.mp4`)
- `src/pages/MainComponent.tsx` — SideNavigation 메뉴 구조
- `src/pages/__tests__/UnifiedUploadComponent.test.tsx` — 런처 카드/네비게이션 테스트 5건 (변경 시 갱신 필요)

### Frontend — APIs (AppSync client wrappers)
- `src/apis/history.ts` — `fetchHistories()` (History.list), `createHistory(videoName, modelID, numberOfVideos, theme, videoLength)`
- `src/apis/longVideoEdit.ts` — `fetchLongVideoEdits()`, `createLongVideoEdit(videoName, modelID, presenterCount, presenter1Name, presenter2Name?)`, `updateLongVideoEdit`
- `src/data/useApprovedModels.ts` — 모델 드롭다운 옵션 훅 (APPROVED 카탈로그 + 정적 폴백)

### Backend (참고 — 이번 요구엔 원칙적으로 변경 불요)
- `amplify/storage/resource.ts` — S3 (Transfer Acceleration, EventBridge on)
- `amplify/backend.ts` — EventBridge rule: `RAW.mp4` suffix → VideoUploadStateMachine, `LONG_RAW.mp4` → LongVideoProcessStateMachine
- `amplify/data/resource.ts` — History/LongVideoEdit 모델 (owner auth)

## Design Patterns
### Record-first upload
- **Location**: 두 업로드 컴포넌트의 `processFile`
- **Purpose**: S3 키에 레코드 id를 넣어 파이프라인이 레코드를 역추적 가능하게 함
- **Implementation**: `create*()` → 반환 id로 `key` 구성 → StorageManager가 PUT → S3 이벤트가 SFN 트리거

### Suffix-routed pipelines
- **Location**: `amplify/backend.ts` EventBridge rules
- **Purpose**: 단일 버킷에서 두 파이프라인 분리
- **Implementation**: object key suffix 매칭 (`RAW.mp4` vs `LONG_RAW.mp4`). 주의: `LONG_RAW.mp4`도 `RAW.mp4`로 끝나므로 쇼츠 룰이 suffix `RAW.mp4`만 보면 오탐 — 실제 룰 정의 확인 필요(코드 생성 시 검증 항목)

## Critical Dependencies
- `@aws-amplify/ui-react-storage` StorageManager — 업로드 UI/진행률/S3 PUT 담당
- `aws-amplify/storage` — `copy`/`list` API (기존 영상 재사용 구현 시 사용 후보)
- `@cloudscape-design/components` — 모든 UI
