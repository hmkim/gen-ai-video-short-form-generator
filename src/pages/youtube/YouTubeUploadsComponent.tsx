import React, { useEffect, useState, useCallback } from 'react';
import {
  Container, Header, SpaceBetween, Button, Box, Spinner,
  Table, StatusIndicator, Alert, Modal, Flashbar, Link,
  ButtonDropdown,
} from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { readLongVideoEdit } from '../../apis/longVideoEdit';

const client = generateClient<Schema>({ authMode: 'userPool' });

type YouTubeUploadRecord = Schema["YouTubeUpload"]["type"];

interface UploadEntry extends YouTubeUploadRecord {
  presenterName?: string;
  videoName?: string;
}

const YouTubeUploadsComponent: React.FC = () => {
  const navigate = useNavigate();
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<UploadEntry | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flashMessages, setFlashMessages] = useState<
    Array<{ id: string; type: "success" | "error"; content: string }>
  >([]);

  const showFlash = useCallback(
    (type: "success" | "error", content: string) => {
      const msgId = Date.now().toString();
      setFlashMessages((prev) => [...prev, { id: msgId, type, content }]);
      setTimeout(
        () => setFlashMessages((prev) => prev.filter((m) => m.id !== msgId)),
        4000
      );
    },
    []
  );

  const loadUploads = useCallback(async () => {
    setLoading(true);
    try {
      const { data: records } = await client.models.YouTubeUpload.list();

      // Enrich with edit metadata
      const editCache: Record<string, { videoName?: string; p1?: string; p2?: string }> = {};
      const enriched: UploadEntry[] = [];

      for (const record of records) {
        const editId = record.longVideoEditId;
        if (editId && !editCache[editId]) {
          const edit = await readLongVideoEdit(editId);
          editCache[editId] = {
            videoName: edit?.videoName,
            p1: edit?.presenter1Name || 'Presenter 1',
            p2: edit?.presenter2Name || 'Presenter 2',
          };
        }

        const editInfo = editId ? editCache[editId] : undefined;
        enriched.push({
          ...record,
          presenterName:
            record.presenterNumber === 1
              ? editInfo?.p1
              : editInfo?.p2,
          videoName: editInfo?.videoName?.replace(/\.[^.]+$/, '') || '',
        });
      }

      setUploads(enriched.sort((a, b) => {
        const aTime = a.uploadStartedAt || a.createdAt || '';
        const bTime = b.uploadStartedAt || b.createdAt || '';
        return bTime.localeCompare(aTime); // newest first
      }));
    } catch (error) {
      console.error('Error loading uploads:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  // Auto-refresh every 15s to catch status updates
  useEffect(() => {
    const hasUploading = uploads.some((u) => u.uploadStatus === 'uploading');
    if (!hasUploading) return;

    const interval = setInterval(loadUploads, 15000);
    return () => clearInterval(interval);
  }, [uploads, loadUploads]);

  const getStatusIndicator = (upload: UploadEntry) => {
    if (upload.uploadStatus === 'uploading') {
      return <StatusIndicator type="in-progress">Uploading...</StatusIndicator>;
    }
    if (upload.uploadStatus === 'failed') {
      return (
        <StatusIndicator type="error">
          Failed{upload.uploadError ? `: ${upload.uploadError}` : ''}
        </StatusIndicator>
      );
    }
    if (upload.youtubeVideoId) {
      return <StatusIndicator type="success">Uploaded</StatusIndicator>;
    }
    return <StatusIndicator type="pending">Unknown</StatusIndicator>;
  };

  const handleRemoveRecord = async (upload: UploadEntry) => {
    setConfirmDelete(null);
    setDeleting(upload.id);

    try {
      await client.models.YouTubeUpload.delete({ id: upload.id });
      showFlash(
        'success',
        upload.youtubeVideoId
          ? `Upload record removed. YouTube video (${upload.youtubeVideoId}) must be deleted separately from YouTube Studio.`
          : 'Upload record removed.'
      );
      loadUploads();
    } catch (error) {
      console.error('Delete error:', error);
      showFlash('error', 'Failed to remove upload record');
    }
    setDeleting(null);
  };

  if (loading) {
    return (
      <Container header={<Header variant="h2">YouTube Uploads</Header>}>
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <Flashbar
        items={flashMessages.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          dismissible: true,
          onDismiss: () =>
            setFlashMessages((prev) => prev.filter((p) => p.id !== m.id)),
        }))}
      />

      <Table
        header={
          <Header
            variant="h2"
            counter={`(${uploads.length})`}
            actions={
              <Button iconName="refresh" onClick={loadUploads}>
                Refresh
              </Button>
            }
          >
            YouTube Uploads
          </Header>
        }
        columnDefinitions={[
          {
            id: 'video',
            header: 'Video',
            cell: (item) => item.videoName || '-',
            width: 180,
          },
          {
            id: 'presenter',
            header: 'Presenter',
            cell: (item) => item.presenterName || `Presenter ${item.presenterNumber}`,
            width: 120,
          },
          {
            id: 'title',
            header: 'Title',
            cell: (item) => item.title || '-',
            width: 200,
          },
          {
            id: 'channel',
            header: 'Channel',
            cell: (item) => item.youtubeChannelTitle || '-',
            width: 140,
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => getStatusIndicator(item),
            width: 150,
          },
          {
            id: 'youtubeId',
            header: 'YouTube ID',
            cell: (item) =>
              item.youtubeVideoId ? (
                <Link
                  href={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
                  external
                >
                  {item.youtubeVideoId}
                </Link>
              ) : (
                '-'
              ),
            width: 140,
          },
          {
            id: 'startedAt',
            header: 'Started',
            cell: (item) =>
              item.uploadStartedAt
                ? new Date(item.uploadStartedAt).toLocaleString()
                : '-',
            width: 160,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ButtonDropdown
                variant="inline-icon"
                expandToViewport
                items={[
                  ...(item.longVideoEditId
                    ? [{ id: 'view', text: 'View output' }]
                    : []),
                  { id: 'remove', text: 'Remove record' },
                ]}
                onItemClick={({ detail }) => {
                  if (detail.id === 'view' && item.longVideoEditId) {
                    navigate(
                      `/longvideo/output/${item.longVideoEditId}?presenter=${item.presenterNumber}`
                    );
                  } else if (detail.id === 'remove') {
                    setConfirmDelete(item);
                  }
                }}
                loading={deleting === item.id}
              />
            ),
            width: 70,
          },
        ]}
        items={uploads}
        empty={
          <Box textAlign="center" padding="xl">
            <Alert type="info">
              No YouTube uploads yet. Upload videos from the output page.
            </Alert>
          </Box>
        }
        stickyHeader
        stripedRows
        wrapLines={false}
      />

      <Modal
        visible={confirmDelete !== null}
        onDismiss={() => setConfirmDelete(null)}
        header="Remove Upload Record?"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => confirmDelete && handleRemoveRecord(confirmDelete)}
              >
                Remove
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="s">
          <Box>
            This will remove the upload record for{' '}
            <strong>{confirmDelete?.title || 'this video'}</strong>.
          </Box>
          {confirmDelete?.youtubeVideoId && (
            <Alert type="warning">
              YouTube Video ID: <strong>{confirmDelete.youtubeVideoId}</strong>
              <br />
              The video on YouTube must be deleted separately from{' '}
              <Link
                href="https://studio.youtube.com"
                external
              >
                YouTube Studio
              </Link>
              .
            </Alert>
          )}
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
};

export default YouTubeUploadsComponent;
