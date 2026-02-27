import React, { useEffect, useState } from 'react';
import { Container, Header, Box, Spinner, Alert, Button } from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import { exchangeYouTubeToken } from '../../apis/youtube';

const YouTubeCallbackComponent: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Authorization failed: ${errorParam}`);
      setProcessing(false);
      return;
    }

    if (!code) {
      setError('No authorization code received.');
      setProcessing(false);
      return;
    }

    // Get credentials from localStorage if available (first-time setup)
    // For reconnect, backend will use stored credentials from Secrets Manager
    const clientId = localStorage.getItem('yt_client_id') || undefined;
    const clientSecret = localStorage.getItem('yt_client_secret') || undefined;

    const redirectUri = `${window.location.origin}/youtube/callback`;

    // Exchange code for tokens via backend
    exchangeYouTubeToken(code, redirectUri, clientId, clientSecret)
      .then((result) => {
        if (result.data) {
          const parsed = JSON.parse(result.data);
          if (parsed.success) {
            setSuccess(true);
            // Clear client secret from localStorage after successful exchange
            localStorage.removeItem('yt_client_secret');
            setTimeout(() => navigate('/youtube/connect'), 2000);
          } else {
            setError(parsed.error || 'Token exchange failed');
          }
        } else {
          setError('No response from token exchange');
        }
      })
      .catch((err) => {
        console.error('Token exchange error:', err);
        setError(`Token exchange failed: ${err.message || String(err)}`);
      })
      .finally(() => setProcessing(false));
  }, [navigate]);

  if (processing) {
    return (
      <Container header={<Header variant="h2">YouTube Authorization</Header>}>
        <Box textAlign="center" padding="l">
          <Spinner size="large" />
          <Box margin={{ top: "m" }}>
            Exchanging authorization code for tokens...
          </Box>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container header={<Header variant="h2">YouTube Authorization</Header>}>
        <Alert type="error">{error}</Alert>
        <Box margin={{ top: "m" }}>
          <Button onClick={() => navigate('/youtube/connect')}>
            Back to YouTube Settings
          </Button>
        </Box>
      </Container>
    );
  }

  if (success) {
    return (
      <Container header={<Header variant="h2">YouTube Authorization</Header>}>
        <Alert type="success">
          YouTube account connected successfully! Redirecting...
        </Alert>
      </Container>
    );
  }

  return null;
};

export default YouTubeCallbackComponent;
