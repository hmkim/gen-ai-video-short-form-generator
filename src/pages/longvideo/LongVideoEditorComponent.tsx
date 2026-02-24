import React, { useEffect, useState, useRef } from 'react';
import {
  Container, Header, SpaceBetween, Button, Box, Spinner,
  FormField, Input, Alert, ColumnLayout,
} from '@cloudscape-design/components';
import { useParams, useNavigate } from 'react-router-dom';
import { getUrl } from 'aws-amplify/storage';
import {
  readLongVideoEdit, updateLongVideoEdit, subscribeLongVideoStage,
  LONG_VIDEO_STAGE,
} from '../../apis/longVideoEdit';
import { fetchSegments, LongVideoSegment } from '../../apis/longVideoSegment';
import { generateLongVideoOutput } from '../../apis/longVideoOutput';
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
  const [processing, setProcessing] = useState(false);

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

    return () => {
      sub.unsubscribe();
    };
  }, [id]);

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

  const handleGenerateOutput = async (presenterNumber: number) => {
    if (!id) return;
    setProcessing(true);
    try {
      await generateLongVideoOutput(id, presenterNumber);
    } catch (error) {
      console.error("Error generating output:", error);
    }
    setProcessing(false);
  };

  const handleSavePresenterNames = async () => {
    if (!id) return;
    await updateLongVideoEdit(id, { presenter1Name, presenter2Name });
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
            <SpaceBetween size="m" direction="horizontal">
              {stage === LONG_VIDEO_STAGE.ANALYZED && (
                <Button variant="primary" onClick={handleConfirmSegments}>
                  Confirm Segments
                </Button>
              )}

              {stage >= LONG_VIDEO_STAGE.USER_CONFIRMED && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => handleGenerateOutput(1)}
                    loading={processing}
                  >
                    Generate {presenter1Name} Video
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleGenerateOutput(2)}
                    loading={processing}
                  >
                    Generate {presenter2Name} Video
                  </Button>
                </>
              )}

              {stage >= LONG_VIDEO_STAGE.COMPLETE && (
                <Button onClick={() => navigate(`/longvideo/output/${id}`)}>
                  View Outputs
                </Button>
              )}
            </SpaceBetween>
          </Container>
        </>
      )}
    </SpaceBetween>
  );
};

export default LongVideoEditorComponent;
