# User Stories — 업로드 흐름 재구성 (User Journey 순)

페르소나: P1 영상 제작자 (personas.md). AC 형식: Given-When-Then.

---

## Journey 1: 영상 업로드 & 라이브러리

### US-1: 영상 라이브러리에 업로드
**As a** 영상 제작자, **I want** `/upload`에서 영상 파일을 (목적을 정하지 않고) 업로드해 두기를, **so that** 이후 쇼츠·화자별 편집 어디서든 재사용할 수 있다.

**Acceptance Criteria**
- AC-1.1: Given 로그인 상태로 `/upload`에 진입, When 화면이 로드되면, Then 파일 업로드 영역과 제목 입력(선택, 기본값=파일명)이 보인다 — 목적 선택 카드가 아니라 실제 업로드 UI다.
- AC-1.2: Given mp4 파일을 선택하고 업로드를 시작, When 업로드가 완료되면, Then Video 레코드가 생성되고 화면의 라이브러리 목록에 즉시 나타난다.
- AC-1.3: Given 업로드 완료, When S3 이벤트가 발생해도, Then 어떤 처리 파이프라인도 시작되지 않는다 (라이브러리 전용 키).
- AC-1.4: Given 업로드 진행 중, When 진행률이 갱신되면, Then 진행 상태가 표시된다 (기존 StorageManager와 동일 UX, Transfer Acceleration 사용).

### US-2: 라이브러리 목록 확인
**As a** 영상 제작자, **I want** 업로드해 둔 영상 목록을 보기를, **so that** 무엇을 재사용할 수 있는지 파악할 수 있다.

**Acceptance Criteria**
- AC-2.1: Given 라이브러리에 영상이 있는 상태, When `/upload`에 진입하면, Then 본인 소유 영상만 제목·업로드 일시와 함께 목록으로 보인다.
- AC-2.2: Given 라이브러리가 비어 있는 상태, When `/upload`에 진입하면, Then 빈 상태 안내와 업로드 유도 문구가 보인다.

## Journey 2: 쇼츠만들기 — 선택 후 처리

### US-3: 쇼츠만들기에서 영상 선택
**As a** 영상 제작자, **I want** 쇼츠만들기 메뉴에서 이미 업로드된 영상을 선택하기를, **so that** 다시 업로드하지 않고 쇼츠 생성을 시작할 수 있다.

**Acceptance Criteria**
- AC-3.1: Given 쇼츠만들기(`/`) 진입, When 화면이 로드되면, Then 업로드 폼 대신 선택 가능한 영상 목록(라이브러리 + 레거시)이 보인다.
- AC-3.2: Given 목록 표시, When 레거시 영상(기존 History/LongVideoEdit 원본)이 포함될 때, Then S3에 파일이 실존하는 것만 표시된다 (유실 레코드 제외).
- AC-3.3: Given 라이브러리가 모두 비어 있음, When 화면이 로드되면, Then `/upload`로 안내하는 빈 상태가 보인다.

### US-4: 쇼츠 메타데이터 입력 후 처리 시작
**As a** 영상 제작자, **I want** 선택한 영상에 대해 쇼츠 옵션(모델·클립 수·테마·길이)을 입력하고 시작하기를, **so that** 원하는 형태의 쇼츠가 생성된다.

**Acceptance Criteria**
- AC-4.1: Given 영상을 선택함, When 선택이 완료되면, Then 쇼츠 메타데이터 폼이 나타난다 (모델 드롭다운은 기존 useApprovedModels, 클립 수·테마·길이는 기존 기본값 유지).
- AC-4.2: Given 폼 입력 완료 후 시작, When 처리가 시작되면, Then 새 History 레코드가 생성되고 원본이 `videos/{historyId}/RAW.mp4`로 복사되어 기존 쇼츠 파이프라인이 자동 시작되며 `/history`로 이동한다.
- AC-4.3: Given 5GB 초과 원본을 선택, When 시작을 시도하면, Then 복사 한도 초과 안내가 표시되고 처리는 시작되지 않는다.

## Journey 3: 화자별 편집 — 선택 후 처리

### US-5: 화자별 편집에서 영상 선택
**As a** 영상 제작자, **I want** 화자별 편집 메뉴에서도 동일한 영상 목록에서 선택하기를, **so that** 쇼츠로 썼던 영상도 화자별 편집에 재사용할 수 있다.

