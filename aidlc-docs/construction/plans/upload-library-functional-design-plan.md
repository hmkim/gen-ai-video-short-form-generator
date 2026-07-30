# Functional Design Plan — upload-library

## 실행 체크리스트
- [x] business-logic-model.md — 핵심 워크플로우·데이터 변환 상세
- [x] business-rules.md — 검증·제약·오류 처리 규칙
- [x] domain-entities.md — Video 모델·SelectableVideo 타입 정의
- [x] frontend-components.md — 컴포넌트 계층·props/state·상호작용 흐름
- [x] Testable Properties 섹션 작성 (PBT-01 — blocking)

## 질문 대체 (표준 승인 방침)
설계 입력은 요구사항 D1~D7과 Application Design AD-1~AD-6에서 모두 확정됨. 크리티컬 미결 사항 없음 — 기본값으로 진행:
- 레거시 표시명: History/LongVideoEdit의 videoName(=S3 키)에서 사람이 읽을 이름을 파생 (`{id}/RAW.mp4` → "쇼츠 원본 {업로드일}" 형식) — 별도 제목 입력이 없던 데이터라 파생 규칙으로 처리
- 복사 실패 보상: 생성 레코드 삭제 후 오류 토스트 (services §3 확정 사항)
- 목록 정렬: 최신 업로드/생성일 내림차순 (일반 관례)
