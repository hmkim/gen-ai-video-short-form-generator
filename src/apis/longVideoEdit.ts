import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});

export type LongVideoEdit = Schema["LongVideoEdit"]["type"];

export const enum LONG_VIDEO_STAGE {
  UPLOADED = 0,
  TRANSCRIBED = 1,
  ANALYZED = 2,
  USER_CONFIRMED = 3,
  PROCESSING = 4,
  COMPLETE = 5
}

export const longVideoStageToString = [
  "Uploaded",
  "Transcribed",
  "Analyzed",
  "User Confirmed",
  "Processing",
  "Complete"
];

export const fetchLongVideoEdits = async () => {
  const { data: edits } = await client.models.LongVideoEdit.list();
  return edits;
};

export const createLongVideoEdit = async (
  videoName: string,
  modelID: string,
  presenter1Name: string = "Presenter 1",
  presenter2Name: string = "Presenter 2"
) => {
  const { data: newEdit } = await client.models.LongVideoEdit.create({
    videoName,
    modelID,
    stage: 0,
    presenter1Name,
    presenter2Name,
  });
  return newEdit;
};

export const updateLongVideoEdit = async (
  id: string,
  updates: {
    stage?: number;
    presenter1Name?: string;
    presenter2Name?: string;
  }
) => {
  const { data: updated } = await client.models.LongVideoEdit.update({ id, ...updates });
  return updated;
};

export const readLongVideoEdit = async (id: string) => {
  const { data: edit } = await client.models.LongVideoEdit.get({ id });
  return edit;
};

export const deleteLongVideoEdit = async (id: string) => {
  const { data: edit } = await client.models.LongVideoEdit.delete({ id });
  return edit;
};

export const subscribeLongVideoEdit = async (id: string) => {
  return client.models.LongVideoEdit.observeQuery({
    filter: {
      id: { eq: id }
    }
  });
};

export const subscribeLongVideoStage = (id: string) => {
  return client.subscriptions.receiveLongVideo({ videoId: id });
};
