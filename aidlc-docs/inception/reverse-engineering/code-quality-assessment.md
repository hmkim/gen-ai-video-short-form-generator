# Code Quality Assessment

## Test Coverage
- **Overall**: Fair — 신규 코드(U1/U3/U4/U5)는 테스트 있음, 레거시 페이지는 없음
- **Unit Tests**: Vitest 15건(프론트), pytest 37건(Lambda 2개)
- **Integration Tests**: 없음 (실 배포 후 수동/CLI 검증 관행)

## Code Quality Indicators
- **Linting**: ESLint --max-warnings 0 (CI 게이트). 단, 레거시 파일(ShortifyComponent.tsx 등)에 pre-existing 오류 42건 존재 — 전체 lint는 실패하므로 변경 파일 단위 lint로 검증하는 관행
- **Code Style**: Cloudscape + 함수형 컴포넌트로 일관
- **Documentation**: CLAUDE.md/DEPLOYMENT_STATUS.md 등 양호

## Technical Debt
- EventBridge suffix 충돌 가능성: `LONG_RAW.mp4`가 쇼츠 룰(suffix `RAW.mp4`)에도 매칭 (api-documentation.md 참조)
- `/upload` 런처가 라우팅 전용 — 이번 요청의 직접 원인
- 업로드 화면 간 중복 (모델 Select 등 동일 패턴 2벌)

## Patterns and Anti-patterns
- **Good Patterns**: record-first upload, suffix-routed pipelines, 승인 모델 카탈로그 훅(정적 폴백)
- **Anti-patterns**: 파이프라인 간 영상 재사용 경로 부재 (요구사항의 공백 영역)
