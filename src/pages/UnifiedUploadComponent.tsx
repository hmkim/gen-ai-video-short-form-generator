// UnifiedUploadComponent.tsx — VideoLibraryPage (업로드 전용)
//
// upload-library (US-1) + iteration 2 (R2) + iteration 3: `/upload` = 영상
// 업로드 전용 화면. 제목 입력 없음 — 제목은 파일명에서 자동 파생되고, 수정은
// "내 라이브러리"(/library)에서 한다 (저장 시점이 모호한 입력 필드 제거).
// 업로드 순서: S3 업로드 성공 → Video 레코드 생성 (W1 — 유령 레코드 방지).

import React, { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
} from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { useNavigate } from 'react-router-dom';
import { createVideo } from '../apis/video';
import { deriveTitle, librarySourceKey } from '../data/videoLibrary';

const UnifiedUploadComponent: React.FC = () => {
  const navigate = useNavigate();
  const [uploadedCount, setUploadedCount] = useState(0);
  // StorageManager 콜백 시점에 파일 메타데이터를 참조하기 위한 ref
  const pendingUploads = useRef<Map<string, { title: string; size?: number; fileName: string }>>(
    new Map(),
  );

  return (
    <ContentLayout header={<Header variant="h1">영상 업로드</Header>}>
      <Container
        header={
          <Header
            variant="h2"
            description="여기서 업로드한 영상은 쇼츠만들기·화자별 편집 어디서든 재사용할 수 있습니다. 업로드된 영상 관리는 '내 라이브러리' 메뉴에서 합니다."
          >
            라이브러리에 업로드
          </Header>
        }
      >
        <SpaceBetween size="m">
          {uploadedCount > 0 && (
            <Alert
              type="success"
              action={
                <Button onClick={() => navigate('/library')} data-testid="upload-goto-library">
                  내 라이브러리 보기
                </Button>
              }
              data-testid="upload-success-alert"
            >
              영상 {uploadedCount}개를 라이브러리에 추가했습니다.
            </Alert>
          )}
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
                title: deriveTitle(file.name), // 제목 = 파일명 파생 (수정은 /library)
                size: file.size,
                fileName: file.name, // R3: 원본 파일명 보존
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
                  meta?.fileName,
                );
                pendingUploads.current.delete(fullKey);
                setUploadedCount((n) => n + 1);
              })();
            }}
          />
          <Box color="text-body-secondary">
            제목은 파일명으로 자동 설정됩니다. 제목 수정·삭제는{' '}
            <Button variant="inline-link" onClick={() => navigate('/library')}>
              내 라이브러리
            </Button>
            에서 할 수 있습니다.
          </Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
};

export default UnifiedUploadComponent;
