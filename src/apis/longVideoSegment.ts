import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});

export type LongVideoSegment = Schema["LongVideoSegment"]["type"];

export const fetchSegments = async (longVideoEditId: string) => {
  const { data: segments } = await client.models.LongVideoSegment.list({
    filter: {
      longVideoEditId: { eq: longVideoEditId }
    },
    limit: 1000,
  });

  segments.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return segments;
};

export const updateSegment = async (
  id: string,
  updates: {
    speakerLabel?: string;
    segmentType?: string;
    includeInOutput?: boolean;
    startTime?: number;
    endTime?: number;
  }
) => {
  const { data: updated } = await client.models.LongVideoSegment.update({ id, ...updates });
  return updated;
};

export const deleteSegment = async (id: string) => {
  const { data: segment } = await client.models.LongVideoSegment.delete({ id });
  return segment;
};
