import { Box, SpaceBetween, TextFilter, Header, Table, Button, Link, Modal } from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { fetchLongVideoEdits, LongVideoEdit, longVideoStageToString, deleteLongVideoEdit } from '../../apis/longVideoEdit';
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
            id: "presenter1",
            header: "Presenter 1",
            cell: item => item.presenter1Name || "Presenter 1",
          },
          {
            id: "presenter2",
            header: "Presenter 2",
            cell: item => item.presenter2Name || "Presenter 2",
          },
          {
            id: "stage",
            header: "Status",
            cell: item => longVideoStageToString[item.stage] || "Unknown"
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
          { id: "presenter1", visible: true },
          { id: "presenter2", visible: true },
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
