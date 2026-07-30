# Code Summary — upload-library

## Modified (in-place)
- `amplify/data/resource.ts` — Video 모델 추가 (owner auth, title/s3Key/sizeBytes/status)
- `amplify/backend.ts` — 쇼츠 EventBridge 룰 `{wildcard: "*/RAW.mp4"}`로 수정 (LONG_RAW 이중 트리거 버그 해결, test-event-pattern 실검증)
- `src/pages/UnifiedUploadComponent.tsx` — 라우팅 런처 → **영상 라이브러리 화면**(업로드+목록)으로 전면 재작성
- `src/pages/VideoUploadComponent.tsx` — 업로드 폼 → **쇼츠만들기 pick→form 2단계** 재작성 (History 생성 + S3 복사 + BR-6 보상)
- `src/pages/longvideo/LongVideoUploadComponent.tsx` — 동일 패턴으로 **화자별 편집** 재작성
- `src/pages/MainComponent.tsx` — 네비게이션: "영상 업로드"/"쇼츠만들기"/"화자별 편집" 라벨 정합
- `src/pages/__tests__/UnifiedUploadComponent.test.tsx` — 라이브러리+VideoPicker 기준으로 재작성 (6 테스트)
- `package.json` — fast-check devDependency (PBT-09)
- `CLAUDE.md` — 라우트 표 갱신

## Created
- `src/data/videoLibrary.ts` — 순수 로직 (키 생성/분류, 병합·대사, 크기·제목 규칙) — PBT 대상
- `src/apis/video.ts` — Video CRUD + S3 list/copy 래퍼
- `src/pages/VideoPicker.tsx` — 공유 영상 선택 컴포넌트
- `src/test/generators.ts` — PBT 도메인 생성기 (PBT-07)
- `src/data/__tests__/videoLibrary.test.ts` — 속성 7 + 예제 5 (PBT-02/03/04/10)

## Test 결과 (생성 시점)
- tsc --noEmit 통과, Vitest 3 파일 28 테스트 전부 통과

## PBT Compliance (Code Generation)
| 규칙 | 상태 |
|---|---|
| PBT-02 round-trip | ✅ 키 생성×분류 |
| PBT-03 invariant | ✅ merge 부분집합·정렬·개수, 크기 경계, 제목 비공백 |
| PBT-04 idempotence | ✅ merge 재적용 동일 + 입력 불변 |
| PBT-05 oracle | N/A — 참조 구현 없음 (신규 로직, 단순 규칙) |
| PBT-06 stateful | N/A — 순수 함수만 (컴포넌트 상태는 예제 기반) |
| PBT-07 generators | ✅ src/test/generators.ts 중앙화 (uuid/ISO 날짜/제약 크기) |
| PBT-08 shrinking/seed | ✅ fast-check 기본(shrink+seed 출력) 유지, 비활성화 없음 |
| PBT-09 framework | ✅ fast-check 3.23 (Vitest 통합) |
| PBT-10 complementary | ✅ describe 블록으로 PBT/예제 분리, 핵심 시나리오 예제 고정 |
