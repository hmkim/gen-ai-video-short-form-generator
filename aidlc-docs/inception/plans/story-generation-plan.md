# Story Generation Plan — 업로드 흐름 재구성

## 실행 체크리스트 (Part 2에서 수행)

- [x] Step A: 페르소나 정의 (personas.md) — 요구사항·기존 화면 분석 기반
- [x] Step B: 확정된 breakdown 방식으로 스토리 도출 (FR-1~FR-5 전부 커버)
- [x] Step C: 스토리별 수용 기준(AC) 작성 — 확정된 AC 형식 적용
- [x] Step D: INVEST 검증 (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- [x] Step E: 페르소나 ↔ 스토리 매핑 (stories.md 내 표)
- [x] Step F: 요구사항(FR/NFR/D#) ↔ 스토리 추적표 작성 — 누락 검증
- [x] Step G: stories.md 저장 및 상태/감사 로그 갱신

## 방법론 결정 질문

아래 질문의 [Answer]: 태그에 선택지 문자를 기입해 주세요.

## Question 1
스토리 분류(breakdown) 방식은? (요구사항 특성상 두 방식이 유력합니다)

A) **User Journey-Based** (권장): 사용자 여정 순서(영상 업로드 → 라이브러리 확인 → 쇼츠만들기 진입·선택·처리 → 화자별 진입·선택·처리)로 구성 — 이번 변경이 "흐름 재구성"이므로 여정 순서가 구현·검증 순서와 자연스럽게 일치

B) **Feature-Based**: 기능 단위(라이브러리, 영상 선택기, 쇼츠 처리 시작, 화자별 처리 시작, 파이프라인 트리거 수정)로 구성 — 코드 모듈 경계와 1:1 대응

C) **Epic-Based**: 에픽 2개(통합 업로드 / 선택 후 처리) 아래 하위 스토리 계층화

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
수용 기준(Acceptance Criteria) 형식은?

A) **Given-When-Then** (권장): 시나리오 형식 — 테스트 케이스(Vitest/PBT)로 직역 가능

B) **체크리스트**: 단순 불릿 목록 — 간결하지만 전제조건 표현이 약함

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
페르소나 범위는? (이 앱은 Cognito 로그인 사용자가 쓰는 단일 운영자 도구입니다)

A) **단일 페르소나** (권장): "영상 제작자(Creator)" 하나로 통일 — 실제 사용자 유형이 하나뿐이므로 과도한 세분화 방지

B) **복수 페르소나**: 예: 쇼츠 중심 제작자 / 웨비나 편집자 / 관리자를 구분

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
스토리 크기(granularity) 기준은?

A) **화면·행위 단위** (권장): "라이브러리에 영상을 업로드한다", "쇼츠만들기에서 영상을 선택해 처리를 시작한다" 수준 — 이번 규모(FR 5개)에서 6~9개 스토리 예상

B) **세분화**: 각 폼 필드·상태(빈 목록, 오류 등)까지 개별 스토리로 분리 — 15개 이상 예상

X) Other (please describe after [Answer]: tag below)

[Answer]: A
