// upload-library 화면 테스트 (예제 기반 — PBT-10에서 DOM 분기는 예제로 커버).
// UnifiedUploadComponent = 영상 라이브러리(/upload): 업로드 UI + 목록/빈 상태.
// VideoPicker: 목록/빈 상태/선택 콜백. API·Storage 계층은 전부 모킹.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import UnifiedUploadComponent from '../UnifiedUploadComponent';
import LibraryManageComponent from '../LibraryManageComponent';
import VideoPicker from '../VideoPicker';
import type { SelectableVideo } from '../../data/videoLibrary';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// StorageManager는 Amplify 설정을 요구하므로 플레이스홀더로 대체
vi.mock('@aws-amplify/ui-react-storage', () => ({
  StorageManager: () => <div data-testid="storage-manager-stub" />,
}));

const {
  mockFetchVideos, mockListKeys, mockFetchHistory, mockFetchEdits,
  mockUpdateVideoTitle, mockDeleteVideoWithObject,
} = vi.hoisted(() => ({
  mockFetchVideos: vi.fn(),
  mockListKeys: vi.fn(),
  mockFetchHistory: vi.fn(),
  mockFetchEdits: vi.fn(),
  mockUpdateVideoTitle: vi.fn(),
  mockDeleteVideoWithObject: vi.fn(),
}));

vi.mock('../../apis/video', () => ({
  createVideo: vi.fn(),
  fetchVideos: mockFetchVideos,
  listExistingSourceKeys: mockListKeys,
  copyToPipeline: vi.fn(),
  updateVideoTitle: mockUpdateVideoTitle,
  deleteVideoWithObject: mockDeleteVideoWithObject,
}));
vi.mock('../../apis/history', () => ({
  fetchHistory: mockFetchHistory,
  createHistory: vi.fn(),
  deleteHistory: vi.fn(),
}));
vi.mock('../../apis/longVideoEdit', () => ({
  fetchLongVideoEdits: mockFetchEdits,
  createLongVideoEdit: vi.fn(),
  deleteLongVideoEdit: vi.fn(),
}));

describe('UnifiedUploadComponent (영상 업로드 전용, US-1 + R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('업로더가 보인다 — 라우팅 카드가 아니라 실제 업로드 화면 (AC-1.1)', () => {
    render(<MemoryRouter><UnifiedUploadComponent /></MemoryRouter>);
    expect(screen.getByTestId('storage-manager-stub')).toBeInTheDocument();
  });

  it('iteration 3: 제목 입력 필드가 없다 — 제목은 파일명 파생, 수정은 /library', () => {
    render(<MemoryRouter><UnifiedUploadComponent /></MemoryRouter>);
    expect(screen.queryByTestId('library-title-input')).not.toBeInTheDocument();
  });

  it('R2: 업로드 화면에는 목록이 없고 내 라이브러리로의 이동 경로가 있다', () => {
    render(<MemoryRouter><UnifiedUploadComponent /></MemoryRouter>);
    expect(screen.queryByTestId('library-manage-table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('내 라이브러리'));
    expect(mockNavigate).toHaveBeenCalledWith('/library');
  });
});

