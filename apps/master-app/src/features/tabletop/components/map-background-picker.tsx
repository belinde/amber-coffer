import type { Campaign, Map as TabletopMap } from '@amber/shared';
import { CardGrid } from '@amber/ui';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';

import {
  getCampaignImagesForPicker,
  setMapBackgroundFromImage,
  type CampaignImagePickerEntry,
} from './map-background-picker-bridge.js';

type CampaignId = Campaign['id'];
type MapId = TabletopMap['id'];
type CampaignImageId = string;

type FilterKind = 'all' | 'character' | 'npc' | 'location' | 'unlinked';

export type MapBackgroundPickerProps = {
  campaignId: CampaignId;
  currentMapId: MapId;
  onSelect: (campaignImageId: CampaignImageId) => void;
  onUploadNew: () => void;
};

export function MapBackgroundPicker({
  campaignId,
  currentMapId,
  onSelect,
  onUploadNew,
}: MapBackgroundPickerProps): ReactElement {
  const { t } = useTranslation();
  const [images, setImages] = useState<CampaignImagePickerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKind>('all');

  const filteredImages = useMemo(() => {
    let result = images;

    // Apply kind filter
    switch (activeFilter) {
      case 'character':
        result = result.filter((img) => img.linkKinds.includes('character'));
        break;
      case 'npc':
        result = result.filter((img) => img.linkKinds.includes('npc'));
        break;
      case 'location':
        result = result.filter((img) => img.linkKinds.includes('location'));
        break;
      case 'unlinked':
        result = result.filter((img) => img.linkKinds.length === 0);
        break;
    }

    // Apply search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((img) => img.title.toLowerCase().includes(q));
    }

    return result;
  }, [images, searchQuery, activeFilter]);

  const loadImages = useCallback(() => {
    setLoading(true);
    setError(null);
    void getCampaignImagesForPicker(campaignId)
      .then((entries) => {
        setImages(entries);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [campaignId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  async function handleSelect(imageId: CampaignImageId): Promise<void> {
    setSelecting(imageId);
    setError(null);
    try {
      await setMapBackgroundFromImage(currentMapId, imageId);
      onSelect(imageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelecting(null);
    }
  }

  if (loading) {
    return <p className="map-background-picker__loading">{t('common.loading')}</p>;
  }

  const filters: { kind: FilterKind; label: string }[] = [
    { kind: 'all', label: t('tabletop.mapPicker.filterAll') },
    { kind: 'character', label: t('tabletop.mapPicker.filterCharacters') },
    { kind: 'npc', label: t('tabletop.mapPicker.filterNpcs') },
    { kind: 'location', label: t('tabletop.mapPicker.filterLocations') },
    { kind: 'unlinked', label: t('tabletop.mapPicker.filterUnlinked') },
  ];

  return (
    <div className="map-background-picker">
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="map-background-picker__actions">
        <input
          type="search"
          className="map-background-picker__search"
          placeholder={t('tabletop.mapPicker.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t('tabletop.mapPicker.searchPlaceholder')}
        />
        <Button type="button" icon={ActionIcons.add} onClick={onUploadNew}>
          {t('tabletop.mapPicker.uploadNew')}
        </Button>
      </div>

      <div className="map-background-picker__filters" role="group">
        {filters.map((f) => (
          <button
            key={f.kind}
            type="button"
            className={`map-background-picker__filter-chip${activeFilter === f.kind ? ' map-background-picker__filter-chip--active' : ''}`}
            onClick={() => setActiveFilter(f.kind)}
            aria-pressed={activeFilter === f.kind}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredImages.length === 0 ? (
        <p className="empty-state">{t('tabletop.mapPicker.empty')}</p>
      ) : (
        <CardGrid as="div" variant="portrait" className="map-background-picker__grid">
          {filteredImages.map((image) => (
            <MapBackgroundPickerItem
              key={image.id}
              image={image}
              disabled={selecting !== null}
              selecting={selecting === image.id}
              onSelect={() => void handleSelect(image.id)}
            />
          ))}
        </CardGrid>
      )}
    </div>
  );
}

function MapBackgroundPickerItem({
  image,
  disabled,
  selecting,
  onSelect,
}: {
  image: CampaignImagePickerEntry;
  disabled: boolean;
  selecting: boolean;
  onSelect: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    if (image.thumbnailPath) {
      setThumbSrc(convertFileSrc(image.thumbnailPath));
    }
  }, [image.thumbnailPath]);

  return (
    <button
      type="button"
      className="map-background-picker__item"
      disabled={disabled}
      onClick={onSelect}
      aria-label={t('tabletop.mapPicker.selectImage', { name: image.title })}
    >
      <div className="map-background-picker__thumb">
        {thumbSrc ? (
          <img src={thumbSrc} alt={image.title} className="map-background-picker__thumb-img" />
        ) : (
          <span className="map-background-picker__thumb-placeholder" aria-hidden />
        )}
      </div>
      <span className="map-background-picker__title">
        {selecting ? t('common.loading') : image.title}
      </span>
    </button>
  );
}
