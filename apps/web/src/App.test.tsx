// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import App from './App.js';

describe('React Web Application Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders application shell and empty inbox state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/items')) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    expect(await screen.findByText('AI Knowledge Inbox')).toBeInTheDocument();
    expect(await screen.findByText('Your Inbox is Empty')).toBeInTheDocument();
  });

  it('expands composer when clicked and toggles text/url mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/items')) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    const prompts = await screen.findAllByText('Take a note or paste a URL…');
    const prompt = prompts[0];
    if (prompt) fireEvent.click(prompt);

    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write your note content...')).toBeInTheDocument();

    const urlBtn = screen.getByText('Web URL');
    fireEvent.click(urlBtn);
    expect(screen.getByPlaceholderText('https://example.com/article')).toBeInTheDocument();
  });

  it('renders note cards with non-color-only status badges', async () => {
    const mockItem = {
      id: 'itm_12345678901234567890123456789012',
      type: 'text' as const,
      title: 'Saved Note Title',
      sourceUrl: null,
      status: 'ready' as const,
      createdAt: '2026-08-25T12:00:00.000Z',
      updatedAt: '2026-08-25T12:00:00.000Z',
      error: null,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/items')) {
        return new Response(JSON.stringify({ items: [mockItem], nextCursor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    expect(await screen.findByText('Saved Note Title')).toBeInTheDocument();
    const readyBadges = await screen.findAllByText('Ready');
    expect(readyBadges.length).toBeGreaterThan(0);
  });
});
