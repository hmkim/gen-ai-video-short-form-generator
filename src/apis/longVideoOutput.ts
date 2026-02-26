import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});

export type LongVideoOutput = Schema["LongVideoOutput"]["type"];

export const fetchOutputs = async (longVideoEditId: string) => {
  const { data: outputs } = await client.models.LongVideoOutput.list({
    filter: {
      longVideoEditId: { eq: longVideoEditId }
    }
  });
  return outputs;
};

export const readOutput = async (id: string) => {
  const { data: output } = await client.models.LongVideoOutput.get({ id });
  return output;
};

export const generateLongVideoOutput = async (
  videoId: string,
  presenterNumber: number,
  title?: string,
  description?: string
) => {
  return await client.queries.generateLongVideoOutput({
    videoId,
    presenterNumber,
    title,
    description,
  });
};

export const uploadToYouTube = async (
  outputId: string,
  title: string,
  description?: string,
  tags?: string,
  playlistName?: string
) => {
  return await client.queries.uploadToYouTube({
    outputId,
    title,
    description,
    tags,
    playlistName,
  });
};

export const updateOutput = async (
  id: string,
  fields: { title?: string; description?: string; tags?: string }
) => {
  const { data: output } = await client.models.LongVideoOutput.update({
    id,
    ...fields,
  });
  return output;
};

export const suggestVideoMetadata = async (
  videoId: string,
  presenterNumber: number
) => {
  return await client.queries.suggestVideoMetadata({
    videoId,
    presenterNumber,
  });
};
