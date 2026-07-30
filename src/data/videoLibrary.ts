// videoLibrary.ts
//
// upload-library 유닛의 순수 로직 모듈 (설계 C5). React/AWS 의존성 없음 —
// 키 생성·분류, 선택 목록 병합·대사, 크기 검증, 제목 파생을 담당하며
// 전부 property-based test 대상이다 (functional-design §5).

/** 처리 파이프라인 구분. 키 suffix가 EventBridge 트리거를 결정한다. */
export type PipelineKind = 'shorts' | 'speaker';

export type VideoSource = 'library' | 'legacy-shorts' | 'legacy-speaker';

export type KeyClass = VideoSource | 'shorts-raw' | 'speaker-raw' | 'other';

/** 선택 화면(VideoPicker)에 표시되는 영상 한 건. */
export interface SelectableVideo {
  source: VideoSource;
  /** 원본 객체의 전체 S3 키 (storage path 기준, 예: videos/library/{id}/SOURCE.mp4) */
  s3Key: string;
  title: string;
  /** ISO 8601 */
  createdAt: string;
  /** 라이브러리 영상만 보유. 레거시는 undefined (복사 시 사후 검증). */
  sizeBytes?: number;
}

/** 라이브러리 레코드 (Video 모델) 중 병합에 필요한 필드. */
export interface LibraryRecordInput {
  title: string;
  s3Key: string;
  createdAt?: string | null;
  sizeBytes?: number | null;
}

/** 레거시 처리 레코드 (History / LongVideoEdit) 중 병합에 필요한 필드. */
export interface LegacyRecordInput {
  id: string;
  createdAt?: string | null;
}

// S3 단일 CopyObject 한도 (NFR-3 / BR-3)
export const MAX_COPY_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

/** 라이브러리 원본 키. 어떤 파이프라인 suffix와도 매칭되지 않아야 한다 (BR-1). */
export function librarySourceKey(videoId: string): string {
  return `videos/library/${videoId}/SOURCE.mp4`;
}

/** 처리 시작 시 복사 대상 키 — 기존 파이프라인 계약 그대로 (NFR-1). */
export function pipelineDestKey(kind: PipelineKind, recordId: string): string {
  return kind === 'shorts'
    ? `videos/${recordId}/RAW.mp4`
    : `videos/${recordId}/LONG_RAW.mp4`;
}

/**
 * 키 → 유형 분류. EventBridge 쇼츠 룰(wildcard "*\/RAW.mp4")과 동일한 판별
 * 순서를 따른다: LONG_RAW를 먼저 확인해야 suffix 포함 관계(LONG_RAW ⊃ RAW)에
 * 오분류가 없다 (US-8).
 */
export function classifyKey(s3Key: string): KeyClass {
  if (/^videos\/library\/[^/]+\/SOURCE\.mp4$/.test(s3Key)) return 'library';
  if (/^videos\/[^/]+\/LONG_RAW\.mp4$/.test(s3Key)) return 'speaker-raw';
  if (/^videos\/[^/]+\/RAW\.mp4$/.test(s3Key)) return 'shorts-raw';
  return 'other';
}

/** BR-3: 5GiB 초과는 복사 불가. 크기 미상(undefined)은 통과. */
export function validateCopySize(sizeBytes: number | undefined): {
  ok: boolean;
  reason?: string;
} {
  if (sizeBytes === undefined) return { ok: true };
  if (sizeBytes > MAX_COPY_BYTES) {
    return { ok: false, reason: '5GB를 초과하는 영상은 재처리할 수 없습니다.' };
  }
  return { ok: true };
}

/** BR-2: 파일명에서 제목 파생 — 결과는 항상 비어 있지 않다. */
export function deriveTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base !== '' ? base : '제목 없음';
}

const dateLabel = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10) : '날짜 미상';

/**
 * 라이브러리 + 레거시 레코드를 S3 실존 키 집합과 대사해 선택 목록을 만든다 (W2).
 * 불변식: 결과의 s3Key ⊆ existingKeys, 결과 수 ≤ 입력 레코드 총수,
 * createdAt 내림차순, 순수 함수(입력 불변, 재적용 동일 결과).
 */
export function mergeSelectableVideos(
  libraryRecords: readonly LibraryRecordInput[],
  shortsRecords: readonly LegacyRecordInput[],
  speakerRecords: readonly LegacyRecordInput[],
  existingKeys: ReadonlySet<string>,
): SelectableVideo[] {
  const out: SelectableVideo[] = [];

  for (const rec of libraryRecords) {
    if (!existingKeys.has(rec.s3Key)) continue; // BR-5
    out.push({
      source: 'library',
      s3Key: rec.s3Key,
      title: rec.title,
      createdAt: rec.createdAt ?? '',
      sizeBytes: rec.sizeBytes ?? undefined,
    });
  }
  for (const rec of shortsRecords) {
    const key = pipelineDestKey('shorts', rec.id);
    if (!existingKeys.has(key)) continue;
    out.push({
      source: 'legacy-shorts',
      s3Key: key,
      title: `쇼츠 원본 · ${dateLabel(rec.createdAt)}`, // BR-7
      createdAt: rec.createdAt ?? '',
    });
  }
  for (const rec of speakerRecords) {
    const key = pipelineDestKey('speaker', rec.id);
    if (!existingKeys.has(key)) continue;
    out.push({
      source: 'legacy-speaker',
      s3Key: key,
      title: `화자별 원본 · ${dateLabel(rec.createdAt)}`,
      createdAt: rec.createdAt ?? '',
    });
  }

  // createdAt 내림차순 — 문자열 비교(ISO 8601)로 충분
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
