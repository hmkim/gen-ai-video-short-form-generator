import React, { useEffect, useState } from 'react';
import {
  Container, Header, SpaceBetween, Button, Box, Spinner,
  Cards, FormField, Input, Alert,
} from '@cloudscape-design/components';
import { useParams } from 'react-router-dom';
import { getUrl } from 'aws-amplify/storage';
import { readLongVideoEdit } from '../../apis/longVideoEdit';
import { fetchOutputs, LongVideoOutput, uploadToYouTube } from '../../apis/longVideoOutput';

const LongVideoOutputComponent: React.FC = () => {
  const { id } = useParams();
  const [outputs, setOutputs] = useState<LongVideoOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenterNames, setPresenterNames] = useState<Record<number, string>>({});
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeDesc, setYoutubeDesc] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    readLongVideoEdit(id).then((edit) => {
      if (edit) {
        setPresenterNames({
          1: edit.presenter1Name || 'Presenter 1',
          2: edit.presenter2Name || 'Presenter 2',
        });
      }
    });

    fetchOutputs(id).then(async (outputList) => {
      setOutputs(outputList);
      setLoading(false);

      // Load video URLs
      const urls: Record<string, string> = {};
      for (const output of outputList) {
        if (output.s3Location) {
          try {
            const result = await getUrl({ path: output.s3Location });
            urls[output.id] = result.url.toString();
          } catch (e) {
            console.error('Error getting URL for', output.id, e);
          }
        }
      }
      setVideoUrls(urls);
    });
  }, [id]);

  const handleDownload = (outputId: string) => {
    const url = videoUrls[outputId];
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleYouTubeUpload = async (output: LongVideoOutput) => {
    setUploading(output.id);
    try {
      const title = youtubeTitle || output.title || `${presenterNames[output.presenterNumber]} Presentation`;
      await uploadToYouTube(output.id, title, youtubeDesc || output.description || undefined);
    } catch (error) {
      console.error('YouTube upload error:', error);
    }
    setUploading(null);
  };

  if (loading) {
    return <Box textAlign="center"><Spinner size="large" /></Box>;
  }

  if (outputs.length === 0) {
    return (
      <Container header={<Header variant="h2">Long Video Outputs</Header>}>
        <Alert type="info">No outputs generated yet. Go to the editor to generate videos.</Alert>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h2">Long Video Outputs</Header>

      <Cards
        cardDefinition={{
          header: (item) => (
            <Header>{presenterNames[item.presenterNumber] || `Presenter ${item.presenterNumber}`}</Header>
          ),
          sections: [
            {
              id: "video",
              content: (item) => (
                videoUrls[item.id] ? (
                  <video
                    src={videoUrls[item.id]}
                    controls
                    style={{ width: '100%', maxHeight: '300px' }}
                  />
                ) : (
                  <Box textAlign="center" padding="l">
                    <Spinner /> Loading video...
                  </Box>
                )
              ),
            },
            {
              id: "info",
              header: "Details",
              content: (item) => (
                <SpaceBetween size="xs">
                  <div><strong>Title:</strong> {item.title || '-'}</div>
                  <div><strong>YouTube ID:</strong> {item.youtubeVideoId || 'Not uploaded'}</div>
                </SpaceBetween>
              ),
            },
            {
              id: "actions",
              content: (item) => (
                <SpaceBetween size="s">
                  <Button
                    variant="primary"
                    onClick={() => handleDownload(item.id)}
                    disabled={!videoUrls[item.id]}
                    iconName="download"
                  >
                    Download
                  </Button>
                  <SpaceBetween size="xs">
                    <FormField label="YouTube Title">
                      <Input
                        value={youtubeTitle}
                        onChange={({ detail }) => setYoutubeTitle(detail.value)}
                        placeholder={item.title || "Video title"}
                      />
                    </FormField>
                    <FormField label="YouTube Description">
                      <Input
                        value={youtubeDesc}
                        onChange={({ detail }) => setYoutubeDesc(detail.value)}
                        placeholder="Video description"
                      />
                    </FormField>
                    <Button
                      onClick={() => handleYouTubeUpload(item)}
                      loading={uploading === item.id}
                      iconName="upload"
                    >
                      Upload to YouTube
                    </Button>
                  </SpaceBetween>
                </SpaceBetween>
              ),
            },
          ],
        }}
        items={outputs}
        cardsPerRow={[{ cards: 1 }, { minWidth: 600, cards: 2 }]}
      />
    </SpaceBetween>
  );
};

export default LongVideoOutputComponent;