**Acceptance Criteria**
- AC-5.1: Given 화자별 편집(`/longvideo`) 진입, When 화면이 로드되면, Then US-3과 동일한 소스(라이브러리+레거시)의 영상 목록이 보인다.
- AC-5.2: Given 빈 목록, When 화면이 로드되면, Then `/upload` 안내 빈 상태가 보인다.

### US-6: 화자별 메타데이터 입력 후 처리 시작
**As a** 영상 제작자, **I want** 선택한 영상에 발표자 정보(모델·발표자 수·이름)를 입력하고 시작하기를, **so that** 화자별 편집이 시작된다.

**Acceptance Criteria**
- AC-6.1: Given 영상 선택 완료, When 폼이 나타나면, Then 모델·발표자 수(1/2)·발표자 이름 입력이 기존 화면과 동일한 기본값으로 제공된다.
- AC-6.2: Given 폼 입력 완료 후 시작, When 처리가 시작되면, Then 새 LongVideoEdit 레코드 생성 → `videos/{editId}/LONG_RAW.mp4` 복사 → 화자별 파이프라인 시작 → `/longvideo/history` 이동.

## Journey 4: 흐름 전환의 안전장치

### US-7: 네비게이션 정합성
**As a** 영상 제작자, **I want** 메뉴 이름과 화면 동작이 일치하기를, **so that** 헤매지 않고 원하는 작업에 도달한다.

**Acceptance Criteria**
- AC-7.1: Given 어느 화면에서든, When 사이드 메뉴를 보면, Then "영상 업로드"(=`/upload`), "쇼츠만들기"(=`/`), "화자별 편집"(=`/longvideo`)로 라벨과 동작이 일치한다.
- AC-7.2: Given 기존 URL 북마크(`/`, `/longvideo`), When 접속하면, Then 각 목적의 새 선택 화면이 보인다 (404/리다이렉트 루프 없음). History/Gallery/YouTube 라우트는 기존과 동일.

### US-8: 파이프라인 트리거 정확성 (EventBridge 수정)
**As a** 영상 제작자, **I want** 업로드·처리 시작이 의도한 파이프라인만 실행하기를, **so that** 불필요한 비용과 오류가 발생하지 않는다.

**Acceptance Criteria**
- AC-8.1: Given 화자별 처리 시작(`LONG_RAW.mp4` 생성), When S3 이벤트가 발생하면, Then 화자별 파이프라인만 시작되고 쇼츠 파이프라인은 시작되지 않는다.
- AC-8.2: Given 쇼츠 처리 시작(`RAW.mp4` 생성), When S3 이벤트가 발생하면, Then 쇼츠 파이프라인만 시작된다 (회귀 없음).
- AC-8.3: Given 라이브러리 업로드(신규 키), When S3 이벤트가 발생하면, Then 어떤 파이프라인도 시작되지 않는다.

---

## INVEST 검증
| 스토리 | I | N | V | E | S | T | 비고 |
|---|---|---|---|---|---|---|---|
| US-1~US-8 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | US-4·US-6은 각각 US-3·US-5 선행 필요하나 화면 내 단계로 독립 구현·검증 가능. 모든 AC는 Given-When-Then으로 테스트 직역 가능 |

## 요구사항 추적표
| 스토리 | 커버하는 요구사항 |
|---|---|
| US-1 | FR-1.1~1.4, D1 |
| US-2 | FR-1.5 |
| US-3 | FR-2.1, FR-2.2, FR-2.5, D2, D7 |
| US-4 | FR-2.3, FR-2.4, D3, D6, NFR-3 |
| US-5 | FR-3.1, D2 |
| US-6 | FR-3.2, FR-3.3, D3, D6 |
| US-7 | FR-4.1~4.3, D4 |
| US-8 | FR-5.1, FR-5.2, D5 |
| (교차) | NFR-1(US-4/6), NFR-2(US-2/3/5), NFR-4·5(전체 — 테스트 단계) |

**누락 검증**: FR-1~FR-5 및 D1~D7 전부 1개 이상의 스토리에 매핑됨. ✓

## 페르소나 매핑
모든 스토리 → P1 영상 제작자.
