# 요구사항 확인 질문 (Requirements Verification Questions)

업로드 흐름 재구성 요구사항을 확정하기 위한 질문입니다. 각 질문의 `[Answer]:` 태그 뒤에 선택지 문자를 기입해 주세요. 선택지에 맞는 것이 없으면 마지막 옵션(Other)을 선택하고 설명을 적어 주세요.

## Question 1
`/upload` 통합 업로드 화면의 구성 방식은? (record-first 구조상 **업로드 시작 전에** 파이프라인과 메타데이터가 정해져야 합니다)

A) **목적 선택 → 해당 폼 노출 → 업로드**: 화면 상단에서 목적(쇼츠만들기 / 화자별 편집)을 먼저 고르면, 그 목적에 필요한 입력 항목(쇼츠: 모델·클립 수·테마·길이 / 화자별: 모델·발표자 수·이름)만 표시된 후 업로드 진행 (권장 — 백엔드 변경 없음)

B) **공통+선택 항목 동시 노출**: 모델 선택 등 공통 항목과 두 목적의 항목을 한 화면에 모두 표시하고, 목적 체크에 따라 활성화

C) **업로드 먼저, 목적 나중**: 영상을 먼저 업로드해 "영상 라이브러리"에 넣고, 이후 쇼츠/화자별 화면에서 골라 처리 (신규 Video 모델·S3 키 구조 변경·백엔드 재설계 필요 — 공수 큼)

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 2
쇼츠만들기 / 화자별 편집 메뉴 진입 시 "이미 업로드된 영상 선택"의 소스 범위는?

A) **양쪽 모두**: 본인이 업로드한 모든 영상(쇼츠용 + 화자별용)을 목록으로 보여주고 선택 → 새 처리 시작 (예: 화자별로 올렸던 영상을 쇼츠로도 만들기 가능)

B) **같은 파이프라인 것만**: 쇼츠 메뉴에서는 쇼츠로 업로드했던 영상만, 화자별 메뉴에서는 화자별로 업로드했던 영상만 선택 가능

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
기존 영상을 선택해서 진행하면 시스템은 새 처리 레코드를 만들고 S3 원본을 새 키로 복사해 파이프라인을 다시 트리거합니다 (Transcribe·AI 분석 비용/시간이 새로 발생). 이 방식으로 진행할까요?

A) 예 — 새 레코드 + S3 복사로 재처리 (프론트엔드만으로 구현 가능, 권장)

B) 아니오 — 기존 처리 결과(트랜스크립트 등)를 재사용하는 최적화까지 포함 (백엔드 파이프라인 수정 필요 — 공수 큼)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
기존 업로드 화면(`/` 쇼츠 업로드, `/longvideo` 화자별 업로드)은 어떻게 할까요?

A) **통합 화면으로 대체**: `/`와 `/longvideo`는 새 통합 업로드/선택 화면으로 리다이렉트하거나 같은 컴포넌트를 사용 (메뉴 정리 포함)

B) **유지 + 병행**: 기존 화면은 그대로 두고 `/upload`와 각 메뉴의 "기존 영상 선택"만 추가

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
Reverse Engineering에서 발견한 pre-existing 이슈 — EventBridge 쇼츠 룰(suffix `RAW.mp4`)이 `LONG_RAW.mp4` 업로드에도 매칭되어 화자별 업로드가 쇼츠 파이프라인까지 이중 트리거할 가능성이 있습니다. 이번 작업에 수정을 포함할까요?

A) 예 — 이번에 함께 수정 (백엔드 EventBridge 룰 1곳 수정, 권장)

B) 아니오 — 이번 범위에서 제외 (별도 이슈로 관리)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 (Security Extensions)
Should security extension rules be enforced for this project? / 이 프로젝트에 보안 확장 규칙을 적용할까요?

A) Yes — enforce all SECURITY rules as blocking constraints (프로덕션급 애플리케이션에 권장)

B) No — skip all SECURITY rules (PoC/프로토타입에 적합)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 7 (Resiliency Extensions)
Should the resiliency baseline be applied to this project? / 이 프로젝트에 복원력(Resiliency) 베이스라인을 적용할까요? (AWS Well-Architected 신뢰성 필러 기반의 설계 시점 모범 사례 — 프로덕션 준비를 보장하지는 않는 출발점)

A) Yes — apply the resiliency baseline as directional best practices (비즈니스 크리티컬 워크로드에 권장)

B) No — skip the resiliency baseline (빠른 반복이 중요한 PoC에 적합)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 8 (Property-Based Testing Extension)
Should property-based testing (PBT) rules be enforced for this project? / 속성 기반 테스트 규칙을 적용할까요?

A) Yes — enforce all PBT rules as blocking constraints (비즈니스 로직·데이터 변환이 많은 프로젝트에 권장)

B) Partial — 순수 함수와 직렬화 라운드트립에만 적용

C) No — skip all PBT rules (단순 CRUD/UI 중심 프로젝트에 적합)

X) Other (please describe after [Answer]: tag below)

[Answer]: A
