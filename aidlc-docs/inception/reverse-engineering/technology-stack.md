# Technology Stack

## Programming Languages
- TypeScript 5.4 — React 18 SPA + Amplify Gen2 CDK 백엔드 정의 + AppSync 리졸버
- Python 3.12 — 처리 파이프라인 Lambda

## Frameworks
- React 18 + Vite 5 — SPA
- Cloudscape Design Components — UI (Container/Header/Select/Tiles/StorageManager 스타일)
- @aws-amplify/ui-react(-storage) — Authenticator, StorageManager
- AWS Amplify Gen2 — 백엔드 (CDK 기반)

## Infrastructure
- AppSync GraphQL + DynamoDB — 데이터 (owner/userPool auth)
- S3 (Transfer Acceleration, EventBridge notifications) — 영상 저장
- Step Functions ×5, MediaConvert, Transcribe, Bedrock(us-west-2)
- Amplify Hosting (main 브랜치 자동 배포)

## Build Tools
- npm scripts: build(tsc+vite, 엄격), lint(--max-warnings 0), test(vitest)

## Testing Tools
- Vitest 2 + Testing Library + jsdom — 프론트
- pytest — Python Lambda (각 Lambda 디렉터리에서 실행)
