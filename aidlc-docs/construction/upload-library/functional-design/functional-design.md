# Functional Design — upload-library (통합)

> business-logic-model / business-rules / domain-entities / frontend-components를 §1~§4로 통합. Testable Properties(PBT-01)는 §5.

## §1 Business Logic Model

### W1: 라이브러리 업로드 (US-1)
```
입력: mp4 파일, 제목(선택)
1. videoId = crypto.randomUUID()
2. s3Key = librarySourceKey(videoId)          # videos/library/{videoId}/SOURCE.mp4
3. StorageManager가 S3 업로드 (accelerated)
4. 업로드 성공 → createVideo(title || 파일명, s3Key, file.size)
5. 목록 갱신
실패 처리: 업로드 실패 시 레코드 미생성(순서가 업로드→레코드이므로 유령 레코드 없음)
```
주의: 기존 흐름(레코드 먼저)과 반대 순서 — 라이브러리 키는 videoId가 레코드 id일 필요가 없어(파이프라인 미트리거) 업로드 성공 후 레코드 생성이 안전.

### W2: 선택 목록 구성 (US-3/US-5)
```
입력: 없음 (로그인 사용자 컨텍스트)
1. 병렬 조회: fetchVideos(), fetchHistories(), fetchLongVideoEdits(), listExistingSourceKeys()
2. mergeSelectableVideos(...)로 병합:
   - Video → {source:'library', s3Key, title, createdAt}
   - History → {source:'legacy-shorts', s3Key: videos/{id}/RAW.mp4 파생, ...}
   - LongVideoEdit → {source:'legacy-speaker', s3Key: videos/{id}/LONG_RAW.mp4 파생, ...}
   - existingKeys에 없는 s3Key는 제외 (유실 대사, AC-3.2)
3. createdAt 내림차순 정렬
```

### W3: 처리 시작 (US-4/US-6)
```
입력: SelectableVideo, 메타데이터(목적별)
1. validateCopySize(sizeBytes) — 실패 시 중단+안내 (AC-4.3)
2. record = createHistory(...) 또는 createLongVideoEdit(...)
3. destKey = pipelineDestKey(kind, record.id)
4. copyToPipeline(sel.s3Key, destKey)
   실패 시: deleteHistory/deleteLongVideoEdit(record.id) 보상 → 오류 표시
5. 성공 → navigate(/history 또는 /longvideo/history)
```

## §2 Business Rules
| ID | 규칙 |
|---|---|
| BR-1 | 라이브러리 키는 반드시 `videos/library/` prefix — 파이프라인 suffix(`RAW.mp4`/`LONG_RAW.mp4`)로 끝나지 않아야 함 (SOURCE.mp4 고정) |
| BR-2 | 제목 미입력 시 파일명(확장자 제거)을 제목으로 사용, 공백 제목 불허 |
| BR-3 | 5GB(5,368,709,120 bytes) 초과 파일은 처리 시작 불가 — 사전 검증 (sizeBytes 미상(undefined)은 통과시키되 복사 실패 시 안내) |
| BR-4 | 목록에는 본인 소유 레코드만 (owner auth 위임 — 클라이언트 추가 필터 불요) |
| BR-5 | 유실 영상(레코드 있으나 S3 키 없음)은 목록에서 제외 — 오류 아님 |
| BR-6 | 복사 실패 시 생성 레코드 즉시 삭제 (보상), 삭제 실패는 콘솔 로그만 (파이프라인 미시작 상태라 무해) |
| BR-7 | 레거시 표시명: History → "쇼츠 원본 · {생성일}", LongVideoEdit → "화자별 원본 · {생성일}" |

## §3 Domain Entities
```typescript
// C7 Video 모델 (amplify/data/resource.ts)
Video: { title: string(required), s3Key: string(required), sizeBytes: integer,
         status: enum['UPLOADED'], owner auth, timestamps 자동 }

// C5 순수 타입 (src/data/videoLibrary.ts)
type VideoSource = 'library' | 'legacy-shorts' | 'legacy-speaker';
interface SelectableVideo {
  source: VideoSource;
  s3Key: string;          // 원본 위치
  title: string;
  createdAt: string;      // ISO
  sizeBytes?: number;     // 라이브러리만 보유, 레거시는 undefined
}
type PipelineKind = 'shorts' | 'speaker';
```

