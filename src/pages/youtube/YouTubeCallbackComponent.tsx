import React, { useEffect, useState } from 'react';
import { Container, Header, Box, Spinner, Alert } from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';

const YouTubeCallbackComponent: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Authorization failed: ${errorParam}`);
      return;
    }

    if (code) {
      // In a production setup, this authorization code would be sent to
      // a backend Lambda to exchange for tokens and store in Secrets Manager.
      // For now, we show success and redirect.
      console.log('Authorization code received:', code);

      // TODO: Call a backend API to exchange the code for tokens
      // await exchangeAuthCode(code);

      setTimeout(() => {
        navigate('/youtube/connect');
      }, 2000);
    } else {
      setError('No authorization code received.');
    }
  }, [navigate]);

  if (error) {
    return (
      <Container header={<Header variant="h2">YouTube Authorization</Header>}>
        <Alert type="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container header={<Header variant="h2">YouTube Authorization</Header>}>
      <Box textAlign="center">
        <Spinner size="large" />
        <Box margin={{ top: "m" }}>
          Processing YouTube authorization... Redirecting shortly.
        </Box>
      </Box>
    </Container>
  );
};

export default YouTubeCallbackComponent;
