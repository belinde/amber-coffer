/**
 * @vitest-environment jsdom
 */
import type { ClipRegion, ImageRef } from '@amber/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clampClipRegion, TokenClipEditor } from './token-clip-editor.js';

// Mock react-i18next to return the key as text
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// Mock the image URL resolver — returns a fake URL immediately
vi.mock('../../../components/ui/resolve-local-image-url.js', () => ({
  resolveImageDisplayUrlAsync: () => Promise.resolve('http://fake-image.png'),
}));

afterEach(cleanup);

// ---------------------------------------------------------------------------
// clampClipRegion — bounds constraint enforcement
// ---------------------------------------------------------------------------
describe('clampClipRegion', () => {
  it('enforces minimum halfSide of 0.05', () => {
    const result = clampClipRegion(0.5, 0.5, 0.01);
    expect(result.halfSide).toBe(0.05);
  });

  it('caps halfSide at 0.5', () => {
    const result = clampClipRegion(0.5, 0.5, 0.9);
    expect(result.halfSide).toBe(0.5);
  });

  it('clamps centerX so that center - halfSide >= 0', () => {
    const result = clampClipRegion(0.02, 0.5, 0.1);
    // centerX must be at least halfSide (0.1)
    expect(result.centerX).toBeGreaterThanOrEqual(result.halfSide);
    expect(result.centerX - result.halfSide).toBeGreaterThanOrEqual(0);
  });

  it('clamps centerX so that center + halfSide <= 1', () => {
    const result = clampClipRegion(0.98, 0.5, 0.1);
    expect(result.centerX + result.halfSide).toBeLessThanOrEqual(1);
  });

  it('clamps centerY so that center - halfSide >= 0', () => {
    const result = clampClipRegion(0.5, 0.01, 0.1);
    expect(result.centerY - result.halfSide).toBeGreaterThanOrEqual(0);
  });

  it('clamps centerY so that center + halfSide <= 1', () => {
    const result = clampClipRegion(0.5, 0.99, 0.1);
    expect(result.centerY + result.halfSide).toBeLessThanOrEqual(1);
  });

  it('returns valid region for centered values', () => {
    const result = clampClipRegion(0.5, 0.5, 0.25);
    expect(result).toEqual({ centerX: 0.5, centerY: 0.5, halfSide: 0.25 });
  });

  it('handles edge case where halfSide pushes center to boundary', () => {
    // halfSide = 0.5 means center must be exactly 0.5
    const result = clampClipRegion(0.3, 0.7, 0.5);
    expect(result.centerX).toBe(0.5);
    expect(result.centerY).toBe(0.5);
    expect(result.halfSide).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// TokenClipEditor component — disabled state
// ---------------------------------------------------------------------------
describe('TokenClipEditor — disabled state', () => {
  const baseProps = {
    campaignImageId: '01932f8a-0000-7000-8000-000000000001' as never,
    campaignId: '01932f8a-0000-7000-8000-000000000099' as never,
    imageRef: { local: 'test.png' } as ImageRef,
    clipRegion: null,
    onConfirm: vi.fn(),
    onRemove: vi.fn(),
  };

  it('renders the no-image message when disabled', () => {
    render(<TokenClipEditor {...baseProps} disabled={true} />);
    expect(screen.getByText('tabletop.clipEditor.noImage')).toBeTruthy();
  });

  it('does not render confirm or remove buttons when disabled', () => {
    render(<TokenClipEditor {...baseProps} disabled={true} />);
    expect(screen.queryByText('tabletop.clipEditor.confirm')).toBeNull();
    expect(screen.queryByText('tabletop.clipEditor.remove')).toBeNull();
  });

  it('does not render the image container when disabled', () => {
    render(<TokenClipEditor {...baseProps} disabled={true} />);
    expect(screen.queryByRole('application')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TokenClipEditor component — confirm/remove callbacks
// ---------------------------------------------------------------------------
describe('TokenClipEditor — confirm/remove callbacks', () => {
  const clipRegion: ClipRegion = { centerX: 0.5, centerY: 0.5, halfSide: 0.25 };

  const baseProps = {
    campaignImageId: '01932f8a-0000-7000-8000-000000000001' as never,
    campaignId: '01932f8a-0000-7000-8000-000000000099' as never,
    imageRef: { local: 'test.png' } as ImageRef,
    clipRegion,
    onConfirm: vi.fn(),
    onRemove: vi.fn(),
  };

  it('calls onConfirm with the current clip region when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<TokenClipEditor {...baseProps} onConfirm={onConfirm} />);

    const confirmBtn = screen.getByText('tabletop.clipEditor.confirm');
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledOnce();
    const arg = onConfirm.mock.calls[0]![0] as ClipRegion;
    expect(arg.centerX).toBe(0.5);
    expect(arg.centerY).toBe(0.5);
    expect(arg.halfSide).toBe(0.25);
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<TokenClipEditor {...baseProps} onRemove={onRemove} />);

    const removeBtn = screen.getByText('tabletop.clipEditor.remove');
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('does not render remove button when clipRegion is null', () => {
    render(<TokenClipEditor {...baseProps} clipRegion={null} />);
    expect(screen.queryByText('tabletop.clipEditor.remove')).toBeNull();
  });

  it('renders confirm button even when clipRegion is null (for new clips)', () => {
    render(<TokenClipEditor {...baseProps} clipRegion={null} />);
    expect(screen.getByText('tabletop.clipEditor.confirm')).toBeTruthy();
  });
});
