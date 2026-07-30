// video.ts
//
// upload-library API 계층 (설계 C6). Video 모델 CRUD + S3 list/copy 래퍼.
// 순수 로직(키 생성·병합)은 src/data/videoLibrary.ts에 있고 여기는 I/O만 담당.

import { generateClient } from 'aws-amplify/data';
import { copy, list, remove } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>({ authMode: 'userPool' });

export type Video = Schema['Video']['type'];

export const createVideo = async (
  title: string,
  s3Key: string,
  sizeBytes?: number,
  fileName?: string,
) => {
  const { data: video } = await client.models.Video.create({
    title,
    s3Key,
    fileName,
    sizeBytes,
    status: 'UPLOADED',
  });
  return video;
};

/** R3: 제목 수정 — fileName/s3Key는 불변. */
export const updateVideoTitle = async (id: string, title: string) => {
  const { data: video } = await client.models.Video.update({ id, title });
  return video;
};

/**
 * R3: 라이브러리 영상 삭제 — 레코드 + S3 원본. 파이프라인 복사본
 * (videos/{recordId}/...)은 독립 객체라 기존 처리 결과에 영향 없다.
 * S3 삭제 실패 시 레코드는 남겨 재시도 가능하게 한다.
 */
export const deleteVideoWithObject = async (video: Pick<Video, 'id' | 's3Key'>) => {
  await remove({ path: video.s3Key });
  const { data: deleted } = await client.models.Video.delete({ id: video.id });
  return deleted;
};

export const fetchVideos = async (): Promise<Video[]> => {
  const { data: videos } = await client.models.Video.list();
  return videos;
};

export const deleteVideo = async (id: string) => {
  const { data: video } = await client.models.Video.delete({ id });
  return video;
};

/**
 * videos/ 아래 실존 객체 키 집합 (W2 대사용, AD-4).
 * per-key HEAD 대신 prefix list 1회(페이지네이션 포함)로 수집한다.
 */
export const listExistingSourceKeys = async (): Promise<Set<string>> => {
  const keys = new Set<string>();
  let nextToken: string | undefined;
  do {
    const result = await list({
      path: 'videos/',
      options: { nextToken, pageSize: 1000 },
    });
    for (const item of result.items) {
      keys.add(item.path);
    }
    nextToken = result.nextToken;
  } while (nextToken);
  return keys;
};

/** 원본을 파이프라인 트리거 키로 복사 (W3). S3 PUT 이벤트가 SFN을 시작시킨다. */
export const copyToPipeline = async (sourceKey: string, destKey: string) => {
  await copy({
    source: { path: sourceKey },
    destination: { path: destKey },
  });
};
