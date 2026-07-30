# Business Overview

## Business Description
- **Business Description**: GenAI 기반 영상 가공 SaaS. 사용자가 긴 영상을 업로드하면 (1) AI가 하이라이트를 추출해 최대 15개의 숏폼 클립을 생성하거나(쇼츠만들기), (2) 발표자(화자) 단위로 세그먼트를 분할·편집해 화자별 출력 영상을 만들고 YouTube에 자동 업로드(화자별 편집)한다.
- **Business Transactions**:
  - BT-1 쇼츠 생성: 영상 업로드(`{historyId}/RAW.mp4`) → Transcribe → 토픽 추출(Bedrock) → 타임프레임 매칭 → 숏폼 클립 생성(MediaConvert) → 갤러리 게시
  - BT-2 화자별 편집: 영상 업로드(`{editId}/LONG_RAW.mp4`) → Transcribe(화자 분리) → 발표자 경계 감지 → 세그먼트 분석 → 화자별 출력 생성 → YouTube 업로드
  - BT-3 모델 관리: Bedrock 모델 검색/테스트/승인 → 업로드 화면 모델 드롭다운 공급
- **Business Dictionary**:
  - History: 쇼츠 처리 레코드 (1 업로드 = 1 History)
  - LongVideoEdit: 화자별 편집 처리 레코드 (1 업로드 = 1 Edit)
  - RAW.mp4 / LONG_RAW.mp4: S3 업로드 키 접미사 — EventBridge가 이 접미사로 두 파이프라인을 구분해 트리거

## Component Level Business Descriptions
### Upload Entry Points (현안 영역)
- **`/upload` (UnifiedUploadComponent)**: 목적 선택 런처. 현재 카드가 기존 업로드 화면(`/`, `/longvideo`)과 YouTube 목록(`/youtube/uploads`)으로 라우팅만 한다 — 실제 업로드 기능 없음.
- **`/` (VideoUploadComponent)**: 쇼츠 업로드 화면. 업로드 시 모델·클립 수·테마·길이를 받아 History 생성 후 S3 업로드. "기존 영상 선택" 기능 없음.
- **`/longvideo` (LongVideoUploadComponent)**: 화자별 편집 업로드 화면. 모델·발표자 수/이름을 받아 LongVideoEdit 생성 후 S3 업로드. "기존 영상 선택" 기능 없음.

### 핵심 제약 (양 파이프라인 분리)
업로드된 영상 파일은 처리 레코드(History/LongVideoEdit) ID 아래 키로 저장되고, EventBridge 트리거가 키 접미사(RAW vs LONG_RAW)로 파이프라인을 선택한다. 즉 "이미 업로드된 영상"은 항상 특정 파이프라인+레코드에 귀속되어 있으며, 파이프라인 간 재사용하려면 S3 객체 복사(새 키)로 새 레코드에 연결해야 한다.
