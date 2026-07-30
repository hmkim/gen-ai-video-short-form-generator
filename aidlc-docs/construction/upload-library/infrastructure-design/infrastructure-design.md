# Infrastructure Design — upload-library

## ID-1: Video 모델 (amplify/data/resource.ts)
```
Video: a.model({
  title: a.string().required(),
  s3Key: a.string().required(),
  sizeBytes: a.integer(),
  status: a.enum(['UPLOADED']),
}).authorization(allow => [allow.owner()])
```
- owner auth — History/LongVideoEdit와 동일 패턴 (BR-4 위임)
- 마이그레이션: 추가만 — 기존 테이블 불변, 배포 시 신규 DynamoDB 테이블 생성

## ID-2: S3 키 설계 (권한 변경 없음)
| 용도 | 키 | 트리거 |
|---|---|---|
| 라이브러리 원본 | `videos/library/{videoId}/SOURCE.mp4` | 없음 (AC-8.3) |
| 쇼츠 처리 | `videos/{historyId}/RAW.mp4` (복사 대상) | 쇼츠 SFN |
| 화자별 처리 | `videos/{editId}/LONG_RAW.mp4` (복사 대상) | 화자별 SFN |
- `videos/*` 경로의 기존 identity 권한(read/write/delete)이 list·copy를 포함 — storage/resource.ts 변경 불요
- 주의: 라이브러리 키가 `videos/library/...`이므로 쇼츠 SFN의 uuid 파싱(`split('/')[1]`)과 충돌하지 않음 (트리거 자체가 안 됨)

## ID-3: EventBridge 쇼츠 룰 수정 (amplify/backend.ts — FR-5/US-8)

### 현재 패턴의 문제 (검증 완료)
```ts
key: [{ prefix: "*/" }, { suffix: "RAW.mp4" }]
```
- EventBridge 배열은 **OR** 의미. `prefix: "*/"`는 리터럴 prefix(와일드카드 아님)라 어떤 키와도 매칭 안 됨 → 실효 패턴은 `suffix: "RAW.mp4"` 단독
- `LONG_RAW.mp4`는 `RAW.mp4`로 끝나므로 **화자별 업로드가 쇼츠 SFN도 트리거** (버그 확정)

### 수정안
```ts
key: [{ wildcard: "*/RAW.mp4" }]
```
- `*`는 임의 문자열(경로 포함) — `videos/{id}/RAW.mp4` 매칭
- `videos/{id}/LONG_RAW.mp4`는 `RAW.mp4` 직전 문자가 `_`(패턴은 `/RAW.mp4` 요구) → 미매칭 (AC-8.1)
- `videos/library/{id}/SOURCE.mp4` → 미매칭 (AC-8.3)
- 화자별 룰(`suffix: "LONG_RAW.mp4"`)은 변경 불요 — 정확함

### 검증 결과 (설계 시점에 `aws events test-event-pattern`으로 실검증 완료)
| 키 | 현재 패턴 | 수정 패턴 |
|---|---|---|
| `videos/abc/RAW.mp4` | True | True ✓ (회귀 없음, AC-8.2) |
| `videos/abc/LONG_RAW.mp4` | **True (버그 확정)** | False ✓ (AC-8.1) |
| `videos/library/abc/SOURCE.mp4` | False | False ✓ (AC-8.3) |

## ID-4: 배포·롤백
- 배포: main push → Amplify 자동 (사용자 확인 후 — 크리티컬 게이트)
- 롤백: git revert — Video 테이블은 잔존해도 무해(참조 없음), EventBridge 룰은 이전 패턴 복원
- 샌드박스 없음 — 프로덕션 검증은 배포 후 test-event-pattern·실업로드로 수행

## PBT Compliance (Infrastructure Design 단계)
- 해당 규칙 없음 (PBT-09는 Functional Design에서 fast-check로 선정 완료) — N/A
