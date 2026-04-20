import { Box, SpaceBetween, TextFilter, Header, Table, Button, Link, Modal, StatusIndicator } from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { fetchLongVideoEdits, LongVideoEdit, deleteLongVideoEdit, LONG_VIDEO_STAGE } from '../../apis/longVideoEdit';
import { modelOptions } from '../../data/modelList';

const LongVideoHistoryComponent: React.FC = () => {
  const [edits, setEdits] = useState<LongVideoEdit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [visible, setVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<LongVideoEdit | null>(null);

  const getModelName = (modelId: string): string => {
    const model = modelOptions.find(model => model.modelId === modelId);
    return model ? model.name : modelId;
  };

  const handleDelete = (item: LongVideoEdit) => {
    setItemToDelete(item);
    setVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      try {
        await deleteLongVideoEdit(itemToDelete.id);
        setEdits(edits.filter(e => e.id !== itemToDelete.id));
      } catch (error) {
        console.error('Failed to delete:', error);
      }
    }
    setVisible(false);
    setItemToDelete(null);
  };

  const handleCancelDelete = () => {
    setVisible(false);
    setItemToDelete(null);
  };

  useEffect(() => {
    fetchLongVideoEdits()
      .then(edits => {
        edits.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
        setEdits(edits);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Table
        columnDefinitions={[
          {
            id: "videoName",
            header: "Video Name",
            cell: item => <Link href={`/longvideo/edit/${item.id}`} key={item.id}>{item.videoName}</Link>,
            isRowHeader: true
          },
          {
            id: "modelId",
            header: "Model",
            cell: item => getModelName(item.modelID),
          },
          {
            id: "presenters",
            header: "Presenters",
            cell: item => {
              const count = item.presenterCount ?? 2;
              if (count === 1) {
                return item.presenter1Name || "Presenter 1";
              }
              return `${item.presenter1Name || "Presenter 1"}, ${item.presenter2Name || "Presenter 2"}`;
            },
          },
          {
            id: "stage",
            header: "Status",
            cell: item => {
              switch (item.stage) {
                case LONG_VIDEO_STAGE.UPLOADED:
                  return <StatusIndicator type="in-progress">Transcribing...</StatusIndicator>;
                case LONG_VIDEO_STAGE.TRANSCRIBED:
                  return <StatusIndicator type="in-progress">Analyzing...</StatusIndicator>;
                case LONG_VIDEO_STAGE.ANALYZED:
                  return <StatusIndicator type="info">Analyzed</StatusIndicator>;
                case LONG_VIDEO_STAGE.USER_CONFIRMED:
                  return <StatusIndicator type="info">Confirmed</StatusIndicator>;
                case LONG_VIDEO_STAGE.PROCESSING:
                  return <StatusIndicator type="in-progress">Generating...</StatusIndicator>;
                case LONG_VIDEO_STAGE.COMPLETE:
                  return <StatusIndicator type="success">Complete</StatusIndicator>;
                default:
                  return <StatusIndicator type="stopped">Unknown</StatusIndicator>;
              }
            }
          },
          {
            id: "createdAt",
            header: "Created At",
            cell: item => new Date(item.createdAt).toLocaleString(),
          },
          {
            id: "delete",
            header: "Delete",
            cell: item => (
              <Button
                iconName="remove"
                variant="icon"
                onClick={() => handleDelete(item)}
              />
            )
          }
        ]}
        columnDisplay={[
          { id: "videoName", visible: true },
          { id: "modelId", visible: true },
          { id: "presenters", visible: true },
          { id: "stage", visible: true },
          { id: "createdAt", visible: true },
          { id: "delete", visible: true },
        ]}
        enableKeyboardNavigation
        items={edits}
        loading={loading}
        loadingText="Loading resources"
        empty={
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <SpaceBetween size="m">
              <b>No Long Video History</b>
            </SpaceBetween>
          </Box>
        }
        filter={
          <TextFilter filteringPlaceholder="Find history" filteringText="" />
        }
        header={
          <Header>
            Long Video History
          </Header>
        }
      />
      <Modal
        onDismiss={handleCancelDelete}
        visible={visible}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleCancelDelete}>Cancel</Button>
              <Button variant="primary" onClick={handleConfirmDelete}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
        header="Confirm Delete"
      >
        {itemToDelete && (
          <Box>
            Are you sure you want to delete <br />
            <b>{itemToDelete.videoName}</b>? <br />
            This action cannot be undone.
          </Box>
        )}
      </Modal>
    </>
  );
};

export default LongVideoHistoryComponent;
