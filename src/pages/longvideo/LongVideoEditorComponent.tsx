import React, { useEffect, useState, useRef } from 'react';
import {
  Container, Header, SpaceBetween, Button, Box, Spinner,
  FormField, Input, Alert, ColumnLayout, StatusIndicator, Modal,
} from '@cloudscape-design/components';
import { useParams, useNavigate } from 'react-router-dom';
import { getUrl } from 'aws-amplify/storage';
import {
  readLongVideoEdit, updateLongVideoEdit, subscribeLongVideoStage,
  LONG_VIDEO_STAGE,
} from '../../apis/longVideoEdit';
import { fetchSegments, LongVideoSegment } from '../../apis/longVideoSegment';
import { generateLongVideoOutput, fetchOutputs, LongVideoOutput } from '../../apis/longVideoOutput';
import TimelineComponent from './components/TimelineComponent';
import SegmentListComponent from './components/SegmentListComponent';

const LongVideoEditorComponent: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [stage, setStage] = useState(-1);
  const [segments, setSegments] = useState<LongVideoSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<LongVideoSegment | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState(0);
  const [presenter1Name, setPresenter1Name] = useState("Presenter 1");
  const [presenter2Name, setPresenter2Name] = useState("Presenter 2");
  const [generatingPresenter, setGeneratingPresenter] = useState<number | null>(null);

  // Track existing outputs per presenter
  const [existingOutputs, setExistingOutputs] = useState<Record<number, LongVideoOutput | null>>({});
  const [confirmRegenerate, setConfirmRegenerate] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    readLongVideoEdit(id).then((edit) => {
      if (edit) {
        setStage(edit.stage);
        setPresenter1Name(edit.presenter1Name || "Presenter 1");
        setPresenter2Name(edit.presenter2Name || "Presenter 2");
      }
    });

    // Subscribe to stage changes
    const sub = subscribeLongVideoStage(id).subscribe({
      next: (event) => {
        setStage(event.stage);
        // Refresh outputs when stage changes (video generation might have completed)
        loadExistingOutputs(id);
      },
      error: (err) => {
        console.error("Subscription error", err);
      }
    });

    // Load video URL
    getUrl({
      path: `videos/${id}/LONG_RAW.mp4`,
    }).then((result) => {
      setVideoUrl(result.url.toString());
    });

    // Load existing outputs
    loadExistingOutputs(id);

    return () => {
      sub.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadExistingOutputs = async (videoId: string) => {
    const outputs = await fetchOutputs(videoId);
    const outputMap: Record<number, LongVideoOutput | null> = { 1: null, 2: null };
    for (const output of outputs) {
      outputMap[output.presenterNumber] = output;
    }
    setExistingOutputs(outputMap);
  };

  // Load segments when stage >= ANALYZED
  useEffect(() => {
    if (stage >= LONG_VIDEO_STAGE.ANALYZED && id) {
      fetchSegments(id).then(setSegments);
    }
  }, [stage, id]);

  // Calculate total duration from segments
  useEffect(() => {
    if (segments.length > 0) {
      const maxEnd = Math.max(...segments.map(s => s.endTime ?? 0));
      setTotalDuration(maxEnd);
    }
  }, [segments]);

  const handleSegmentClick = (segment: LongVideoSegment) => {
    setSelectedSegment(segment);
    if (videoRef.current && segment.startTime != null) {
      videoRef.current.currentTime = segment.startTime;
    }
  };

  const handleConfirmSegments = async () => {
    if (!id) return;
    await updateLongVideoEdit(id, { stage: LONG_VIDEO_STAGE.USER_CONFIRMED });
    setStage(LONG_VIDEO_STAGE.USER_CONFIRMED);
  };

  const handleGenerateClick = (presenterNumber: number) => {
    if (existingOutputs[presenterNumber]) {
      // Output already exists — ask for confirmation to regenerate
      setConfirmRegenerate(presenterNumber);
    } else {
      doGenerate(presenterNumber);
    }
  };

  const doGenerate = async (presenterNumber: number) => {
    if (!id) return;
    setConfirmRegenerate(null);
    setGeneratingPresenter(presenterNumber);
    try {
      await generateLongVideoOutput(id, presenterNumber);
    } catch (error) {
      console.error("Error generating output:", error);
    }
    setGeneratingPresenter(null);
    // Refresh outputs after a short delay (Step Function takes time)
    setTimeout(() => loadExistingOutputs(id), 3000);
  };

  const handleSavePresenterNames = async () => {
    if (!id) return;
    await updateLongVideoEdit(id, { presenter1Name, presenter2Name });
  };

  const getPresenterName = (num: number) => num === 1 ? presenter1Name : presenter2Name;

  const getIncludedSegmentCount = (presenterNumber: number) => {
    const label = `presenter${presenterNumber}`;
    return segments.filter(s => s.speakerLabel === label && s.includeInOutput).length;
  };

  if (stage === -1) {
    return <Box textAlign="center"><Spinner size="large" /></Box>;
  }

  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">Long Video Editor</Header>}>
        {stage < LONG_VIDEO_STAGE.TRANSCRIBED && (
          <Alert type="info">
            Video is being transcribed with speaker diarization. Please wait...
            <Box margin={{ top: "s" }}><Spinner /></Box>
          </Alert>
        )}

        {stage === LONG_VIDEO_STAGE.TRANSCRIBED && (
          <Alert type="info">
            Transcription complete. AI is analyzing presenter segments...
            <Box margin={{ top: "s" }}><Spinner /></Box>
          </Alert>
        )}

        {stage >= LONG_VIDEO_STAGE.ANALYZED && (
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <FormField label="Presenter 1 Name">
                <Input
                  value={presenter1Name}
                  onChange={({ detail }) => setPresenter1Name(detail.value)}
                  onBlur={handleSavePresenterNames}
                />
              </FormField>
              <FormField label="Presenter 2 Name">
                <Input
                  value={presenter2Name}
                  onChange={({ detail }) => setPresenter2Name(detail.value)}
                  onBlur={handleSavePresenterNames}
                />
              </FormField>
            </ColumnLayout>
          </SpaceBetween>
        )}
      </Container>

      {videoUrl && (
        <Container header={<Header variant="h3">Video Preview</Header>}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: '100%', maxHeight: '400px' }}
          />
        </Container>
      )}

      {stage >= LONG_VIDEO_STAGE.ANALYZED && segments.length > 0 && (
        <>
          <Container header={<Header variant="h3">Timeline</Header>}>
            <TimelineComponent
              segments={segments}
              totalDuration={totalDuration}
              onSegmentClick={handleSegmentClick}
              selectedSegmentId={selectedSegment?.id}
            />
          </Container>

          <Container>
            <SegmentListComponent
              segments={segments}
              onSegmentsChange={setSegments}
              onSegmentSelect={handleSegmentClick}
              selectedSegmentId={selectedSegment?.id}
            />
          </Container>

          <Container>
            <SpaceBetween size="m">
              {stage === LONG_VIDEO_STAGE.ANALYZED && (
                <Button variant="primary" onClick={handleConfirmSegments}>
                  Confirm Segments
                </Button>
              )}

              {stage >= LONG_VIDEO_STAGE.USER_CONFIRMED && (
                <ColumnLayout columns={2}>
                  {[1, 2].map((presenterNum) => {
                    const output = existingOutputs[presenterNum];
                    const isGenerating = generatingPresenter === presenterNum;
                    const segCount = getIncludedSegmentCount(presenterNum);
                    const name = getPresenterName(presenterNum);

                    return (
                      <Container key={presenterNum} variant="stacked">
                        <SpaceBetween size="s">
                          <Box variant="h4">{name}</Box>
                          <Box variant="small" color="text-body-secondary">
                            {segCount} segment{segCount !== 1 ? 's' : ''} included
                          </Box>

                          {output ? (
                            <StatusIndicator type="success">Video generated</StatusIndicator>
                          ) : stage >= LONG_VIDEO_STAGE.PROCESSING && presenterNum === generatingPresenter ? (
                            <StatusIndicator type="in-progress">Generating...</StatusIndicator>
                          ) : null}

                          <SpaceBetween size="xs" direction="horizontal">
                            <Button
                              variant={output ? "normal" : "primary"}
                              onClick={() => handleGenerateClick(presenterNum)}
                              loading={isGenerating}
                              disabled={segCount === 0 || (generatingPresenter !== null && !isGenerating)}
                            >
                              {output ? `Regenerate` : `Generate Video`}
                            </Button>

                            {output && (
                              <Button
                                variant="primary"
                                onClick={() => navigate(`/longvideo/output/${id}?presenter=${presenterNum}`)}
                              >
                                View Output
                              </Button>
                            )}
                          </SpaceBetween>
                        </SpaceBetween>
                      </Container>
                    );
                  })}
                </ColumnLayout>
              )}

              {(existingOutputs[1] || existingOutputs[2]) && (
                <Box float="right">
                  <Button
                    variant="primary"
                    iconName="external"
                    onClick={() => navigate(`/longvideo/output/${id}`)}
                  >
                    View All Outputs
                  </Button>
                </Box>
              )}
            </SpaceBetween>
          </Container>
        </>
      )}

      {/* Regeneration confirmation modal */}
      <Modal
        visible={confirmRegenerate !== null}
        onDismiss={() => setConfirmRegenerate(null)}
        header="Regenerate Video?"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setConfirmRegenerate(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => doGenerate(confirmRegenerate!)}>
                Regenerate
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          A video for <strong>{confirmRegenerate ? getPresenterName(confirmRegenerate) : ''}</strong> already exists.
          Regenerating will create a new video based on the current segment selections.
          The previous video will remain available until the new one is ready.
        </Box>
      </Modal>
    </SpaceBetween>
  );
};

export default LongVideoEditorComponent;
