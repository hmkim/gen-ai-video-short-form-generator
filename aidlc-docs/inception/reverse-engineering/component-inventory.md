# Component Inventory

## Application Packages
- `src/` — React SPA (pages, apis, data)

## Infrastructure Packages
- `amplify/` — Amplify Gen2 (CDK): auth, storage, data(schema+resolvers), custom(Step Functions, Lambda constructs)

## Shared Packages
- `src/data/` — modelList/modelMetadata/useApprovedModels (모델 카탈로그)

## Test Packages
- `src/**/__tests__/` — Vitest (modelMetadata 10, UnifiedUploadComponent 5)
- `amplify/custom/lambda-functions/{detect-presenter-boundaries,analyze-video-frames}/` — pytest (26 + 11)

## Total Count
- **Total Packages**: 4 영역 (frontend / amplify infra / shared data / tests)
- **Frontend pages**: 15 컴포넌트, **Lambda**: 12, **Step Functions**: 5
