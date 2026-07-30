// LibraryManageComponent.tsx — 내 라이브러리 관리 (`/library`)
//
// iteration 2 (R3): 라이브러리 영상의 목록·제목 수정·삭제.
// - 파일명 컬럼: 업로드 시 보존한 원본 파일명 (제목 수정과 무관, 기존 레코드는 '-')
// - 삭제: 확인 모달 → S3 원본 삭제 → Video 레코드 삭제. 이미 시작된 처리
//   (파이프라인 복사본)에는 영향 없음.
// - 제목 수정: 모달 입력, 빈 제목 불허 (BR-2).

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  Table,
} from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import {
  deleteVideoWithObject,
  fetchVideos,
  updateVideoTitle,
  type Video,
} from '../apis/video';

const formatSize = (bytes?: number | null): string => {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

const LibraryManageComponent: React.FC = () => {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editTarget, setEditTarget] = useState<Video | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await fetchVideos();
      setVideos(
        [...items].sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1)),
      );
    } catch (loadError) {
      console.error('library load failed:', loadError);
      setError('라이브러리를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRename = async () => {
    if (!editTarget) return;
    const next = editTitle.trim();
    if (next === '') return; // BR-2: 빈 제목 불허 (버튼도 disabled)
    setBusy(true);
    try {
      await updateVideoTitle(editTarget.id, next);
      setEditTarget(null);
      await refresh();
    } catch (renameError) {
      console.error('rename failed:', renameError);
      setError('제목 수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteVideoWithObject(deleteTarget);
      setDeleteTarget(null);
      await refresh();
    } catch (deleteError) {
      console.error('delete failed:', deleteError);
      setError('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1">내 라이브러리</Header>}>
      <SpaceBetween size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Container
          header={
            <Header
              variant="h2"
              counter={`(${videos.length})`}
              actions={
                <Button onClick={() => navigate('/upload')} data-testid="library-goto-upload">
                  영상 업로드
                </Button>
              }
            >
              업로드된 영상
            </Header>
          }
        >
          <Table
            items={videos}
            loading={loading}
            loadingText="라이브러리를 불러오는 중…"
            columnDefinitions={[
              { id: 'title', header: '제목', cell: (v) => v.title },
              { id: 'fileName', header: '파일명', cell: (v) => v.fileName ?? '-' },
              { id: 'size', header: '크기', cell: (v) => formatSize(v.sizeBytes) },
              {
                id: 'createdAt',
                header: '업로드 일시',
                cell: (v) => (v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'),
              },
              {
                id: 'actions',
                header: '작업',
                cell: (v) => (
                  <SpaceBetween size="xs" direction="horizontal">
                    <Button
                      variant="inline-link"
                      onClick={() => {
                        setEditTarget(v);
                        setEditTitle(v.title);
                      }}
                      ariaLabel={`${v.title} 제목 수정`}
                      data-testid={`library-rename-${v.id}`}
                    >
                      제목 수정
                    </Button>
                    <Button
                      variant="inline-link"
                      onClick={() => setDeleteTarget(v)}
                      ariaLabel={`${v.title} 삭제`}
                      data-testid={`library-delete-${v.id}`}
                    >
                      삭제
                    </Button>
                  </SpaceBetween>
                ),
              },
            ]}
            empty={
              <Box textAlign="center" color="inherit" data-testid="library-empty-state">
                <b>업로드된 영상이 없습니다</b>
                <Box variant="p" color="inherit" padding={{ bottom: 's' }}>
                  영상을 업로드하면 여기서 관리할 수 있습니다.
                </Box>
                <Button onClick={() => navigate('/upload')}>영상 업로드로 이동</Button>
              </Box>
            }
            data-testid="library-manage-table"
          />
        </Container>

        {/* 제목 수정 모달 */}
        <Modal
          visible={editTarget !== null}
          onDismiss={() => setEditTarget(null)}
          header="제목 수정"
          footer={
            <Box float="right">
              <SpaceBetween size="xs" direction="horizontal">
                <Button variant="link" onClick={() => setEditTarget(null)}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleRename()}
                  loading={busy}
                  disabled={editTitle.trim() === ''}
                  data-testid="library-rename-confirm"
                >
                  저장
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <FormField
            label="새 제목"
            description={`파일명(${editTarget?.fileName ?? '-'})은 그대로 유지됩니다.`}
          >
            <Input
              value={editTitle}
              onChange={({ detail }) => setEditTitle(detail.value)}
              data-testid="library-rename-input"
            />
          </FormField>
        </Modal>

        {/* 삭제 확인 모달 */}
        <Modal
          visible={deleteTarget !== null}
          onDismiss={() => setDeleteTarget(null)}
          header="영상 삭제"
          footer={
            <Box float="right">
              <SpaceBetween size="xs" direction="horizontal">
                <Button variant="link" onClick={() => setDeleteTarget(null)}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleDelete()}
                  loading={busy}
                  data-testid="library-delete-confirm"
                >
                  삭제
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="s">
            <Box>
              <b>{deleteTarget?.title}</b> 영상을 라이브러리에서 삭제합니다. 원본 파일도 함께
              삭제되며 되돌릴 수 없습니다.
            </Box>
            <Alert type="info">
              이미 시작된 쇼츠·화자별 처리 결과에는 영향이 없습니다. 삭제 후에는 이 영상을 새
              처리에 재사용할 수 없습니다.
            </Alert>
          </SpaceBetween>
        </Modal>
      </SpaceBetween>
    </ContentLayout>
  );
};

export default LibraryManageComponent;
