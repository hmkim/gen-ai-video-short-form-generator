# API Documentation (이번 변경 관련 부분)

## GraphQL Models (AppSync, userPool auth)
### History (쇼츠 처리 레코드)
- **Fields**: videoName(=S3 키), modelID, shortified, stage(0~), numberOfVideos, theme, videoLength
- **Auth**: owner — 본인 레코드만 조회됨
- **Client wrapper**: `src/apis/history.ts` — fetchHistories/createHistory/readHistory/deleteHistory

### LongVideoEdit (화자별 편집 레코드)
- **Fields**: videoName, modelID, stage, presenterCount, presenter1Name, presenter2Name, visionEnabled
- **Auth**: owner
- **Client wrapper**: `src/apis/longVideoEdit.ts` — fetchLongVideoEdits/createLongVideoEdit/updateLongVideoEdit

## Storage (Amplify Storage / S3)
- **업로드**: StorageManager `processFile`이 `{recordId}/RAW.mp4` 또는 `{recordId}/LONG_RAW.mp4` 키 반환, `path="videos/"` prefix → 최종 `videos/{recordId}/RAW.mp4`
- **재사용 후보 API**: `copy({ source: { path }, destination: { path } })` from `aws-amplify/storage` — 프론트에서 기존 객체를 새 키로 복사 가능 (5GB 초과 객체는 S3 CopyObject 단일 호출 제한 있음 — 대용량 영상 주의)

## EventBridge Rules (amplify/backend.ts)
| Rule | Pattern | Target |
|---|---|---|
| VideoUploadStateMachineRule | key suffix `RAW.mp4` | VideoUploadStateMachine (쇼츠) |
| LongVideo rule | key suffix `LONG_RAW.mp4` | LongVideoProcessStateMachine |

> ⚠️ **발견 사항 (pre-existing)**: `LONG_RAW.mp4`는 suffix `RAW.mp4`에도 매칭된다. 즉 화자별 편집 업로드가 **쇼츠 파이프라인도 함께 트리거**할 가능성이 있다(EventBridge suffix 매칭 규칙상). 쇼츠 SFN은 키의 두 번째 세그먼트를 History id로 파싱해 DDB 업데이트를 시도하므로, LongVideoEdit id로는 레코드를 못 찾고 실패했을 것으로 추정. 기존 영상 재사용 설계 시 이 규칙 충돌을 함께 고려해야 함.
