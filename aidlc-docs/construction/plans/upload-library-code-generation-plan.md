# Code Generation Plan — upload-library

## Unit Context
- **Stories**: US-1 ~ US-8 전부 (단일 유닛)
- **Dependencies**: 기존 apis/history·longVideoEdit, useApprovedModels, StorageManager, Amplify Storage copy/list — 전부 기존 자산
- **Interfaces**: 기존 파이프라인 계약 불변 (`videos/{id}/RAW.mp4`, `videos/{id}/LONG_RAW.mp4`)
- **Owned entities**: Video 모델 (신규)
- **Project type**: Brownfield — 기존 파일은 in-place 수정

## 실행 단계

### Backend
- [x] Step 1: `amplify/data/resource.ts` — Video 모델 추가 (ID-1 스키마) [US-1]
- [x] Step 2: `amplify/backend.ts` — 쇼츠 EventBridge 룰 `key: [{wildcard: "*/RAW.mp4"}]`로 수정 (ID-3, 실검증 완료 패턴) [US-8]

### 순수 로직 + PBT (Business Logic)
- [x] Step 3: `src/data/videoLibrary.ts` 생성 — librarySourceKey/pipelineDestKey/classifyKey/mergeSelectableVideos/validateCopySize/deriveTitle (BR-1~BR-7, §3 타입 포함) [US-1~US-6, US-8]
- [x] Step 4: `package.json` — fast-check devDependency 추가 (PBT-09)
- [x] Step 5: `src/test/generators.ts` 생성 — 도메인 생성기 중앙화 (PBT-07)
- [x] Step 6: `src/data/__tests__/videoLibrary.test.ts` — §5 속성 전부(PBT-02/03/04) + 예제 기반 핵심 케이스(PBT-10)

### API Layer
- [x] Step 7: `src/apis/video.ts` 생성 — createVideo/fetchVideos/deleteVideo/listExistingSourceKeys/copyToPipeline [US-1~US-6]

### Frontend Components
- [x] Step 8: `src/pages/UnifiedUploadComponent.tsx` → VideoLibraryPage로 전면 재작성 (in-place, 파일명 유지) [US-1, US-2]
- [x] Step 9: `src/pages/VideoPicker.tsx` 생성 — 공유 선택 컴포넌트 (data-testid 부여) [US-3, US-5]
- [x] Step 10: `src/pages/VideoUploadComponent.tsx` → ShortsCreatePage로 전면 재작성 (pick→form 2단계) [US-3, US-4]
- [x] Step 11: `src/pages/longvideo/LongVideoUploadComponent.tsx` → SpeakerEditCreatePage로 전면 재작성 [US-5, US-6]
- [x] Step 12: `src/pages/MainComponent.tsx` — 네비게이션 라벨/구조 갱신 [US-7]

### Frontend Tests
- [x] Step 13: `src/pages/__tests__/UnifiedUploadComponent.test.tsx` — 라이브러리 화면 기준으로 재작성; VideoPicker·Create 페이지 상태 분기 예제 테스트 추가 [US-1~US-7]

### Documentation
- [x] Step 14: `aidlc-docs/construction/upload-library/code/code-summary.md` — 생성/수정 파일 요약
- [x] Step 15: `CLAUDE.md` 라우트 표 갱신

## Story Traceability
- [x] US-1 (Step 1,3,7,8) / [x] US-2 (Step 7,8) / [x] US-3 (Step 3,7,9,10) / [x] US-4 (Step 3,7,10)
- [x] US-5 (Step 9,11) / [x] US-6 (Step 3,7,11) / [x] US-7 (Step 8,10,11,12) / [x] US-8 (Step 2,3,6)

## PBT Compliance 목표 (Generation)
PBT-02(round-trip: key gen×classify), PBT-03(invariant: merge/size/title), PBT-04(idempotence: merge), PBT-07(도메인 생성기), PBT-08(shrinking 기본 유지+seed 로깅), PBT-10(예제 테스트 병행, 파일 내 describe 분리)
