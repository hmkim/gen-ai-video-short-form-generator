// VideoPicker.tsx
//
// upload-library (US-3, US-5): 공유 영상 선택 컴포넌트 (설계 C2).
// 라이브러리(Video) + 레거시(History/LongVideoEdit) 레코드를 S3 실존 키와
// 대사해(W2) 선택 가능한 목록으로 보여준다. 선택은 onSelect 콜백으로 방출.

import React, { useEffect, useState } from 'react';
import { Badge, Box, Button, Table } from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import { fetchHistory } from '../apis/history';
import { fetchLongVideoEdits } from '../apis/longVideoEdit';
import { fetchVideos, listExistingSourceKeys } from '../apis/video';
import {
  mergeSelectableVideos,
  type SelectableVideo,
  type VideoSource,
} from '../data/videoLibrary';

const SOURCE_LABEL: Record<VideoSource, { text: string; color: 'green' | 'blue' | 'grey' }> = {
  library: { text: '라이브러리', color: 'green' },
  'legacy-shorts': { text: '쇼츠 원본', color: 'blue' },
  'legacy-speaker': { text: '화자별 원본', color: 'grey' },
};

interface VideoPickerProps {
  onSelect: (video: SelectableVideo) => void;
}

const VideoPicker: React.FC<VideoPickerProps> = ({ onSelect }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SelectableVideo[]>([]);
  const [selected, setSelected] = useState<SelectableVideo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [libs, histories, edits, existingKeys] = await Promise.all([
          fetchVideos(),
          fetchHistory(),
          fetchLongVideoEdits(),
          listExistingSourceKeys(),
        ]);
        if (cancelled) return;
        setItems(
          mergeSelectableVideos(
            libs.map((v: { title: string; s3Key: string; createdAt?: string | null; sizeBytes?: number | null }) => ({
              title: v.title,
              s3Key: v.s3Key,
              createdAt: v.createdAt,
              sizeBytes: v.sizeBytes,
            })),
            histories.map((h: { id: string; createdAt?: string | null }) => ({ id: h.id, createdAt: h.createdAt })),
            edits.map((e: { id: string; createdAt?: string | null }) => ({ id: e.id, createdAt: e.createdAt })),
            existingKeys,
          ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Table
      items={items}
      loading={loading}
      loadingText="영상 목록을 불러오는 중…"
      selectionType="single"
      selectedItems={selected ? [selected] : []}
      onSelectionChange={({ detail }) =>
        setSelected((detail.selectedItems[0] as SelectableVideo) ?? null)
      }
      trackBy="s3Key"
      columnDefinitions={[
        { id: 'title', header: '제목', cell: (v) => v.title },
        {
          id: 'source',
          header: '출처',
          cell: (v) => (
            <Badge color={SOURCE_LABEL[v.source].color}>{SOURCE_LABEL[v.source].text}</Badge>
          ),
        },
        {
          id: 'createdAt',
          header: '업로드 일시',
          cell: (v) => (v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'),
        },
      ]}
      header={
        <Button
          variant="primary"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          data-testid="video-picker-continue"
        >
          이 영상으로 계속
        </Button>
      }
      empty={
        <Box textAlign="center" color="inherit" data-testid="video-picker-empty-state">
          <b>업로드된 영상이 없습니다</b>
          <Box variant="p" color="inherit" padding={{ bottom: 's' }}>
            먼저 영상을 라이브러리에 업로드해 주세요.
          </Box>
          <Button onClick={() => navigate('/upload')} data-testid="video-picker-goto-upload">
            영상 업로드로 이동
          </Button>
        </Box>
      }
      data-testid="video-picker-table"
    />
  );
};

export default VideoPicker;
