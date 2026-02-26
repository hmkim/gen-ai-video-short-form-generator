import React, { useState, useEffect } from 'react';
import {
  Container, Header, Button, SpaceBetween, Alert, FormField, Input,
  Box, Spinner, StatusIndicator, ColumnLayout,
} from '@cloudscape-design/components';
import { checkYouTubeConnection } from '../../apis/youtube';

const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

const YouTubeConnectComponent: React.FC = () => {
  const [clientId, setClientId] = useState(() => localStorage.getItem('yt_client_id') || '');
  const [clientSecret, setClientSecret] = useState(() => localStorage.getItem('yt_client_secret') || '');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const result = await checkYouTubeConnection();
      if (result.data) {
        const parsed = JSON.parse(result.data);
        setConnected(parsed.connected);
      }
    } catch (error) {
      console.error('Check connection error:', error);
      setConnected(false);
    }
    setChecking(false);
  };

  const handleConnect = () => {
    const envClientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || clientId;

    if (!envClientId) {
      alert('Please enter a YouTube Client ID.');
      return;
    }

    if (!clientSecret && !import.meta.env.VITE_YOUTUBE_CLIENT_SECRET) {
      alert('Please enter a YouTube Client Secret.');
      return;
    }

    // Save credentials to localStorage for the callback page to use
    localStorage.setItem('yt_client_id', envClientId);
    localStorage.setItem('yt_client_secret', import.meta.env.VITE_YOUTUBE_CLIENT_SECRET || clientSecret);

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

  if (checking) {
    return (
      <Container header={<Header variant="h2">YouTube Settings</Header>}>
        <Box textAlign="center" padding="l">
          <Spinner /> Checking YouTube connection...
        </Box>
      </Container>
    );
  }

  return (
    <Container header={<Header variant="h2">YouTube Settings</Header>}>
      <SpaceBetween size="l">
        {connected ? (
          <>
            <Alert type="success">
              <StatusIndicator type="success">YouTube account is connected</StatusIndicator>
              <Box margin={{ top: "xs" }}>
                You can upload videos directly to YouTube from the output page.
              </Box>
            </Alert>
            <Button onClick={handleConnect}>
              Reconnect YouTube Account
            </Button>
          </>
        ) : (
          <>
            <Alert type="info">
              Connect your YouTube account to enable direct video uploads.
              You need a Google Cloud project with YouTube Data API v3 enabled.
            </Alert>

            <Alert type="warning" header="Setup Required">
              <SpaceBetween size="xs">
                <Box>1. Go to <strong>Google Cloud Console</strong> and create an OAuth 2.0 Client ID</Box>
                <Box>2. Enable <strong>YouTube Data API v3</strong></Box>
                <Box>3. Add <strong>{window.location.origin}/youtube/callback</strong> as an authorized redirect URI</Box>
                <Box>4. Enter the Client ID and Client Secret below</Box>
              </SpaceBetween>
            </Alert>

            <ColumnLayout columns={2}>
              <FormField
                label="YouTube OAuth Client ID"
                description="From Google Cloud Console > APIs & Services > Credentials"
              >
                <Input
                  value={clientId}
                  onChange={({ detail }) => setClientId(detail.value)}
                  placeholder="xxx.apps.googleusercontent.com"
                />
              </FormField>
              <FormField
                label="YouTube OAuth Client Secret"
                description="Keep this confidential. Stored in browser only to exchange for tokens."
              >
                <Input
                  value={clientSecret}
                  onChange={({ detail }) => setClientSecret(detail.value)}
                  placeholder="GOCSPX-..."
                  type="password"
                />
              </FormField>
            </ColumnLayout>

            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={!clientId || !clientSecret}
            >
              Connect YouTube Account
            </Button>
          </>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default YouTubeConnectComponent;
