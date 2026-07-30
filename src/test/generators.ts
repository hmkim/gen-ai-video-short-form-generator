// generators.ts
//
// upload-library PBT 도메인 생성기 (PBT-07: 원시 생성기 대신 도메인 제약을
// 반영한 생성기를 중앙화). 모든 videoLibrary 속성 테스트가 이 모듈을 쓴다.

import fc from 'fast-check';
import type { LegacyRecordInput, LibraryRecordInput } from '../data/videoLibrary';
import { librarySourceKey, MAX_COPY_BYTES } from '../data/videoLibrary';

/** 레코드 id — 실제 값은 UUID이므로 UUID 생성기 사용. */
export const recordIdArb = fc.uuid();

/** ISO 8601 createdAt — Amplify가 찍는 형식과 동일한 범위의 실제 날짜. */
export const isoDateArb = fc
  .date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2027-12-31T23:59:59Z') })
  .map((d) => d.toISOString());

/** 영상 제목 — 공백만인 문자열 제외 (BR-2가 업로드 시 보정하므로 레코드에는 항상 유효 제목). */
export const titleArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim() !== '');

/** 파일 크기 — 0바이트 ~ 한도 위아래를 포함하는 현실적 범위. */
export const sizeBytesArb = fc.integer({ min: 0, max: MAX_COPY_BYTES * 2 });

/** 라이브러리(Video) 레코드. s3Key는 항상 규칙에 맞는 라이브러리 키. */
export const libraryRecordArb: fc.Arbitrary<LibraryRecordInput> = fc
  .record({
    videoId: recordIdArb,
    title: titleArb,
    createdAt: isoDateArb,
    sizeBytes: fc.option(sizeBytesArb, { nil: undefined }),
  })
  .map(({ videoId, title, createdAt, sizeBytes }) => ({
    title,
    s3Key: librarySourceKey(videoId),
    createdAt,
    sizeBytes,
  }));

/** 레거시(History/LongVideoEdit) 레코드. */
export const legacyRecordArb: fc.Arbitrary<LegacyRecordInput> = fc.record({
  id: recordIdArb,
  createdAt: fc.option(isoDateArb, { nil: null }),
});

/** mp4 파일명 — deriveTitle 속성용 (경계: 공백·점만 있는 이름 포함). */
export const fileNameArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 60 }).map((s) => `${s}.mp4`),
  fc.constantFrom('.mp4', ' .mp4', '...', 'a.b.c.mp4'),
);
