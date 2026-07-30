// LongVideoUploadComponent.tsx — SpeakerEditCreatePage
//
// upload-library (US-5, US-6): `/longvideo` = 화자별 편집. 2단계 흐름:
// 'pick' — VideoPicker 선택 → 'form' — 발표자 메타데이터 입력 후
// 새 LongVideoEdit 생성 + S3 복사(W3)로 화자별 파이프라인을 트리거한다.

import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormField,
  Header,
  Input,
  RadioGroup,
  Select,
  SpaceBetween,
} from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import { createLongVideoEdit, deleteLongVideoEdit } from '../../apis/longVideoEdit';
import { copyToPipeline } from '../../apis/video';
import { useApprovedModels, type ModelSelectOption } from '../../data/useApprovedModels';
import {
  pipelineDestKey,
  validateCopySize,
  type SelectableVideo,
} from '../../data/videoLibrary';
import VideoPicker from '../VideoPicker';

const LongVideoUploadComponent: React.FC = () => {
  const navigate = useNavigate();
  const { options, defaultOption, loading: modelsLoading } = useApprovedModels();

  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [selectedVideo, setSelectedVideo] = useState<SelectableVideo | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelSelectOption | null>(null);
  const effectiveModel = selectedModel ?? defaultOption;
  const [presenterCount, setPresenterCount] = useState(2);
  const [presenter1Name, setPresenter1Name] = useState('Presenter 1');
  const [presenter2Name, setPresenter2Name] = useState('Presenter 2');
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
    const edit = await createLongVideoEdit(
      selectedVideo.s3Key,
      effectiveModel.value,
      presenterCount,
      presenter1Name,
      presenterCount >= 2 ? presenter2Name : undefined,
    );
    if (!edit) {
      setError('처리 레코드 생성에 실패했습니다. 다시 시도해 주세요.');
      setStarting(false);
      return;
    }
    try {
      await copyToPipeline(selectedVideo.s3Key, pipelineDestKey('speaker', edit.id));
      navigate('/longvideo/history');
    } catch (copyError) {
      console.error('speaker copy failed:', copyError);
      await deleteLongVideoEdit(edit.id); // BR-6: 유령 레코드 방지
      setError('영상 복사에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setStarting(false);
    }
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="이미 업로드된 영상을 선택해 화자별 편집을 시작합니다. 새 영상은 '영상 업로드' 메뉴에서 올려 주세요."
        >
          화자별 편집
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
            <Box data-testid="speaker-selected-video">
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
            <FormField label="발표자 수">
              <RadioGroup
                value={String(presenterCount)}
                onChange={({ detail }) => setPresenterCount(parseInt(detail.value))}
                items={[
                  { value: '1', label: '1명' },
                  { value: '2', label: '2명' },
                ]}
                data-testid="speaker-count-radio"
              />
            </FormField>
            <FormField label="발표자 1 이름">
              <Input
                value={presenter1Name}
                onChange={({ detail }) => setPresenter1Name(detail.value)}
                data-testid="speaker-name1-input"
              />
            </FormField>
            {presenterCount >= 2 && (
              <FormField label="발표자 2 이름">
                <Input
                  value={presenter2Name}
                  onChange={({ detail }) => setPresenter2Name(detail.value)}
                  data-testid="speaker-name2-input"
                />
              </FormField>
            )}
            <SpaceBetween size="xs" direction="horizontal">
              <Button onClick={() => setStep('pick')} data-testid="speaker-back-button">
                다른 영상 선택
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleStart()}
                loading={starting}
                data-testid="speaker-start-button"
              >
                화자별 편집 시작
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default LongVideoUploadComponent;
