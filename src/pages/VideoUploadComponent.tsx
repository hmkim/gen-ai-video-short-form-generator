// VideoUploadComponent.tsx — ShortsCreatePage
//
// upload-library (US-3, US-4): `/` = 쇼츠만들기. 업로드 폼 대신 2단계 흐름:
// 'pick' — VideoPicker에서 영상 선택 → 'form' — 쇼츠 메타데이터 입력 후
// 새 History 생성 + S3 복사(W3)로 기존 쇼츠 파이프라인을 트리거한다.
// 복사 실패 시 생성한 레코드를 삭제한다 (BR-6 보상).

import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormField,
  Header,
  Input,
  Select,
  SpaceBetween,
} from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import { createHistory, deleteHistory } from '../apis/history';
import { copyToPipeline } from '../apis/video';
import { useApprovedModels, type ModelSelectOption } from '../data/useApprovedModels';
import {
  pipelineDestKey,
  validateCopySize,
  type SelectableVideo,
} from '../data/videoLibrary';
import VideoPicker from './VideoPicker';

const VideoUploadComponent: React.FC = () => {
  const navigate = useNavigate();
  const { options, defaultOption, loading: modelsLoading } = useApprovedModels();

  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [selectedVideo, setSelectedVideo] = useState<SelectableVideo | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelSelectOption | null>(null);
  const effectiveModel = selectedModel ?? defaultOption;
  const [numberOfVideos, setNumberOfVideos] = useState('1');
  const [theme, setTheme] = useState('');
  const [videoLength, setVideoLength] = useState('60');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (video: SelectableVideo) => {
    const size = validateCopySize(video.sizeBytes);
    if (!size.ok) {
      setError(size.reason ?? '이 영상은 재처리할 수 없습니다.');
      return;
    }
    setError(null);
    setSelectedVideo(video);
    setStep('form');
  };

  const handleStart = async () => {
    if (!selectedVideo) return;
    setStarting(true);
    setError(null);
    const history = await createHistory(
      selectedVideo.s3Key,
      effectiveModel.value,
      parseInt(numberOfVideos),
      theme || 'general',
      parseInt(videoLength),
    );
    if (!history) {
      setError('처리 레코드 생성에 실패했습니다. 다시 시도해 주세요.');
      setStarting(false);
      return;
    }
    try {
      await copyToPipeline(selectedVideo.s3Key, pipelineDestKey('shorts', history.id));
      navigate('/history');
    } catch (copyError) {
      console.error('shorts copy failed:', copyError);
      await deleteHistory(history.id); // BR-6: 유령 레코드 방지
      setError('영상 복사에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setStarting(false);
    }
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="이미 업로드된 영상을 선택해 쇼츠 생성을 시작합니다. 새 영상은 '영상 업로드' 메뉴에서 올려 주세요."
        >
          쇼츠만들기
        </Header>
      }
    >
      <SpaceBetween size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {step === 'pick' && <VideoPicker onSelect={handleSelect} />}

        {step === 'form' && selectedVideo && (
          <SpaceBetween size="m">
            <Box data-testid="shorts-selected-video">
              선택한 영상: <b>{selectedVideo.title}</b>
            </Box>
            <FormField label="LLM 모델">
              <Select
                selectedOption={effectiveModel}
                onChange={({ detail }) =>
                  setSelectedModel(detail.selectedOption as ModelSelectOption)
                }
                options={options}
                statusType={modelsLoading ? 'loading' : 'finished'}
                loadingText="모델을 불러오는 중…"
                placeholder="Select the LLM model"
              />
            </FormField>
            <FormField label="생성할 쇼츠 개수 (최대 15)">
              <Input
                value={numberOfVideos}
                onChange={({ detail }) => setNumberOfVideos(detail.value)}
                type="number"
                data-testid="shorts-count-input"
              />
            </FormField>
            <FormField label="테마" description="비워 두면 일반(general) 테마로 추출합니다.">
              <Input
                value={theme}
                onChange={({ detail }) => setTheme(detail.value)}
                placeholder="예: technology"
                data-testid="shorts-theme-input"
              />
            </FormField>
            <FormField label="쇼츠 길이 (초)">
              <Input
                value={videoLength}
                onChange={({ detail }) => setVideoLength(detail.value)}
                type="number"
                data-testid="shorts-length-input"
              />
            </FormField>
            <SpaceBetween size="xs" direction="horizontal">
              <Button onClick={() => setStep('pick')} data-testid="shorts-back-button">
                다른 영상 선택
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleStart()}
                loading={starting}
                data-testid="shorts-start-button"
              >
                쇼츠 생성 시작
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default VideoUploadComponent;
