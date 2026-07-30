// UnifiedUploadComponent.tsx — VideoLibraryPage
//
// upload-library (US-1, US-2): `/upload` = 영상 라이브러리.
// 파일을 목적 없이 업로드해 두고(파이프라인 미트리거 키), 쇼츠만들기/화자별
// 편집 화면이 이 라이브러리에서 영상을 선택해 처리를 시작한다.
// 업로드 순서: S3 업로드 성공 → Video 레코드 생성 (W1 — 유령 레코드 방지).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  SpaceBetween,
  Table,
} from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { createVideo, fetchVideos, type Video } from '../apis/video';
import { deriveTitle, librarySourceKey } from '../data/videoLibrary';

const formatSize = (bytes?: number | null): string => {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

const UnifiedUploadComponent: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  // StorageManager 콜백 시점에 파일 메타데이터를 참조하기 위한 ref
  const pendingUploads = useRef<Map<string, { title: string; size?: number }>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const items = await fetchVideos();
      setVideos(
        [...items].sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1)),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ContentLayout header={<Header variant="h1">영상 업로드</Header>}>
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              variant="h2"
              description="여기서 업로드한 영상은 쇼츠만들기·화자별 편집 어디서든 재사용할 수 있습니다."
            >
              라이브러리에 업로드
            </Header>
          }
        >
          <SpaceBetween size="m">
            <FormField label="영상 제목" description="비워 두면 파일명을 제목으로 사용합니다.">
              <Input
                value={title}
                onChange={({ detail }) => setTitle(detail.value)}
                placeholder="예: 7월 웨비나 본편"
                data-testid="library-title-input"
              />
            </FormField>
            <StorageManager
              acceptedFileTypes={['video/mp4']}
              path="videos/"
              maxFileCount={1}
              useAccelerateEndpoint
              processFile={({ file }) => {
                const videoId = crypto.randomUUID();
                // StorageManager는 path("videos/") + key로 최종 경로를 만든다
                const key = librarySourceKey(videoId).replace(/^videos\//, '');
                pendingUploads.current.set(librarySourceKey(videoId), {
                  title: title.trim() !== '' ? title.trim() : deriveTitle(file.name),
                  size: file.size,
                });
                return { file, key, useAccelerateEndpoint: true };
              }}
              onUploadSuccess={({ key }) => {
                void (async () => {
                  if (!key) return;
                  const fullKey = key.startsWith('videos/') ? key : `videos/${key}`;
                  const meta = pendingUploads.current.get(fullKey);
                  await createVideo(
                    meta?.title ?? deriveTitle(fullKey.split('/').pop() ?? ''),
                    fullKey,
                    meta?.size,
                  );
                  pendingUploads.current.delete(fullKey);
                  setTitle('');
                  await refresh();
                })();
              }}
            />
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2" counter={`(${videos.length})`}>내 라이브러리</Header>}>
          <Table
            items={videos}
            loading={loading}
            loadingText="라이브러리를 불러오는 중…"
            columnDefinitions={[
              { id: 'title', header: '제목', cell: (v) => v.title },
              {
                id: 'createdAt',
                header: '업로드 일시',
                cell: (v) => (v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'),
              },
              { id: 'size', header: '크기', cell: (v) => formatSize(v.sizeBytes) },
            ]}
            empty={
              <Box textAlign="center" color="inherit" data-testid="library-empty-state">
                <b>업로드된 영상이 없습니다</b>
                <Box variant="p" color="inherit">
                  위에서 영상을 업로드하면 쇼츠만들기·화자별 편집에서 선택할 수 있습니다.
                </Box>
              </Box>
            }
            data-testid="library-table"
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
};

export default UnifiedUploadComponent;
