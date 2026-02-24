import React, { useState } from 'react';
import {
  Container, Header, Button, SpaceBetween, Alert, FormField, Input,
} from '@cloudscape-design/components';

const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

const YouTubeConnectComponent: React.FC = () => {
  const [clientId, setClientId] = useState('');
  const connected = false;

  const handleConnect = () => {
    const envClientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || clientId;

    if (!envClientId) {
      alert('Please enter a YouTube Client ID or set VITE_YOUTUBE_CLIENT_ID environment variable.');
      return;
    }

    const redirectUri = `${window.location.origin}/youtube/callback`;
    const params = new URLSearchParams({
      client_id: envClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    });

    window.location.href = `${YOUTUBE_AUTH_URL}?${params.toString()}`;
  };

  return (
    <Container header={<Header variant="h2">YouTube Settings</Header>}>
      <SpaceBetween size="l">
        {connected ? (
          <Alert type="success">
            YouTube account is connected. You can upload videos directly to YouTube from the output page.
          </Alert>
        ) : (
          <>
            <Alert type="info">
              Connect your YouTube account to enable direct video uploads. You need a Google Cloud project with YouTube Data API v3 enabled.
            </Alert>

            {!import.meta.env.VITE_YOUTUBE_CLIENT_ID && (
              <FormField label="YouTube OAuth Client ID" description="Enter your Google Cloud OAuth 2.0 Client ID">
                <Input
                  value={clientId}
                  onChange={({ detail }) => setClientId(detail.value)}
                  placeholder="xxx.apps.googleusercontent.com"
                />
              </FormField>
            )}

            <Button variant="primary" onClick={handleConnect}>
              Connect YouTube Account
            </Button>
          </>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default YouTubeConnectComponent;
