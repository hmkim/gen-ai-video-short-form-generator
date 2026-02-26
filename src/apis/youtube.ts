import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>({ authMode: 'userPool' });

export const exchangeYouTubeToken = async (
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) => {
  return await client.queries.exchangeYouTubeToken({
    code,
    redirectUri,
    clientId,
    clientSecret,
  });
};

export const checkYouTubeConnection = async () => {
  return await client.queries.checkYouTubeConnection({});
};
