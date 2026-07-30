# Requirements — 업로드 흐름 재구성 (영상 라이브러리)

## Intent Analysis
- **User request**: `/upload` 진입 시 실제 업로드가 이뤄지게 하고, 쇼츠만들기/화자별 편집 메뉴에서는 이미 업로드된 영상을 선택해 진행하도록 재구성
- **Request type**: Enhancement (기존 업로드 흐름 재설계) + Bug-adjacent 수정 1건(EventBridge 이중 트리거)
- **Scope estimate**: Multiple Components — 프론트(라우트/화면 3+), 데이터 모델(신규 Video), 백엔드(S3 키 구조·복사·EventBridge 룰)
- **Complexity estimate**: Complex — 신규 데이터 모델과 파이프라인 트리거 방식 변경 포함

## 확정 결정 사항 (Q&A 결과)
| # | 결정 | 근거 답변 |
|---|---|---|
| D1 | **영상 라이브러리 방식**: `/upload`는 영상 파일 업로드 전용, 처리는 이후 선택 시 시작 | Q1=C |
| D2 | 쇼츠/화자별 메뉴 모두 **동일한 라이브러리**에서 영상 선택 (파이프라인 구분 없음) | Q2=A |
| D3 | 선택 시 **새 처리 레코드 생성 + S3 복사**로 파이프라인 트리거 (기존 결과 재사용 없음) | Q3=A |
| D4 | 기존 업로드 화면(`/`, `/longvideo`)은 **새 흐름으로 대체** (리다이렉트/메뉴 정리) | Q4=A |
| D5 | **EventBridge suffix 이중 트리거 수정 포함** (`LONG_RAW.mp4`가 쇼츠 룰에 매칭되는 문제) | Q5=A |
| D6 | 쇼츠/화자별 **메타데이터는 처리 시점에 입력** (선택 후 폼 표시) | CQ1=A |
| D7 | **레거시 영상도 선택 목록에 포함** — History/LongVideoEdit 레코드 기반, 파일 존재 대사 필요 | CQ2=B |

## Functional Requirements

### FR-1: 영상 라이브러리 업로드 (`/upload`)
- FR-1.1: `/upload`에서 영상 파일(mp4)을 직접 업로드할 수 있다. 입력 항목은 영상 제목(선택 입력, 기본값 파일명)뿐이다.
- FR-1.2: 업로드 완료 시 라이브러리 레코드(신규 `Video` 모델)가 생성되고 목록에 즉시 나타난다.
- FR-1.3: 업로드는 기존과 동일하게 S3 Transfer Acceleration을 사용한다.
- FR-1.4: 업로드된 영상은 **어떤 파이프라인도 자동 트리거하지 않는다** (라이브러리 전용 키 사용).
- FR-1.5: `/upload` 화면에 본인이 업로드한 라이브러리 영상 목록(제목, 업로드 일시, 크기, 처리 이력 여부)을 표시한다.

### FR-2: 쇼츠만들기 — 영상 선택 후 처리
- FR-2.1: 쇼츠만들기 메뉴 진입 시 업로드 화면 대신 **영상 선택 화면**이 보인다.
- FR-2.2: 목록에는 (a) 라이브러리 영상 + (b) 레거시 영상(기존 History/LongVideoEdit 레코드의 원본, S3에 파일이 실존하는 것만)이 표시된다 (D2, D7).
- FR-2.3: 영상 선택 시 쇼츠 메타데이터 폼(모델, 클립 수, 테마, 길이 — 기존 VideoUploadComponent와 동일 항목/기본값)이 표시된다 (D6).
- FR-2.4: 시작 시 새 History 레코드 생성 → 원본을 `videos/{historyId}/RAW.mp4`로 S3 복사 → 기존 쇼츠 파이프라인이 자동 트리거 → `/history`로 이동.
- FR-2.5: 신규 업로드가 필요하면 화면 내에서 `/upload`로 유도한다.

### FR-3: 화자별 편집 — 영상 선택 후 처리
- FR-3.1: 화자별 편집 메뉴 진입 시 **영상 선택 화면**이 보인다 (소스는 FR-2.2와 동일).
- FR-3.2: 영상 선택 시 화자별 메타데이터 폼(모델, 발표자 수 1/2, 발표자 이름 — 기존 LongVideoUploadComponent와 동일)이 표시된다.
- FR-3.3: 시작 시 새 LongVideoEdit 레코드 생성 → `videos/{editId}/LONG_RAW.mp4`로 S3 복사 → 기존 화자별 파이프라인 트리거 → `/longvideo/history`로 이동.

### FR-4: 라우트/메뉴 재구성 (D4)
- FR-4.1: `/upload` = 라이브러리(업로드+목록). `/`(쇼츠만들기)와 `/longvideo`(화자별 편집) = 각 목적의 영상 선택+폼 화면으로 대체.
- FR-4.2: 사이드 네비게이션 라벨을 새 흐름에 맞게 갱신한다 (예: "영상 업로드", "쇼츠만들기", "화자별 편집").
- FR-4.3: 기존 History/Gallery/YouTube 화면과 라우트는 변경하지 않는다.

### FR-5: EventBridge 이중 트리거 수정 (D5)
- FR-5.1: 쇼츠 룰이 `LONG_RAW.mp4` 업로드에 매칭되지 않도록 수정한다 (라이브러리 키에도 매칭되지 않아야 함).
- FR-5.2: 기존 정상 트리거(쇼츠 `RAW.mp4`, 화자별 `LONG_RAW.mp4`)는 회귀 없이 유지된다.

## Non-Functional Requirements
- NFR-1 (호환성): 기존 처리 파이프라인(Step Functions/Lambda)의 입력 계약(`videos/{id}/RAW.mp4` 키 구조)은 변경하지 않는다 — 복사로 진입.
- NFR-2 (권한): 라이브러리/레거시 목록은 본인 소유 레코드만 표시(owner auth 유지). S3 복사는 프론트(Amplify Storage `copy`) 권한 범위 내에서 수행.
- NFR-3 (대용량): S3 복사는 5GB(단일 CopyObject 한도)까지 지원하면 충분하다고 가정. 초과 파일은 오류 안내.
- NFR-4 (품질 게이트): tsc(strict)·ESLint(--max-warnings 0, 변경 파일 기준)·Vitest·pytest 전부 통과. **PBT 확장 전면 적용** — 신규 로직(키 생성/파싱, 목록 병합·대사 등)에 fast-check 기반 속성 테스트 필수.
- NFR-5 (테스트 존재 파일 갱신): `UnifiedUploadComponent.test.tsx` 등 영향받는 기존 테스트는 새 동작 기준으로 갱신.

## Out of Scope
- 기존 처리 결과(트랜스크립트 등) 재사용 최적화 (Q3=B 기각)
- 라이브러리 영상 삭제/이름변경 등 관리 기능 (요청 범위 외 — 최소한 업로드+목록+선택만)
- 백엔드 파이프라인 로직 변경 (EventBridge 룰 수정 제외)

## Extension Configuration (재확인)
- Security Baseline: **미적용** / Resiliency Baseline: **미적용** / Property-Based Testing: **전면 적용 (blocking)**
