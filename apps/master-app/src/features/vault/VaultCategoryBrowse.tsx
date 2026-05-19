import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { ActionIcons, iconForVaultCategory } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';
import { TabularList } from '../../components/ui/TabularList.js';

import { NEW_ENTITY_ID, type VaultCategory } from './vault-categories.js';
import { listVaultEntities, type VaultListItem } from './vault-data.js';

type Props = {
  campaignId: Campaign['id'];
  category: VaultCategory;
  onOpenEntity: (entityId: string) => void;
  onBack: () => void;
  onError: (message: string) => void;
};

const IMAGE_CATEGORIES = new Set<VaultCategory>(['characters', 'npcs', 'locations', 'factions']);

export function VaultCategoryBrowse({
  campaignId,
  category,
  onOpenEntity,
  onBack,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<VaultListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const labels = useMemo(
    () => ({
      visibility: (code: string) => t(`vault.visibility.${code}`),
      characterStatus: (code: string) => t(`character.statusValues.${code}`),
      characterDiscordPlayer: (playerDiscordId: string | null) =>
        playerDiscordId ? t('character.listDiscordLinked') : undefined,
      npcStatus: (code: string) => t(`npc.statusValues.${code}`),
      npcDisposition: (code: string) => t(`npc.dispositionValues.${code}`),
      npcRecordKind: (code: string) => t(`vault.recordKind.${code}`),
      factionKind: (code: string) => t(`vault.factionKind.${code}`),
      loreNoteKind: (code: string) => t(`vault.loreKind.${code}`),
      seedStatus: (code: string) => t(`vault.seedStatus.${code}`),
      equipCount: (count: number) => t('list.equipCount', { count }),
      sectionCount: (count: number) => t('list.sectionCount', { count }),
      linkCount: (count: number) => t('list.linkCount', { count }),
    }),
    [t],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listVaultEntities(category, campaignId, labels));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId, category, labels, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const { row } = item;
      const haystack = [row.title, row.subtitle, row.badge, ...(row.details ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  return (
    <div className="vault-browse">
      <PanelPageHeader
        icon={iconForVaultCategory(category)}
        title={t(`vault.categories.${category}`)}
        onBack={onBack}
        actions={
          <Button
            type="button"
            variant="primary"
            icon={ActionIcons.add}
            onClick={() => onOpenEntity(NEW_ENTITY_ID)}
          >
            {t(`vault.create.${category}`)}
          </Button>
        }
      />

      <div className="field">
        <label htmlFor="vault-search">{t('vault.search')}</label>
        <input
          id="vault-search"
          type="search"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>

      {loading ? (
        <p className="empty-state">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">{t(`vault.empty.${category}`)}</p>
      ) : (
        <TabularList
          showThumbnails={IMAGE_CATEGORIES.has(category)}
          campaignId={campaignId}
          entries={filtered}
          onActivate={onOpenEntity}
        />
      )}
    </div>
  );
}
