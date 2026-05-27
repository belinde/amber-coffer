import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapBackgroundPicker } from './map-background-picker.js';

// --- Mocks ---

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock('@amber/ui', () => ({
  CardGrid: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <div data-testid="card-grid" {...props}>
      {children}
    </div>
  ),
}));

const mockGetCampaignImagesForPicker = vi.fn();
const mockSetMapBackgroundFromImage = vi.fn();

vi.mock('./map-background-picker-bridge.js', () => ({
  getCampaignImagesForPicker: (...args: unknown[]) =>
    mockGetCampaignImagesForPicker(...args) as unknown,
  setMapBackgroundFromImage: (...args: unknown[]) =>
    mockSetMapBackgroundFromImage(...args) as unknown,
}));

// Suppress the Button import — thin wrapper re-exports from @amber/ui
vi.mock('../../../components/ui/Button.js', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [k: string]: unknown;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../../components/ui/icons.js', () => ({
  ActionIcons: { add: 'add-icon' },
}));

// --- Helpers ---

const defaultProps = {
  campaignId: 'campaign-001' as never,
  currentMapId: 'map-001' as never,
  onSelect: vi.fn(),
  onUploadNew: vi.fn(),
};

describe('MapBackgroundPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('empty state rendering', () => {
    it('renders empty state message when no images are available', async () => {
      mockGetCampaignImagesForPicker.mockResolvedValue([]);

      render(<MapBackgroundPicker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('tabletop.mapPicker.empty')).toBeDefined();
      });
    });

    it('shows loading state initially', () => {
      mockGetCampaignImagesForPicker.mockReturnValue(new Promise(() => {}));

      render(<MapBackgroundPicker {...defaultProps} />);

      expect(screen.getByText('common.loading')).toBeDefined();
    });
  });

  describe('selection callback', () => {
    it('calls set_map_background_from_image_cmd and then onSelect on image click', async () => {
      const images = [
        {
          id: 'img-1',
          title: 'Tavern Map',
          thumbnailPath: '/path/to/thumb.webp',
          widthPx: 1024,
          heightPx: 768,
        },
        { id: 'img-2', title: 'Forest Map', thumbnailPath: null, widthPx: 800, heightPx: 600 },
      ];
      mockGetCampaignImagesForPicker.mockResolvedValue(images);
      mockSetMapBackgroundFromImage.mockResolvedValue({ id: 'map-001' });

      render(<MapBackgroundPicker {...defaultProps} />);

      // Wait for images to load — use getAllByLabelText since multiple items share the same translated label
      await waitFor(() => {
        expect(screen.getAllByLabelText('tabletop.mapPicker.selectImage')).toHaveLength(2);
      });

      const imageButtons = screen.getAllByLabelText('tabletop.mapPicker.selectImage');
      fireEvent.click(imageButtons[0]!);

      await waitFor(() => {
        expect(mockSetMapBackgroundFromImage).toHaveBeenCalledWith('map-001', 'img-1');
      });

      await waitFor(() => {
        expect(defaultProps.onSelect).toHaveBeenCalledWith('img-1');
      });
    });

    it('renders image thumbnails when images are available', async () => {
      const images = [
        {
          id: 'img-1',
          title: 'Tavern Map',
          thumbnailPath: '/path/to/thumb.webp',
          widthPx: 1024,
          heightPx: 768,
        },
      ];
      mockGetCampaignImagesForPicker.mockResolvedValue(images);

      render(<MapBackgroundPicker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByAltText('Tavern Map')).toBeDefined();
      });
    });
  });

  describe('error handling for missing files', () => {
    it('displays error message when backend returns an error on selection', async () => {
      const images = [
        {
          id: 'img-1',
          title: 'Missing Map',
          thumbnailPath: '/path/to/thumb.webp',
          widthPx: 1024,
          heightPx: 768,
        },
      ];
      mockGetCampaignImagesForPicker.mockResolvedValue(images);
      mockSetMapBackgroundFromImage.mockRejectedValue(new Error('Image file not found'));

      render(<MapBackgroundPicker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText('tabletop.mapPicker.selectImage')).toBeDefined();
      });

      const imageButton = screen.getByLabelText('tabletop.mapPicker.selectImage');
      fireEvent.click(imageButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText('Image file not found')).toBeDefined();
      });

      // onSelect should NOT be called when there's an error
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });

    it('displays error message when image loading fails', async () => {
      mockGetCampaignImagesForPicker.mockRejectedValue(new Error('Failed to load images'));

      render(<MapBackgroundPicker {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText('Failed to load images')).toBeDefined();
      });
    });
  });
});