## §4 Frontend Components
```
App.tsx 라우트: /upload → VideoLibraryPage, / → ShortsCreatePage, /longvideo → SpeakerEditCreatePage
                (기존 VideoUploadComponent/LongVideoUploadComponent/UnifiedUploadComponent 파일 대체)

VideoLibraryPage
├── state: videos[], loading, title
├── StorageManager (processFile → librarySourceKey, onUploadSuccess → createVideo+refresh)
└── 목록 Table (제목/일시/크기) + 빈 상태(업로드 안내)

ShortsCreatePage (2단계 상태기계: 'pick' → 'form')
├── step='pick': <VideoPicker onSelect={v => {setSel(v); setStep('form')}} />
├── step='form': 쇼츠 폼(모델=useApprovedModels, 클립수=1, 테마='', 길이=60 기본) + 뒤로가기
└── 시작 → W3(shorts) → navigate('/history')

SpeakerEditCreatePage (동일 2단계)
├── step='form': 화자 폼(모델, 발표자수 RadioGroup 1/2, 이름 기본 "Presenter 1"/"Presenter 2")
└── 시작 → W3(speaker) → navigate('/longvideo/history')

VideoPicker (공유)
├── props: { onSelect: (v: SelectableVideo) => void }
├── 로드 시 W2 실행, Cloudscape Table(RadioGroup 선택) 표시
├── 소스 배지: 라이브러리/쇼츠원본/화자별원본
└── 빈 상태: "업로드된 영상이 없습니다" + /upload 링크 버튼

MainComponent 네비게이션: "영상 업로드"(/upload) 최상단, "쇼츠만들기"(/), "화자별 편집"(/longvideo)
```
API 연동: VideoLibraryPage→videoApi, VideoPicker→videoApi+history+longVideoEdit, Create 페이지→history/longVideoEdit+videoApi.copy

## §5 Testable Properties (PBT-01 — blocking 준수)

| 컴포넌트 | 속성 | 카테고리 |
|---|---|---|
| `librarySourceKey`/`pipelineDestKey` × `classifyKey` | 임의 유효 id에 대해 `classifyKey(librarySourceKey(id))==='library'`, `classifyKey(pipelineDestKey('shorts',id))==='shorts-raw'`, `classifyKey(pipelineDestKey('speaker',id))==='speaker-raw'` | Round-trip |
| `classifyKey` | `LONG_RAW.mp4`로 끝나는 키는 절대 'shorts-raw'로 분류되지 않음 (US-8의 논리 반영) | Invariant |
| `mergeSelectableVideos` | 결과의 모든 s3Key는 existingKeys의 부분집합, 결과 개수 ≤ 입력 레코드 총수, 정렬은 createdAt 내림차순 | Invariant |
| `mergeSelectableVideos` | 같은 입력에 두 번 적용해도 결과 동일 (참조 아닌 값 동등) | Idempotence/순수성 |
| `validateCopySize` | 경계: ≤5GB ok, >5GB not ok, undefined ok | Invariant |
| BR-2 제목 파생 | 임의 파일명에 대해 결과 제목은 비어 있지 않음 | Invariant |
| UI 컴포넌트 | 상태 분기(pick/form, 빈 목록)는 예제 기반 테스트로 커버 | No PBT — DOM 렌더링은 속성화 부적합, 예제 기반(PBT-10 보완) |

- **프레임워크 (PBT-09)**: fast-check (Vitest 통합) — devDependency 추가 예정
- **생성기 (PBT-07)**: id는 UUID 형식 생성기, 레코드는 도메인 생성기(제목·ISO 날짜·크기 범위 제약)로 작성, `src/test/generators.ts`에 중앙화

## PBT Compliance (Functional Design 단계)
- PBT-01: ✅ §5에 속성 식별·분류 완료, 코드 생성 단계로 전달
- 기타 규칙(PBT-02~10): 코드 생성/테스트 단계에서 적용 (N/A 아님 — 후속 단계 대상)
