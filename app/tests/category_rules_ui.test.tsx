/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import CategoryManagementModal from '../components/CategoryDashboard/components/CategoryManagementModal';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json' },
});

describe('category rule form', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['both fields empty', '', ''],
    ['pattern missing', '', 'Groceries'],
    ['category missing', 'Coffee shop', ''],
  ])('shows validation instead of silently disabling Add when %s', async (_case, pattern, category) => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoryManagementModal open onClose={vi.fn()} onCategoriesUpdated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Rules' }));
    const addButton = screen.getByRole('button', { name: 'Add' });
    await waitFor(() => expect(addButton).toBeEnabled());
    if (pattern) fireEvent.change(screen.getByLabelText('Transaction Name Pattern'), { target: { value: pattern } });
    if (category) fireEvent.change(screen.getByLabelText('Target Category'), { target: { value: category } });
    fireEvent.click(addButton);

    expect(await screen.findByText('Please enter both pattern and category')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('submits a complete rule exactly once', async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => jsonResponse(
      options?.method === 'POST' ? { id: 1, name_pattern: 'Coffee shop', target_category: 'Groceries' } : []
    ));
    vi.stubGlobal('fetch', fetchMock);
    render(<CategoryManagementModal open onClose={vi.fn()} onCategoriesUpdated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Rules' }));
    const addButton = screen.getByRole('button', { name: 'Add' });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Transaction Name Pattern'), { target: { value: 'Coffee shop' } });
    fireEvent.change(screen.getByLabelText('Target Category'), { target: { value: 'Groceries' } });
    fireEvent.click(addButton);

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1));
  });
});
