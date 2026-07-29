// Smoke test for the U1 `/upload` launcher.
// Verifies the three purpose cards render and that activating each routes to
// the correct existing flow. useNavigate is mocked so we assert on the target
// path without a real router navigation.

import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import UnifiedUploadComponent from '../UnifiedUploadComponent';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderComponent = () =>
  render(
    <MemoryRouter>
      <UnifiedUploadComponent />
    </MemoryRouter>,
  );

describe('UnifiedUploadComponent', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the page heading', () => {
    renderComponent();
    expect(
      screen.getByRole('heading', { level: 1, name: '업로드' }),
    ).toBeInTheDocument();
  });

  it('renders all three purpose cards', () => {
    renderComponent();
    expect(screen.getByTestId('goto-shorts')).toBeInTheDocument();
    expect(screen.getByTestId('goto-longvideo')).toBeInTheDocument();
    expect(screen.getByTestId('goto-youtube')).toBeInTheDocument();
  });

  it('navigates to the short-form flow when the shorts card is activated', () => {
    renderComponent();
    fireEvent.click(within(screen.getByTestId('goto-shorts')).getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates to the long-video flow when the speaker-edit card is activated', () => {
    renderComponent();
    fireEvent.click(within(screen.getByTestId('goto-longvideo')).getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/longvideo');
  });

  it('navigates to the YouTube uploads flow when the YouTube card is activated', () => {
    renderComponent();
    fireEvent.click(within(screen.getByTestId('goto-youtube')).getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/youtube/uploads');
  });
});
