// video.ts
//
// upload-library API 계층 (설계 C6). Video 모델 CRUD + S3 list/copy 래퍼.
// 순수 로직(키 생성·병합)은 src/data/videoLibrary.ts에 있고 여기는 I/O만 담당.

import { generateClient } from 'aws-amplify/data';
import { copy, list } from 'aws-amplify/storage';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>({ authMode: 'userPool' });

export type Video = Schema['Video']['type'];

export const createVideo = async (
  title: string,
  s3Key: string,
  sizeBytes?: number,
) => {
  const { data: video } = await client.models.Video.create({
    title,
    s3Key,
    sizeBytes,
    status: 'UPLOADED',
  });
  return video;
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
