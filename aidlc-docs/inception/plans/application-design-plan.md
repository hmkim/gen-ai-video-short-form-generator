# Application Design Plan — upload-library

## 실행 체크리스트
- [x] components.md (application-design.md §1로 통합) — 컴포넌트 정의·책임·인터페이스
- [x] component-methods.md (§2로 통합) — 메서드 시그니처(비즈니스 규칙 상세는 Functional Design)
- [x] services.md (§3으로 통합) — 서비스(오케스트레이션) 정의
- [x] component-dependency.md (§4로 통합) — 의존성·통신 패턴·데이터 흐름
- [x] application-design.md — 통합 문서
- [x] 설계 완전성 검증 (US-1~US-8 커버)

## 설계 결정 (질문 대체 — 표준 승인 방침 적용)
요구사항 Q&A(D1~D7)에서 설계 방향이 이미 확정되어 **크리티컬한 미결 질문이 없음**. 아래 결정은 요구사항에서 직접 도출되며, 표준 방침("크리티컬하지 않으면 승인·진행")에 따라 기본값으로 채택:

| 결정 | 선택 | 근거 |
|---|---|---|
| AD-1 선택 UI 재사용 | 공유 `VideoPicker` 컴포넌트 1개를 쇼츠/화자별 화면이 공용 | FR-2.1=FR-3.1 동일 소스(D2) — 중복 제거 |
| AD-2 화면 구성 | `/`와 `/longvideo`는 "선택 → 폼" 2단계 단일 컴포넌트 (기존 컴포넌트 대체) | D4, D6 |
| AD-3 라이브러리 키 스킴 | `videos/library/{videoId}/SOURCE.mp4` — 어떤 파이프라인 suffix에도 미매칭 | FR-1.4, AC-8.3 |
| AD-4 레거시 대사 방식 | S3 `list(prefix)` 1회로 실존 키 집합 확보 후 레코드와 클라이언트에서 병합 (per-key HEAD 다발 호출 회피) | AC-3.2, NFR-2 |
| AD-5 파이프라인 진입 | 프론트에서 새 레코드 생성 → Amplify Storage `copy` → 기존 EventBridge 트리거 (백엔드 파이프라인 불변) | D3, NFR-1 |
| AD-6 순수 로직 분리 | 키 생성/파싱·목록 병합·크기 검증을 순수 모듈 `src/data/videoLibrary.ts`로 분리 | PBT-01/07 대비 — 속성 테스트 대상 명확화 |
