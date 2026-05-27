import React, { useState } from 'react';
import { Container, Header, Select, FormField, Input, RadioGroup } from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { useNavigate } from 'react-router-dom';
import { createLongVideoEdit } from '../../apis/longVideoEdit';
import { modelOptions } from '../../data/modelList';

const LongVideoUploadComponent: React.FC = () => {
  const options = modelOptions.map(model => ({
    label: model.name,
    value: model.modelId,
  }));

  const [selectedModel, setSelectedModel] = useState({
    label: "Claude Opus 4.7",
    value: "us.anthropic.claude-opus-4-7",
  });
  const [presenterCount, setPresenterCount] = useState(2);
  const [presenter1Name, setPresenter1Name] = useState("Presenter 1");
  const [presenter2Name, setPresenter2Name] = useState("Presenter 2");
  const navigate = useNavigate();

  const processFile = async ({ file, key }: { file: File; key: string }) => {
    const edit = await createLongVideoEdit(
      key,
      selectedModel.value,
      presenterCount,
      presenter1Name,
      presenterCount >= 2 ? presenter2Name : undefined,
    );

    return { file, key: `${edit!.id}/LONG_RAW.mp4`, useAccelerateEndpoint: true };
  };

  return (
    <Container
      header={
        <Header variant="h2">
          Upload Long Video for YouTube
        </Header>
      }
    >
      <h3>Select LLM</h3>
      <Select
        selectedOption={selectedModel}
        onChange={({ detail }) =>
          setSelectedModel(detail.selectedOption as { label: string; value: string })
        }
        options={options}
        placeholder="Select the LLM model"
      />
      <br />
      <FormField label="Number of Presenters">
        <RadioGroup
          value={String(presenterCount)}
          onChange={({ detail }) => setPresenterCount(Number(detail.value))}
          items={[
            { value: "1", label: "1 Presenter" },
            { value: "2", label: "2 Presenters" },
          ]}
        />
      </FormField>
      <FormField label="Presenter 1 Name">
        <Input
          value={presenter1Name}
          onChange={({ detail }) => setPresenter1Name(detail.value)}
          placeholder="Enter presenter 1 name"
        />
      </FormField>
      {presenterCount >= 2 && (
        <FormField label="Presenter 2 Name">
          <Input
            value={presenter2Name}
            onChange={({ detail }) => setPresenter2Name(detail.value)}
            placeholder="Enter presenter 2 name"
          />
        </FormField>
      )}
      <br />
      <StorageManager
        acceptedFileTypes={['video/*']}
        path={`videos/`}
        maxFileCount={1}
        isResumable
        autoUpload={false}
        processFile={processFile}
        onUploadSuccess={({ key }) => {
          const uuid = key!.split('/')[1];
          navigate(`/longvideo/edit/${uuid}`);
        }}
      />
    </Container>
  );
};

export default LongVideoUploadComponent;
