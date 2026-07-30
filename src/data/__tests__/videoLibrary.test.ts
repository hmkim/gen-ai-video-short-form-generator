// videoLibrary.test.ts
//
// upload-library 순수 로직 테스트. describe 단위로 PBT와 예제 기반을 분리한다
// (PBT-10). 속성 목록은 functional-design §5, 생성기는 src/test/generators.ts.
// fast-check은 실패 시 seed·shrunk 반례를 출력한다 (PBT-08 — 기본 동작 유지).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  classifyKey,
  deriveTitle,
  librarySourceKey,
  MAX_COPY_BYTES,
  mergeSelectableVideos,
  pipelineDestKey,
  validateCopySize,
} from '../videoLibrary';
import {
  fileNameArb,
  legacyRecordArb,
  libraryRecordArb,
  recordIdArb,
  sizeBytesArb,
} from '../../test/generators';

describe('videoLibrary — property-based (PBT)', () => {
  it('round-trip: 생성한 키는 항상 자기 유형으로 분류된다 (PBT-02)', () => {
    fc.assert(
      fc.property(recordIdArb, (id) => {
        expect(classifyKey(librarySourceKey(id))).toBe('library');
        expect(classifyKey(pipelineDestKey('shorts', id))).toBe('shorts-raw');
        expect(classifyKey(pipelineDestKey('speaker', id))).toBe('speaker-raw');
      }),
    );
  });

  it('invariant: LONG_RAW.mp4로 끝나는 키는 절대 shorts-raw가 아니다 (US-8, PBT-03)', () => {
    fc.assert(
      fc.property(recordIdArb, (id) => {
        const key = pipelineDestKey('speaker', id);
        expect(key.endsWith('RAW.mp4')).toBe(true); // suffix 포함 관계 전제 확인
        expect(classifyKey(key)).not.toBe('shorts-raw');
      }),
    );
  });

  it('invariant: merge 결과의 s3Key는 existingKeys의 부분집합, 개수 ≤ 입력 총수 (PBT-03)', () => {
    fc.assert(
      fc.property(
        fc.array(libraryRecordArb, { maxLength: 8 }),
        fc.array(legacyRecordArb, { maxLength: 8 }),
        fc.array(legacyRecordArb, { maxLength: 8 }),
        fc.func(fc.boolean()), // 임의의 "실존 여부" 부분집합 선택
        (libs, shorts, speakers, pick) => {
          const allKeys = [
            ...libs.map((r) => r.s3Key),
            ...shorts.map((r) => pipelineDestKey('shorts', r.id)),
            ...speakers.map((r) => pipelineDestKey('speaker', r.id)),
          ];
          const existing = new Set(allKeys.filter((k) => pick(k)));
          const result = mergeSelectableVideos(libs, shorts, speakers, existing);
          expect(result.length).toBeLessThanOrEqual(libs.length + shorts.length + speakers.length);
          for (const v of result) {
            expect(existing.has(v.s3Key)).toBe(true); // BR-5: 유실 제외
            expect(v.title).not.toBe('');
          }
        },
      ),
    );
  });

  it('invariant: merge 결과는 createdAt 내림차순 (PBT-03)', () => {
    fc.assert(
      fc.property(
        fc.array(libraryRecordArb, { maxLength: 8 }),
        fc.array(legacyRecordArb, { maxLength: 8 }),
        (libs, shorts) => {
          const existing = new Set([
            ...libs.map((r) => r.s3Key),
            ...shorts.map((r) => pipelineDestKey('shorts', r.id)),
          ]);
          const result = mergeSelectableVideos(libs, shorts, [], existing);
          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].createdAt >= result[i].createdAt).toBe(true);
          }
        },
      ),
    );
  });

  it('idempotence/순수성: 같은 입력에 재적용해도 결과가 동일하고 입력이 변형되지 않는다 (PBT-04)', () => {
    fc.assert(
      fc.property(
        fc.array(libraryRecordArb, { maxLength: 6 }),
        fc.array(legacyRecordArb, { maxLength: 6 }),
        (libs, speakers) => {
          const existing = new Set([
            ...libs.map((r) => r.s3Key),
            ...speakers.map((r) => pipelineDestKey('speaker', r.id)),
          ]);
          const libsSnapshot = JSON.stringify(libs);
          const first = mergeSelectableVideos(libs, [], speakers, existing);
          const second = mergeSelectableVideos(libs, [], speakers, existing);
          expect(second).toEqual(first);
          expect(JSON.stringify(libs)).toBe(libsSnapshot);
        },
      ),
    );
  });

  it('invariant: validateCopySize 경계 — 한도 이하 ok, 초과 not ok (PBT-03)', () => {
    fc.assert(
      fc.property(sizeBytesArb, (size) => {
        const { ok } = validateCopySize(size);
        expect(ok).toBe(size <= MAX_COPY_BYTES);
      }),
    );
  });

  it('invariant: deriveTitle 결과는 항상 비어 있지 않다 (BR-2, PBT-03)', () => {
    fc.assert(
      fc.property(fileNameArb, (name) => {
        expect(deriveTitle(name).trim()).not.toBe('');
      }),
    );
  });
});

describe('videoLibrary — example-based (PBT-10 보완)', () => {
  it('키 생성 형식이 파이프라인 계약과 일치한다 (NFR-1)', () => {
    expect(pipelineDestKey('shorts', 'abc')).toBe('videos/abc/RAW.mp4');
    expect(pipelineDestKey('speaker', 'abc')).toBe('videos/abc/LONG_RAW.mp4');
    expect(librarySourceKey('v1')).toBe('videos/library/v1/SOURCE.mp4');
  });

  it('classifyKey 핵심 케이스', () => {
    expect(classifyKey('videos/abc/RAW.mp4')).toBe('shorts-raw');
    expect(classifyKey('videos/abc/LONG_RAW.mp4')).toBe('speaker-raw');
    expect(classifyKey('videos/library/v1/SOURCE.mp4')).toBe('library');
    expect(classifyKey('videos/abc/Transcript.json')).toBe('other');
    expect(classifyKey('assets/foo.mp4')).toBe('other');
  });

  it('validateCopySize: undefined는 통과(레거시 크기 미상), 정확히 5GiB는 통과', () => {
    expect(validateCopySize(undefined).ok).toBe(true);
    expect(validateCopySize(MAX_COPY_BYTES).ok).toBe(true);
    expect(validateCopySize(MAX_COPY_BYTES + 1).ok).toBe(false);
  });

  it('deriveTitle: 확장자 제거·빈 결과 보정', () => {
    expect(deriveTitle('웨비나 3회.mp4')).toBe('웨비나 3회');
    expect(deriveTitle('.mp4')).toBe('제목 없음');
  });

  it('merge: 레거시 제목 파생(BR-7)과 유실 제외(BR-5)', () => {
    const shorts = [{ id: 'h1', createdAt: '2026-07-01T00:00:00.000Z' }];
    const speakers = [{ id: 'e1', createdAt: null }];
    const existing = new Set(['videos/h1/RAW.mp4']); // e1 원본은 유실
    const result = mergeSelectableVideos([], shorts, speakers, existing);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('쇼츠 원본 · 2026-07-01');
    expect(result[0].source).toBe('legacy-shorts');
  });
});
