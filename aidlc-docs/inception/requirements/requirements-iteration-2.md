# Requirements — Iteration 2: simple-fixes (Minimal depth)

## Intent Analysis
- **Request type**: Bug fix 1건 + UI 개편 2건 (소규모)
- **Depth**: Minimal — 조건부 단계 생략, 요구사항 기록 → 코드 → 빌드/테스트
- **승인 방침**: 표준 방침(비크리티컬 자동 진행), 배포는 사용자 확인

## R1: 모델 새로고침 에러 수정 (버그)
- 증상: `/admin/models` 새로고침 클릭 시 "새로고침에 실패했습니다. 기존 목록을 유지합니다."
- **원인 (조사 확정)**: `listFoundationModels.ts`가 신규 발견 모델을 메모리 객체(`item`)로 반환하는데, 이 객체에 `createdAt`/`updatedAt`이 없음. DynamoDB에는 스프레드로 넣지만 반환 배열에는 누락. GraphQL 스키마는 `createdAt: AWSDateTime!`(non-null)이라 AppSync가 신규 항목마다 nullability 오류를 반환 → 프론트가 errors 감지 → 실패 표시. (직접 Lambda invoke는 AppSync 검증을 우회하므로 정상으로 보였음. 첫 새로고침에서 DDB 쓰기는 성공했으므로 두 번째 클릭부터는 우연히 성공하는 상태)
- 수정: 반환 item에 `createdAt`/`updatedAt` 포함

## R2: 영상 업로드 화면 분리
- `/upload`: 업로드 기능만 남김 (목록 제거, 업로드 후 라이브러리 안내)
- "내 라이브러리"는 별도 메뉴/라우트로 분리

## R3: 내 라이브러리 관리 메뉴 신설 (`/library`)
- 목록: 제목, **파일명(신규 컬럼 — 업로드 시 원본 파일명 보존)**, 크기, 업로드 일시
- 제목 수정 (인라인/모달) — 빈 제목 불허(BR-2 재사용)
- 삭제 — 확인 모달 후 Video 레코드 + S3 원본 객체 삭제 (파이프라인 복사본은 독립 객체라 기존 처리에 영향 없음)
- 데이터: Video 모델에 `fileName` 필드 추가 (기존 레코드는 null 허용, '-' 표시)

## 회귀 제약
- VideoPicker/처리 시작 흐름(iteration 1) 불변
- 품질 게이트 동일 (tsc/eslint/Vitest/PBT — 신규 순수 로직 없으면 기존 PBT 유지 + 예제 테스트)
