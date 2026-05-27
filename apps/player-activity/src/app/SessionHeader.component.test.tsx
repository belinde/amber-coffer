/// <reference types="@testing-library/jest-dom" />
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { SessionStatus } from './session-types.js';
import { SessionHeader } from './SessionHeader.js';

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    resources: {
      en: {
        common: {
          'app.title': 'Amber Coffer — Game table',
          'app.subtitle': 'Player game table',
          'app.campaignNameFallback': 'Campaign',
        },
      },
    },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

afterEach(() => {
  cleanup();
});

function renderHeader(status: SessionStatus, campaignName: string | null = 'Test Campaign') {
  return render(
    <I18nextProvider i18n={i18n}>
      <SessionHeader status={status} campaignName={campaignName} />
    </I18nextProvider>,
  );
}

describe('SessionHeader', () => {
  describe('connected state', () => {
    it('renders compact header with icon and campaign name in h2', () => {
      const { container } = renderHeader('connected', 'Dragon Keep');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Dragon Keep');
      // Icon has alt="" (decorative), so it has role="presentation"
      const icon = container.querySelector('img');
      expect(icon).toHaveAttribute('width', '24');
      expect(icon).toHaveAttribute('height', '24');
    });

    it('does not render app title or subtitle', () => {
      renderHeader('connected', 'Dragon Keep');
      expect(screen.queryByText('Amber Coffer — Game table')).not.toBeInTheDocument();
      expect(screen.queryByText('Player game table')).not.toBeInTheDocument();
    });
  });

  describe('non-connected states', () => {
    const nonConnectedStatuses: SessionStatus[] = ['idle', 'connecting', 'ended', 'error'];

    it.each(nonConnectedStatuses)('renders full header with h1 title for status "%s"', (status) => {
      renderHeader(status);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Amber Coffer — Game table',
      );
      expect(screen.getByText('Player game table')).toBeInTheDocument();
    });

    it.each(nonConnectedStatuses)('does not render compact icon for status "%s"', (status) => {
      renderHeader(status);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('heading role', () => {
    it('campaign name is in an element with heading role when connected', () => {
      renderHeader('connected', 'My Campaign');
      const heading = screen.getByRole('heading');
      expect(heading).toHaveTextContent('My Campaign');
    });

    it('title is in an element with heading role when not connected', () => {
      renderHeader('idle');
      const heading = screen.getByRole('heading');
      expect(heading).toHaveTextContent('Amber Coffer — Game table');
    });
  });

  describe('fallback label', () => {
    it('renders i18n fallback when campaignName is null (connected)', () => {
      renderHeader('connected', null);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Campaign');
    });
  });

  describe('truncation', () => {
    it('truncates campaign names longer than 40 characters with ellipsis', () => {
      const longName = 'A'.repeat(50);
      renderHeader('connected', longName);
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toBe('A'.repeat(40) + '\u2026');
    });

    it('does not truncate campaign names of 40 characters or fewer', () => {
      const shortName = 'B'.repeat(40);
      renderHeader('connected', shortName);
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toBe(shortName);
    });
  });
});
