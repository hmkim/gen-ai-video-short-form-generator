import React, { useState, useEffect } from 'react';
import {
  Container, Header, Button, SpaceBetween, Alert, FormField, Input,
  Box, Spinner, ColumnLayout, Link, Select, Flashbar,
} from '@cloudscape-design/components';
import { checkYouTubeConnection, saveYouTubeChannel } from '../../apis/youtube';

const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

interface AccountInfo {
  email: string;
  name: string;
  picture: string;
}

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
}

const YouTubeConnectComponent: React.FC = () => {
  const [clientId, setClientId] = useState(() => localStorage.getItem('yt_client_id') || '');
  const [clientSecret, setClientSecret] = useState(() => localStorage.getItem('yt_client_secret') || '');
  const [storedClientId, setStoredClientId] = useState<string>('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [savingChannel, setSavingChannel] = useState(false);
  const [checking, setChecking] = useState(true);
  const [flashMessages, setFlashMessages] = useState<
    Array<{ id: string; type: "success" | "error"; content: string }>
  >([]);

  const showFlash = (type: "success" | "error", content: string) => {
    const msgId = Date.now().toString();
    setFlashMessages((prev) => [...prev, { id: msgId, type, content }]);
    setTimeout(() => setFlashMessages((prev) => prev.filter((m) => m.id !== msgId)), 4000);
  };

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setChecking(true);
    try {
      const result = await checkYouTubeConnection();
      if (result.data) {
        const parsed = JSON.parse(result.data);
        setConnected(parsed.connected);
        if (parsed.connected) {
          if (parsed.clientId) {
            setStoredClientId(parsed.clientId);
          }
          if (parsed.email || parsed.name) {
            setAccountInfo({
              email: parsed.email || '',
              name: parsed.name || '',
              picture: parsed.picture || '',
            });
          }
          if (parsed.channels) {
            setChannels(parsed.channels);
          }
          if (parsed.selectedChannelId) {
            setSelectedChannelId(parsed.selectedChannelId);
          }
        }
      }
    } catch (error) {
      console.error('Check connection error:', error);
      setConnected(false);
    }
    setChecking(false);
  };

  const startOAuthFlow = (oauthClientId: string) => {
    const redirectUri = `${window.location.origin}/youtube/callback`;
    const params = new URLSearchParams({
      client_id: oauthClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    });

    window.location.href = `${YOUTUBE_AUTH_URL}?${params.toString()}`;
  };

  const handleConnect = () => {
    const envClientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || clientId;

    if (!envClientId) {
      showFlash('error', 'Please enter a YouTube Client ID.');
      return;
    }

    if (!clientSecret && !import.meta.env.VITE_YOUTUBE_CLIENT_SECRET) {
      showFlash('error', 'Please enter a YouTube Client Secret.');
      return;
    }

    localStorage.setItem('yt_client_id', envClientId);
    localStorage.setItem('yt_client_secret', import.meta.env.VITE_YOUTUBE_CLIENT_SECRET || clientSecret);

    startOAuthFlow(envClientId);
  };

  const handleReconnect = () => {
    // Use stored clientId from backend (Secrets Manager) or localStorage
    const oauthClientId = storedClientId || localStorage.getItem('yt_client_id') || '';

    if (!oauthClientId) {
      showFlash('error', 'Client ID not found. Please disconnect and set up again.');
      return;
    }

    // For reconnect, backend will use stored client_secret from Secrets Manager
    startOAuthFlow(oauthClientId);
  };

  const handleSaveChannel = async (channelId: string) => {
    setSavingChannel(true);
    try {
      const result = await saveYouTubeChannel(channelId);
      if (result.data) {
        const parsed = JSON.parse(result.data);
        if (parsed.success) {
          setSelectedChannelId(channelId);
          showFlash('success', 'Channel saved successfully');
        } else {
          showFlash('error', parsed.error || 'Failed to save channel');
        }
      }
    } catch (error) {
      console.error('Save channel error:', error);
      showFlash('error', 'Failed to save channel');
    }
    setSavingChannel(false);
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
    <SpaceBetween size="l">
      <Flashbar
        items={flashMessages.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          dismissible: true,
          onDismiss: () =>
            setFlashMessages((prev) => prev.filter((p) => p.id !== m.id)),
        }))}
      />

      <Container header={<Header variant="h2">YouTube Settings</Header>}>
        <SpaceBetween size="l">
          {connected ? (
            <>
              <Alert type="success">
                YouTube account is connected. You can upload videos directly to YouTube from the output page.
              </Alert>

              {accountInfo && (
                <Container variant="stacked">
                  <SpaceBetween size="m">
                    <Box variant="h4">Connected Google Account</Box>
                    <ColumnLayout columns={2}>
                      <div>
                        <Box variant="awsui-key-label">Account</Box>
                        <Box>
                          {accountInfo.picture && (
                            <img
                              src={accountInfo.picture}
                              alt=""
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                verticalAlign: 'middle',
                                marginRight: 8,
                              }}
                            />
                          )}
                          {accountInfo.name || accountInfo.email}
                        </Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Email</Box>
                        <Box>{accountInfo.email || '-'}</Box>
                      </div>
                    </ColumnLayout>
                    <Box>
                      <Link
                        href="https://myaccount.google.com/permissions"
                        external
                      >
                        Manage Google account permissions
                      </Link>
                      {' | '}
                      <Link
                        href="https://studio.youtube.com"
                        external
                      >
                        YouTube Studio
                      </Link>
                    </Box>
                  </SpaceBetween>
                </Container>
              )}

              {channels.length > 0 && (
                <Container variant="stacked">
                  <SpaceBetween size="m">
                    <Box variant="h4">YouTube Channel</Box>
                    <FormField
                      label="Select Channel"
                      description={
                        channels.length === 1
                          ? 'Your YouTube channel for uploads.'
                          : 'Choose which YouTube channel to upload videos to.'
                      }
                    >
                      <SpaceBetween size="xs" direction="horizontal">
                        <div style={{ minWidth: 300 }}>
                          <Select
                            selectedOption={
                              selectedChannelId
                                ? {
                                    value: selectedChannelId,
                                    label: channels.find((c) => c.id === selectedChannelId)?.title || selectedChannelId,
                                  }
                                : null
                            }
                            onChange={({ detail }) => {
                              if (detail.selectedOption.value) {
                                handleSaveChannel(detail.selectedOption.value);
                              }
                            }}
                            options={channels.map((ch) => ({
                              value: ch.id,
                              label: ch.title,
                              iconUrl: ch.thumbnail || undefined,
                            }))}
                            placeholder="Select a channel"
                            loadingText="Saving..."
                            statusType={savingChannel ? 'loading' : 'finished'}
                          />
                        </div>
                      </SpaceBetween>
                    </FormField>
                    {channels.length === 1 && (
                      <Alert type="info">
                        Only channels linked to the connected Google account are shown.
                        If you have a Brand Account channel, click <strong>Reconnect</strong> and select the Brand Account during the Google sign-in screen.
                      </Alert>
                    )}
                  </SpaceBetween>
                </Container>
              )}

              <Button onClick={handleReconnect}>
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
    </SpaceBetween>
  );
};

export default YouTubeConnectComponent;
