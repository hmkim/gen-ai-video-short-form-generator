// VideoUploadComponent.tsx

import React, { useEffect, useState } from 'react';
import { Container, Header, Tiles, Select, Alert, FormField, Input } from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { useNavigate } from 'react-router-dom';
import { createHistory } from '../apis/history';
import { useApprovedModels, type ModelSelectOption } from '../data/useApprovedModels';

const VideoUploadComponent: React.FC = () => {

  // U3 (F3): approved models from the dynamic catalog (static fallback inside the hook).
  const { options, defaultOption, loading: modelsLoading } = useApprovedModels();

  const [tileValue, setTileValue] = useState("upload");
  const [uuid, setUuid] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelSelectOption | null>(null);
  const effectiveModel = selectedModel ?? defaultOption;
  const [numberOfVideos, setNumberOfVideos] = useState("1");
  const [theme, setTheme] = useState("");
  const [videoLength, setVideoLength] = useState("60");
  const navigate = useNavigate();

  useEffect(() => {
  }, [uuid])


  const processFile = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(
      key, 
      effectiveModel.value,
      parseInt(numberOfVideos),
      theme || "general",
      parseInt(videoLength)
    );
  
    return { file, key: `${history!.id}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  const processFileForSubtitle = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(
      key, 
      effectiveModel.value,
      parseInt(numberOfVideos),
      theme || "general",
      parseInt(videoLength)
    );
  
    return { file, key: `${history?.id}/Transcript.json`, useAccelerateEndpoint:true};
  };

  const processFileForVideo = async ({file}: {file:File, key:string}) => {
      
    return { file, key: `${uuid}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  return (
    <Container
      header={
        <Header variant="h2">
          Upload Video
        </Header>
      }
    >
      <Tiles
        onChange={({ detail }) => setTileValue(detail.value)}
        value={tileValue}
        items={[
          { label: "Direct Upload", value: "upload" },
          { label: "Upload with Subtitle", value: "subtitle" },
        ]}
      />
      <h3>Select LLM</h3>
      <Select
        selectedOption={effectiveModel}
        onChange={({ detail }) =>
          setSelectedModel(detail.selectedOption as ModelSelectOption)
        }
        options={options}
        statusType={modelsLoading ? "loading" : "finished"}
        loadingText="모델을 불러오는 중…"
        placeholder="Select the LLM model"
      />
      <br />
      <FormField label="Number of Videos">
        <Input
          type="number"
          value={numberOfVideos}
          onChange={({ detail }) => setNumberOfVideos(detail.value)}
          placeholder="Enter number of videos to create"
        />
      </FormField>
      <FormField label="Theme Focus">
        <Input
          value={theme}
          onChange={({ detail }) => setTheme(detail.value)}
          placeholder="Enter theme to focus on (e.g., technical, entertainment)"
        />
      </FormField>
      <FormField label="Video Length (seconds)">
        <Input
          type="number"
          value={videoLength}
          onChange={({ detail }) => setVideoLength(detail.value)}
          placeholder="Enter length for each video in seconds"
        />
      </FormField>
      <br />
      {tileValue === "upload" && (
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFile}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />
      )}
      {tileValue === "subtitle" && (
        <>
        <h3>Upload Subtitle</h3>
        <StorageManager
          acceptedFileTypes={['.json']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForSubtitle}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            setUuid(uuid)
          }}
        />
        <h3>Upload Video</h3>
        {uuid === "" ?     
        <Alert
          statusIconAriaLabel="Info"
        >
          You can upload video after uploading subtitle.
        </Alert> :
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForVideo}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />}
        </>
      )}
    </Container>
  );
};

export default VideoUploadComponent;