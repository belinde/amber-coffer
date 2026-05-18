import type { Campaign, Location, NarrativeSeed, Npc, Session } from '@amber/shared';
import type { ReactElement, FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listLocations } from '../../bridge/locations.js';
import { listNarrativeSeeds } from '../../bridge/narrative-seeds.js';
import { listNpcs } from '../../bridge/npcs.js';
import { updateSessionPrep } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { useVaultNavigationContext } from '../vault/VaultNavigationContext.js';

type Props = {
  campaignId: Campaign['id'];
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onOpenImages: () => void;
};

export function SessionPrepPanel({
  campaignId,
  session,
  onSessionUpdated,
  onError,
  onOpenImages,
}: Props): ReactElement {
  const { t } = useTranslation();
  const { pushView } = useVaultNavigationContext();
  const [title, setTitle] = useState(session.title ?? '');
  const [gmNotes, setGmNotes] = useState(session.gmNotes);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [seeds, setSeeds] = useState<NarrativeSeed[]>([]);
  const [saving, setSaving] = useState(false);

  const loadRefs = useCallback(async () => {
    try {
      const [npcRows, locationRows, seedRows] = await Promise.all([
        listNpcs(campaignId),
        listLocations(campaignId),
        listNarrativeSeeds(campaignId),
      ]);
      setNpcs(npcRows);
      setLocations(locationRows);
      setSeeds(seedRows.filter((s) => s.status === 'planned'));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId, onError]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    setTitle(session.title ?? '');
    setGmNotes(session.gmNotes);
  }, [session]);

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleSave(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    try {
      onSessionUpdated(
        await updateSessionPrep({
          id: session.id,
          number: session.number,
          title: title.trim() || null,
          status: session.status,
          gmNotes,
          locationsVisited: session.locationsVisited,
          npcsEncountered: session.npcsEncountered,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function savePins(npcsEncountered: string[], locationsVisited: string[]): Promise<void> {
    try {
      onSessionUpdated(
        await updateSessionPrep({
          id: session.id,
          number: session.number,
          title: session.title,
          status: session.status,
          gmNotes: session.gmNotes,
          npcsEncountered,
          locationsVisited,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="session-prep" aria-labelledby="session-prep-heading">
      <h3 id="session-prep-heading">{t('sessionDetail.prepTitle')}</h3>

      <form className="session-prep__form" onSubmit={(ev) => void handleSave(ev)}>
        <label className="field">
          <span>{t('session.title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('sessionDetail.prepGmNotes')}</span>
          <textarea rows={5} value={gmNotes} onChange={(e) => setGmNotes(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" icon={ActionIcons.save} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </form>

      <div className="session-prep__pins">
        <h4>{t('sessionDetail.prepPinnedNpcs')}</h4>
        <ul className="session-prep__checklist">
          {npcs.map((npc) => (
            <li key={npc.id}>
              <label>
                <input
                  type="checkbox"
                  checked={session.npcsEncountered.includes(npc.id)}
                  onChange={() => {
                    void savePins(
                      toggleId(session.npcsEncountered, npc.id),
                      session.locationsVisited,
                    );
                  }}
                />
                {npc.name}
              </label>
            </li>
          ))}
        </ul>
        <h4>{t('sessionDetail.prepPinnedLocations')}</h4>
        <ul className="session-prep__checklist">
          {locations.map((loc) => (
            <li key={loc.id}>
              <label>
                <input
                  type="checkbox"
                  checked={session.locationsVisited.includes(loc.id)}
                  onChange={() => {
                    void savePins(
                      session.npcsEncountered,
                      toggleId(session.locationsVisited, loc.id),
                    );
                  }}
                />
                {loc.name}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {seeds.length > 0 ? (
        <div className="session-prep__seeds">
          <h4>{t('sessionDetail.prepSeeds')}</h4>
          <ul>
            {seeds.map((seed) => (
              <li key={seed.id}>{seed.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="session-prep__links">
        <Button type="button" onClick={() => pushView({ kind: 'category', category: 'npcs' })}>
          {t('sessionDetail.prepOpenVaultNpcs')}
        </Button>
        <Button type="button" onClick={() => pushView({ kind: 'category', category: 'locations' })}>
          {t('sessionDetail.prepOpenVaultLocations')}
        </Button>
        <Button type="button" onClick={onOpenImages}>
          {t('sessionDetail.prepOpenImages')}
        </Button>
      </div>

      <p className="vault-section-help">{t('sessionDetail.prepHandoutsPlaceholder')}</p>
    </section>
  );
}
