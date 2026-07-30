# Build and Test Summary — upload-library

## 실행 결과 (2026-07-30)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 빌드 | `npm run build` (tsc strict + vite) | ✅ 통과 |
| 타입 체크 | `npx tsc --noEmit` | ✅ 통과 |
| 린트 | `npx eslint <변경 12파일> --max-warnings 0` | ✅ 통과 (MainComponent의 `Function` 타입 pre-existing 오류를 `(() => void)`로 수정 — 이번 변경 파일이라 함께 해소) |
| 프론트 테스트 | `npm test` (Vitest) | ✅ 3파일 28/28 통과 |
| PBT | videoLibrary.test.ts (fast-check) | ✅ 속성 7개 통과 (round-trip/invariant/idempotence) |
| Python 회귀 | pytest ×2 Lambda | ✅ 26 + 11 통과 |
| EventBridge 패턴 | `aws events test-event-pattern` (설계 단계 실검증) | ✅ RAW=True / LONG_RAW=False / SOURCE=False |

## 테스트 실행 방법
- 프론트: `npm test` (watch: `npm run test:watch`)
- PBT만: `npx vitest run src/data/__tests__/videoLibrary.test.ts` — 실패 시 fast-check이 seed와 shrunk 반례를 출력 (재현: 출력된 seed를 fc.assert의 `{seed}` 파라미터로 전달)
- Python: 각 Lambda 디렉터리에서 `python3 -m pytest`
- CI: main push 시 Amplify Hosting 빌드가 `npm run build` 실행 (테스트는 로컬/PR 게이트)

## PBT Compliance (Build & Test — PBT-08)
- shrinking: fast-check 기본 활성 (비활성화한 테스트 없음)
- seed 로깅: 실패 시 fast-check이 seed·counterexample 자동 출력
- CI 통합: `npm test`에 PBT 포함 — 별도 제외 없음
- flaky 대응: 관측된 flaky 없음. 발생 시 seed로 고정 재현 후 원인 수정 방침

## 통합 테스트 (배포 후 수행 항목 — 사용자 확인 필요한 크리티컬 게이트)
프로덕션 배포는 main push로 트리거되므로 **배포 여부는 사용자 확인 후** 진행. 배포 후 검증 절차:
1. `/upload`에서 mp4 업로드 → 라이브러리 목록 표시 확인, Step Functions 콘솔에서 어떤 실행도 시작되지 않았는지 확인 (AC-1.3)
2. 쇼츠만들기에서 해당 영상 선택 → 폼 입력 → 시작 → `/history` 진행 및 쇼츠 SFN 실행 확인 (AC-4.2)
3. 화자별 편집에서 동일 영상 선택 → 시작 → 화자별 SFN만 실행되고 쇼츠 SFN은 미실행 확인 (AC-8.1 — 기존 버그 해소 검증)
4. 레거시 영상(3번에서 생성된 원본)이 선택 목록에 나타나는지 확인 (AC-3.2)
