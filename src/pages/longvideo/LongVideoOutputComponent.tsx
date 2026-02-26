import React, { useEffect, useState, useCallback } from 'react';
import {
  Container, Header, SpaceBetween, Button, Box, Spinner,
  FormField, Input, Textarea, Alert, ColumnLayout, TokenGroup,
  StatusIndicator, ExpandableSection, Flashbar,
} from '@cloudscape-design/components';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getUrl } from 'aws-amplify/storage';
import { readLongVideoEdit } from '../../apis/longVideoEdit';
import {
  fetchOutputs, LongVideoOutput, uploadToYouTube, suggestVideoMetadata,
  updateOutput,
} from '../../apis/longVideoOutput';

interface OutputMetadata {
  title: string;
  description: string;
  tags: string[];
  playlistName: string;
  dirty: boolean; // true if user changed something since last save
}

const LongVideoOutputComponent: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presenterFilter = searchParams.get('presenter');

  const [outputs, setOutputs] = useState<LongVideoOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [presenterNames, setPresenterNames] = useState<Record<number, string>>({});
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});

  const [metadata, setMetadata] = useState<Record<string, OutputMetadata>>({});
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [newTag, setNewTag] = useState<Record<string, string>>({});
  const [flashMessages, setFlashMessages] = useState<Array<{ id: string; type: "success" | "error"; content: string }>>([]);

  const showFlash = useCallback((type: "success" | "error", content: string) => {
    const msgId = Date.now().toString();
    setFlashMessages(prev => [...prev, { id: msgId, type, content }]);
    setTimeout(() => setFlashMessages(prev => prev.filter(m => m.id !== msgId)), 3000);
  }, []);

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
      // Filter by presenter if query param is set
      const filtered = presenterFilter
        ? outputList.filter(o => o.presenterNumber === parseInt(presenterFilter))
        : outputList;

      setOutputs(filtered);
      setLoading(false);

      // Initialize metadata from existing DB records
      const initialMeta: Record<string, OutputMetadata> = {};
      for (const output of filtered) {
        initialMeta[output.id] = {
          title: output.title || '',
          description: output.description || '',
          tags: output.tags ? JSON.parse(output.tags) : [],
          playlistName: '',
          dirty: false,
        };
      }
      setMetadata(initialMeta);

      // Load video URLs
      const urls: Record<string, string> = {};
      for (const output of filtered) {
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

      // Auto-suggest ONLY for outputs that have no title saved in DB
      for (const output of filtered) {
        if (!output.title) {
          handleSuggestAndSave(output, id);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, presenterFilter]);

  const handleSuggestAndSave = async (output: LongVideoOutput, videoId: string) => {
    setSuggesting(prev => ({ ...prev, [output.id]: true }));
    try {
      const result = await suggestVideoMetadata(videoId, output.presenterNumber);
      if (result.data) {
        const suggested = JSON.parse(result.data);
        const newMeta: OutputMetadata = {
          title: suggested.title || '',
          description: suggested.description || '',
          tags: suggested.tags || [],
          playlistName: suggested.playlistName || '',
          dirty: false,
        };
        setMetadata(prev => ({ ...prev, [output.id]: newMeta }));

        // Save to DDB immediately so it persists
        await updateOutput(output.id, {
          title: newMeta.title,
          description: newMeta.description,
          tags: JSON.stringify(newMeta.tags),
        });
      }
    } catch (error) {
      console.error('Suggest error:', error);
    }
    setSuggesting(prev => ({ ...prev, [output.id]: false }));
  };

  const updateMeta = (outputId: string, field: keyof Omit<OutputMetadata, 'dirty'>, value: string | string[]) => {
    setMetadata(prev => ({
      ...prev,
      [outputId]: { ...prev[outputId], [field]: value, dirty: true },
    }));
  };

  const handleSave = async (outputId: string) => {
    const meta = metadata[outputId];
    if (!meta) return;

    setSaving(prev => ({ ...prev, [outputId]: true }));
    try {
      await updateOutput(outputId, {
        title: meta.title,
        description: meta.description,
        tags: JSON.stringify(meta.tags),
      });
      setMetadata(prev => ({ ...prev, [outputId]: { ...prev[outputId], dirty: false } }));
      showFlash('success', 'Metadata saved');
    } catch (error) {
      console.error('Save error:', error);
      showFlash('error', 'Failed to save metadata');
    }
    setSaving(prev => ({ ...prev, [outputId]: false }));
  };

  const handleAddTag = (outputId: string) => {
    const tag = (newTag[outputId] || '').trim();
    if (!tag) return;
    const current = metadata[outputId]?.tags || [];
    if (!current.includes(tag)) {
      updateMeta(outputId, 'tags', [...current, tag]);
    }
    setNewTag(prev => ({ ...prev, [outputId]: '' }));
  };

  const handleRemoveTag = (outputId: string, index: number) => {
    const current = metadata[outputId]?.tags || [];
    updateMeta(outputId, 'tags', current.filter((_, i) => i !== index));
  };

  const handleDownload = (outputId: string) => {
    const url = videoUrls[outputId];
    if (url) window.open(url, '_blank');
  };

  const handleYouTubeUpload = async (output: LongVideoOutput) => {
    const meta = metadata[output.id];
    if (!meta?.title) {
      setUploadStatus(prev => ({ ...prev, [output.id]: 'error:Title is required' }));
      return;
    }

    // Save first if dirty
    if (meta.dirty) await handleSave(output.id);

    setUploading(output.id);
    setUploadStatus(prev => ({ ...prev, [output.id]: 'uploading' }));

    try {
      await uploadToYouTube(
        output.id,
        meta.title,
        meta.description || undefined,
        meta.tags.length > 0 ? JSON.stringify(meta.tags) : undefined,
        meta.playlistName || undefined
      );
      setUploadStatus(prev => ({ ...prev, [output.id]: 'success' }));
      showFlash('success', 'YouTube upload started. Check progress in YouTube Uploads page.');
    } catch (error) {
      console.error('YouTube upload error:', error);
      setUploadStatus(prev => ({ ...prev, [output.id]: 'error:Upload failed' }));
    }
    setUploading(null);
  };

  if (loading) {
    return <Box textAlign="center" padding="xxl"><Spinner size="large" /></Box>;
  }

  if (outputs.length === 0) {
    return (
      <Container header={<Header variant="h2">Long Video Outputs</Header>}>
        <Alert type="info">
          No outputs generated yet.{' '}
          <Button variant="link" onClick={() => navigate(`/longvideo/edit/${id}`)}>
            Go to the editor
          </Button>{' '}
          to generate videos.
        </Alert>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <Flashbar
        items={flashMessages.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          dismissible: true,
          onDismiss: () => setFlashMessages(prev => prev.filter(p => p.id !== m.id)),
        }))}
      />

      <Header
        variant="h1"
        actions={
          presenterFilter ? (
            <Button onClick={() => navigate(`/longvideo/output/${id}`)}>
              Show All Presenters
            </Button>
          ) : undefined
        }
      >
        Video Outputs
        {presenterFilter ? ` - ${presenterNames[parseInt(presenterFilter)] || `Presenter ${presenterFilter}`}` : ''}
      </Header>

      {outputs
        .sort((a, b) => a.presenterNumber - b.presenterNumber)
        .map((output) => {
          const meta = metadata[output.id] || { title: '', description: '', tags: [], playlistName: '', dirty: false };
          const isSuggesting = suggesting[output.id] || false;
          const isSaving = saving[output.id] || false;
          const status = uploadStatus[output.id] || '';

          return (
            <Container
              key={output.id}
              header={
                <Header
                  variant="h2"
                  actions={
                    <SpaceBetween size="xs" direction="horizontal">
                      <Button
                        iconName="download"
                        onClick={() => handleDownload(output.id)}
                        disabled={!videoUrls[output.id]}
                      >
                        Download
                      </Button>
                      <Button
                        iconName="refresh"
                        onClick={() => handleSuggestAndSave(output, id!)}
                        loading={isSuggesting}
                      >
                        AI Suggest
                      </Button>
                    </SpaceBetween>
                  }
                >
                  {presenterNames[output.presenterNumber] || `Presenter ${output.presenterNumber}`}
                </Header>
              }
            >
              <SpaceBetween size="l">
                {videoUrls[output.id] ? (
                  <video
                    src={videoUrls[output.id]}
                    controls
                    style={{ width: '100%', maxHeight: '360px', borderRadius: '8px' }}
                  />
                ) : (
                  <Box textAlign="center" padding="l">
                    <Spinner /> Loading video...
                  </Box>
                )}

                {output.youtubeVideoId && (
                  <Alert type="success">
                    Already uploaded to YouTube: <strong>{output.youtubeVideoId}</strong>
                  </Alert>
                )}

                <ExpandableSection
                  headerText="YouTube Upload Details"
                  defaultExpanded={!output.youtubeVideoId}
                >
                  <SpaceBetween size="m">
                    {isSuggesting && (
                      <Alert type="info">
                        <Spinner size="normal" /> AI is generating metadata suggestions...
                      </Alert>
                    )}

                    <FormField
                      label="Title"
                      description="Required. A compelling, SEO-friendly title (max 100 chars)"
                      constraintText={`${meta.title.length}/100 characters`}
                      errorText={status.startsWith('error:Title') ? 'Title is required' : undefined}
                    >
                      <Input
                        value={meta.title}
                        onChange={({ detail }) => updateMeta(output.id, 'title', detail.value)}
                        placeholder="Enter video title"
                      />
                    </FormField>

                    <FormField
                      label="Description"
                      description="A YouTube description summarizing the presentation"
                    >
                      <Textarea
                        value={meta.description}
                        onChange={({ detail }) => updateMeta(output.id, 'description', detail.value)}
                        placeholder="Enter video description"
                        rows={4}
                      />
                    </FormField>

                    <FormField label="Tags" description="Tags help viewers find your video">
                      <SpaceBetween size="xs">
                        <TokenGroup
                          items={meta.tags.map((tag) => ({ label: tag, dismissLabel: `Remove ${tag}` }))}
                          onDismiss={({ detail }) => handleRemoveTag(output.id, detail.itemIndex)}
                        />
                        <ColumnLayout columns={2}>
                          <Input
                            value={newTag[output.id] || ''}
                            onChange={({ detail }) => setNewTag(prev => ({ ...prev, [output.id]: detail.value }))}
                            placeholder="Add a tag"
                            onKeyDown={({ detail }) => {
                              if (detail.key === 'Enter') handleAddTag(output.id);
                            }}
                          />
                          <Button onClick={() => handleAddTag(output.id)} iconName="add-plus">
                            Add Tag
                          </Button>
                        </ColumnLayout>
                      </SpaceBetween>
                    </FormField>

                    <FormField
                      label="Playlist"
                      description="Videos will be added to this playlist (created if it doesn't exist)"
                    >
                      <Input
                        value={meta.playlistName}
                        onChange={({ detail }) => updateMeta(output.id, 'playlistName', detail.value)}
                        placeholder="Enter playlist name"
                      />
                    </FormField>

                    {status === 'success' && (
                      <StatusIndicator type="success">Upload started successfully</StatusIndicator>
                    )}
                    {status.startsWith('error:') && status !== 'error:Title is required' && (
                      <StatusIndicator type="error">{status.replace('error:', '')}</StatusIndicator>
                    )}

                    <SpaceBetween size="xs" direction="horizontal">
                      <Button
                        onClick={() => handleSave(output.id)}
                        loading={isSaving}
                        disabled={!meta.dirty}
                      >
                        {meta.dirty ? 'Save Changes' : 'Saved'}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleYouTubeUpload(output)}
                        loading={uploading === output.id}
                        iconName="upload"
                        disabled={!meta.title}
                      >
                        Upload to YouTube
                      </Button>
                    </SpaceBetween>
                  </SpaceBetween>
                </ExpandableSection>
              </SpaceBetween>
            </Container>
          );
        })}

      <Box>
        <Button variant="link" onClick={() => navigate(`/longvideo/edit/${id}`)}>
          Back to Editor
        </Button>
      </Box>
    </SpaceBetween>
  );
};

export default LongVideoOutputComponent;