describe('LibraryManageComponent (내 라이브러리 관리, R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchVideos.mockResolvedValue([]);
  });

  it('라이브러리가 비어 있으면 빈 상태 안내가 보인다', async () => {
    render(<MemoryRouter><LibraryManageComponent /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByTestId('library-empty-state')).toBeInTheDocument(),
    );
  });

  it('영상이 제목·파일명·크기와 함께 보인다 (파일명 없으면 - 표시)', async () => {
    mockFetchVideos.mockResolvedValue([
      { id: 'v1', title: '웨비나 본편', s3Key: 'videos/library/v1/SOURCE.mp4',
        fileName: 'GMT-recording.mp4', sizeBytes: 1024 * 1024 * 100,
        createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'v2', title: '구버전 영상', s3Key: 'videos/library/v2/SOURCE.mp4',
        fileName: null, sizeBytes: null, createdAt: '2026-06-01T00:00:00.000Z' },
    ]);
    render(<MemoryRouter><LibraryManageComponent /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('웨비나 본편')).toBeInTheDocument());
    expect(screen.getByText('GMT-recording.mp4')).toBeInTheDocument();
    expect(screen.getByText('100 MB')).toBeInTheDocument();
    expect(screen.getByText('구버전 영상')).toBeInTheDocument();
  });

  it('제목 수정: 모달에서 저장하면 updateVideoTitle 호출, 빈 제목은 저장 불가', async () => {
    mockFetchVideos.mockResolvedValue([
      { id: 'v1', title: '원래 제목', s3Key: 'videos/library/v1/SOURCE.mp4',
        fileName: 'a.mp4', sizeBytes: 1, createdAt: '2026-07-01T00:00:00.000Z' },
    ]);
    render(<MemoryRouter><LibraryManageComponent /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('library-rename-v1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('library-rename-v1'));

    const input = screen.getByTestId('library-rename-input').querySelector('input')!;
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('library-rename-confirm')).toBeDisabled();

    fireEvent.change(input, { target: { value: '새 제목' } });
    fireEvent.click(screen.getByTestId('library-rename-confirm'));
    await waitFor(() => expect(mockUpdateVideoTitle).toHaveBeenCalledWith('v1', '새 제목'));
  });

  it('삭제: 확인 모달을 거쳐 deleteVideoWithObject 호출', async () => {
    mockFetchVideos.mockResolvedValue([
      { id: 'v1', title: '삭제 대상', s3Key: 'videos/library/v1/SOURCE.mp4',
        fileName: 'a.mp4', sizeBytes: 1, createdAt: '2026-07-01T00:00:00.000Z' },
    ]);
    render(<MemoryRouter><LibraryManageComponent /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('library-delete-v1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('library-delete-v1'));
    fireEvent.click(screen.getByTestId('library-delete-confirm'));
    await waitFor(() =>
      expect(mockDeleteVideoWithObject).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', s3Key: 'videos/library/v1/SOURCE.mp4' }),
      ),
    );
  });
});

describe('VideoPicker (US-3/US-5)', () => {
  const libVideo = {
    id: 'v1', title: '라이브러리 영상', s3Key: 'videos/library/v1/SOURCE.mp4',
    sizeBytes: 1000, createdAt: '2026-07-02T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchVideos.mockResolvedValue([]);
    mockFetchHistory.mockResolvedValue([]);
    mockFetchEdits.mockResolvedValue([]);
    mockListKeys.mockResolvedValue(new Set());
  });

  it('모든 소스가 비어 있으면 /upload 유도 빈 상태가 보인다 (AC-3.3)', async () => {
    render(<MemoryRouter><VideoPicker onSelect={vi.fn()} /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByTestId('video-picker-empty-state')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('video-picker-goto-upload'));
    expect(mockNavigate).toHaveBeenCalledWith('/upload');
  });

  it('레거시 원본은 S3에 실존하는 것만 표시된다 (AC-3.2)', async () => {
    mockFetchHistory.mockResolvedValue([
      { id: 'h-alive', createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'h-lost', createdAt: '2026-06-02T00:00:00.000Z' },
    ]);
    mockListKeys.mockResolvedValue(new Set(['videos/h-alive/RAW.mp4']));
    render(<MemoryRouter><VideoPicker onSelect={vi.fn()} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('쇼츠 원본 · 2026-06-01')).toBeInTheDocument());
    expect(screen.queryByText('쇼츠 원본 · 2026-06-02')).not.toBeInTheDocument();
  });

  it('영상 선택 후 계속 버튼을 누르면 onSelect가 호출된다 (AC-4.1 진입)', async () => {
    mockFetchVideos.mockResolvedValue([libVideo]);
    mockListKeys.mockResolvedValue(new Set([libVideo.s3Key]));
    const onSelect = vi.fn();
    render(<MemoryRouter><VideoPicker onSelect={onSelect} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('라이브러리 영상')).toBeInTheDocument());

    // Cloudscape single-select 라디오 선택
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByTestId('video-picker-continue'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject(
      { s3Key: libVideo.s3Key, source: 'library' } satisfies Partial<SelectableVideo>,
    );
  });
});
