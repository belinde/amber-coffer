import type { Campaign, Visibility } from '@amber/shared';
import {
  characterStatusSchema,
  factionKindSchema,
  loreNoteKindSchema,
  narrativeSeedStatusSchema,
  npcDispositionSchema,
  npcRecordKindSchema,
  npcStatusSchema,
} from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { CreateCharacterInput } from '../../bridge/characters.js';
import type { CreateFactionInput } from '../../bridge/factions.js';
import type { CreateLocationInput } from '../../bridge/locations.js';
import type { CreateLoreNoteInput } from '../../bridge/lore-notes.js';
import type { CreateNarrativeSeedInput } from '../../bridge/narrative-seeds.js';
import type { CreateNpcInput } from '../../bridge/npcs.js';
import { Field } from '../../components/ui/Field.js';
import { vaultCategoryToImageLinkKind } from '../images/campaign-image-links.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

import { AppearanceTabSections } from './components/AppearanceTabSections.js';
import { DiscordPlayerPicker } from './components/DiscordPlayerPicker.js';
import { EntityRefPicker } from './components/EntityRefPicker.js';
import { EventsInterestingEditor } from './components/EventsInterestingEditor.js';
import { GameStatsEditor } from './components/GameStatsEditor.js';
import { ImageRefField } from './components/ImageRefField.js';
import { LocationSectionsEditor } from './components/LocationSectionsEditor.js';
import { RichTextArea } from './components/RichTextArea.js';
import { SectionPanel } from './components/SectionPanel.js';
import { VisibilityControl } from './components/VisibilityControl.js';
import type { SectionId } from './entity-sections.config.js';
import { NEW_ENTITY_ID, type VaultCategory } from './vault-categories.js';
import type { VaultEntity } from './vault-entity-api.js';

type Props = {
  campaign: Campaign;
  category: VaultCategory;
  entityId: string;
  sectionId: SectionId;
  draft: VaultEntity;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  onChange: (next: VaultEntity) => void;
  onOpenSessions?: (() => void) | undefined;
  onOpenImages?: (() => void) | undefined;
  onConfigureDiscord?: (() => void) | undefined;
  onError?: (message: string) => void;
};

export function VaultEntitySections({
  campaign,
  category,
  entityId,
  sectionId,
  draft,
  fieldErrors,
  onChange,
  onOpenSessions,
  onOpenImages,
  onConfigureDiscord,
  onError,
}: Props): ReactElement | null {
  const campaignId = campaign.id;
  const { t } = useTranslation();
  const fe = (fieldPath: string) => fieldErrorAt(fieldErrors, fieldPath);

  const linkKind = vaultCategoryToImageLinkKind(category);

  if (category === 'characters') {
    const d = draft as CreateCharacterInput;
    switch (sectionId) {
      case 'identity':
        return (
          <SectionPanel titleKey="vault.sections.identity">
            <Field label={t('character.name')} error={fe('name')}>
              <input value={d.name} onChange={(ev) => onChange({ ...d, name: ev.target.value })} />
            </Field>
            <Field label={t('character.playerDiscordId')} error={fe('playerDiscordId')}>
              <DiscordPlayerPicker
                campaign={campaign}
                characterId={entityId === NEW_ENTITY_ID ? undefined : entityId}
                value={d.playerDiscordId ?? null}
                onChange={(playerDiscordId) => onChange({ ...d, playerDiscordId })}
                error={fe('playerDiscordId')}
                onConfigureDiscord={onConfigureDiscord}
              />
            </Field>
            <Field label={t('vault.fields.species')} error={fe('species')}>
              <input
                value={d.species ?? ''}
                onChange={(ev) => onChange({ ...d, species: ev.target.value || null })}
              />
            </Field>
            <Field label={t('vault.fields.roleHint')} error={fe('roleHint')}>
              <input
                value={d.roleHint ?? ''}
                onChange={(ev) => onChange({ ...d, roleHint: ev.target.value || null })}
              />
            </Field>
            <Field label={t('character.statusLabel')} error={fe('status')}>
              <select
                value={d.status}
                onChange={(ev) =>
                  onChange({ ...d, status: ev.target.value as CreateCharacterInput['status'] })
                }
              >
                {characterStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`character.statusValues.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <VisibilityControl
              fieldErrors={fieldErrors}
              value={d.visibility}
              onChange={(visibility) => onChange({ ...d, visibility })}
            />
          </SectionPanel>
        );
      case 'appearance':
        return linkKind ? (
          <AppearanceTabSections
            campaignId={campaignId}
            linkKind={linkKind}
            entityId={entityId}
            appearance={d.appearance}
            image={d.image}
            fieldErrors={fieldErrors}
            onAppearanceChange={(appearance) => onChange({ ...d, appearance })}
            onImageChange={(image) => onChange({ ...d, image })}
            {...(onError ? { onError } : {})}
          />
        ) : null;
      case 'equipment':
        return (
          <SectionPanel titleKey="vault.sections.equipment">
            <RichTextArea
              labelKey="vault.fields.notableEquipment"
              fieldPath="notableEquipment"
              fieldErrors={fieldErrors}
              value={d.notableEquipment.join('\n')}
              onChange={(raw) =>
                onChange({
                  ...d,
                  notableEquipment: raw.split('\n').filter((line) => line.trim()),
                })
              }
            />
          </SectionPanel>
        );
      case 'gameStats':
        return (
          <SectionPanel titleKey="vault.sections.gameStats">
            <GameStatsEditor
              fieldErrors={fieldErrors}
              value={d.gameStats}
              onChange={(gameStats) => onChange({ ...d, gameStats })}
            />
          </SectionPanel>
        );
      case 'events':
        return (
          <SectionPanel titleKey="vault.sections.events">
            <EventsInterestingEditor
              campaignId={campaignId}
              value={d.eventsInteresting}
              fieldErrors={fieldErrors}
              onOpenSessions={onOpenSessions}
              onChange={(eventsInteresting) => onChange({ ...d, eventsInteresting })}
            />
          </SectionPanel>
        );
      case 'gmNotes':
        return (
          <SectionPanel titleKey="vault.sections.gmNotes">
            <RichTextArea
              labelKey="vault.fields.gmNotes"
              fieldPath="gmNotes"
              fieldErrors={fieldErrors}
              value={d.gmNotes}
              onChange={(gmNotes) => onChange({ ...d, gmNotes })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  if (category === 'npcs') {
    const d = draft as CreateNpcInput;
    switch (sectionId) {
      case 'identity':
        return (
          <SectionPanel titleKey="vault.sections.identity">
            <Field label={t('npc.name')} error={fe('name')}>
              <input value={d.name} onChange={(ev) => onChange({ ...d, name: ev.target.value })} />
            </Field>
            <Field label={t('npc.statusLabel')} error={fe('status')}>
              <select
                value={d.status}
                onChange={(ev) =>
                  onChange({ ...d, status: ev.target.value as CreateNpcInput['status'] })
                }
              >
                {npcStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`npc.statusValues.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('npc.disposition')} error={fe('disposition')}>
              <select
                value={d.disposition ?? ''}
                onChange={(ev) =>
                  onChange({
                    ...d,
                    disposition: (ev.target.value || null) as CreateNpcInput['disposition'],
                  })
                }
              >
                <option value="">{t('common.none')}</option>
                {npcDispositionSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`npc.dispositionValues.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('vault.fields.recordKind')} error={fe('recordKind')}>
              <select
                value={d.recordKind}
                onChange={(ev) =>
                  onChange({
                    ...d,
                    recordKind: ev.target.value as CreateNpcInput['recordKind'],
                  })
                }
              >
                {npcRecordKindSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`vault.recordKind.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <VisibilityControl
              fieldErrors={fieldErrors}
              value={d.visibility}
              onChange={(visibility: Visibility) => onChange({ ...d, visibility })}
            />
          </SectionPanel>
        );
      case 'operational':
        return (
          <SectionPanel titleKey="vault.sections.operational" helpKey="vault.operationalHint">
            <Field label={t('vault.fields.region')} error={fe('region')}>
              <input
                placeholder={t('vault.placeholders.region')}
                value={d.region ?? ''}
                onChange={(ev) => onChange({ ...d, region: ev.target.value || null })}
              />
            </Field>
            <Field label={t('vault.fields.scope')} error={fe('scope')}>
              <input
                placeholder={t('vault.placeholders.scope')}
                value={d.scope ?? ''}
                onChange={(ev) => onChange({ ...d, scope: ev.target.value || null })}
              />
            </Field>
            <Field label={t('vault.fields.reminder')} error={fe('reminder')}>
              <input
                placeholder={t('vault.placeholders.reminder')}
                value={d.reminder ?? ''}
                onChange={(ev) => onChange({ ...d, reminder: ev.target.value || null })}
              />
            </Field>
          </SectionPanel>
        );
      case 'appearance':
        return linkKind ? (
          <AppearanceTabSections
            campaignId={campaignId}
            linkKind={linkKind}
            entityId={entityId}
            appearance={d.appearance}
            image={d.image}
            fieldErrors={fieldErrors}
            onAppearanceChange={(appearance) => onChange({ ...d, appearance })}
            onImageChange={(image) => onChange({ ...d, image })}
            {...(onError ? { onError } : {})}
          />
        ) : null;
      case 'characterLinks':
        return (
          <SectionPanel titleKey="vault.sections.characterLinks">
            <p className="vault-section-help">{t('vault.characterLinksHint')}</p>
          </SectionPanel>
        );
      case 'equipment':
        return (
          <SectionPanel titleKey="vault.sections.equipment">
            <RichTextArea
              labelKey="vault.fields.notableEquipment"
              fieldPath="notableEquipment"
              fieldErrors={fieldErrors}
              value={d.notableEquipment.join('\n')}
              onChange={(raw) =>
                onChange({
                  ...d,
                  notableEquipment: raw.split('\n').filter((line) => line.trim()),
                })
              }
            />
          </SectionPanel>
        );
      case 'gameStats':
        return (
          <SectionPanel titleKey="vault.sections.gameStats">
            <GameStatsEditor
              fieldErrors={fieldErrors}
              value={d.gameStats}
              onChange={(gameStats) => onChange({ ...d, gameStats })}
            />
          </SectionPanel>
        );
      case 'events':
        return (
          <SectionPanel titleKey="vault.sections.events">
            <EventsInterestingEditor
              campaignId={campaignId}
              value={d.eventsInteresting}
              fieldErrors={fieldErrors}
              onOpenSessions={onOpenSessions}
              onChange={(eventsInteresting) => onChange({ ...d, eventsInteresting })}
            />
          </SectionPanel>
        );
      case 'gmNotes':
        return (
          <SectionPanel titleKey="vault.sections.gmNotes">
            <RichTextArea
              labelKey="vault.fields.gmNotes"
              fieldPath="gmNotes"
              fieldErrors={fieldErrors}
              value={d.gmNotes}
              onChange={(gmNotes) => onChange({ ...d, gmNotes })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  if (category === 'locations') {
    const d = draft as CreateLocationInput;
    switch (sectionId) {
      case 'identity':
        return (
          <SectionPanel titleKey="vault.sections.identity">
            <Field label={t('location.name')} error={fe('name')}>
              <input value={d.name} onChange={(ev) => onChange({ ...d, name: ev.target.value })} />
            </Field>
            <Field label={t('vault.fields.region')} error={fe('region')}>
              <input
                value={d.region ?? ''}
                onChange={(ev) => onChange({ ...d, region: ev.target.value || null })}
              />
            </Field>
            <Field label={t('location.kind')} error={fe('kind')}>
              <input
                value={d.kind ?? ''}
                onChange={(ev) => onChange({ ...d, kind: ev.target.value || null })}
              />
            </Field>
            <Field label={t('vault.fields.population')} error={fe('population')}>
              <input
                value={d.population ?? ''}
                onChange={(ev) => onChange({ ...d, population: ev.target.value || null })}
              />
            </Field>
            <VisibilityControl
              fieldErrors={fieldErrors}
              value={d.visibility}
              onChange={(visibility) => onChange({ ...d, visibility })}
            />
          </SectionPanel>
        );
      case 'appearance':
        return linkKind ? (
          <AppearanceTabSections
            campaignId={campaignId}
            linkKind={linkKind}
            entityId={entityId}
            appearance={d.appearance}
            image={d.image}
            fieldErrors={fieldErrors}
            onAppearanceChange={(appearance) => onChange({ ...d, appearance })}
            onImageChange={(image) => onChange({ ...d, image })}
            {...(onError ? { onError } : {})}
          />
        ) : null;
      case 'sections':
        return (
          <SectionPanel titleKey="vault.sections.freeSections">
            <LocationSectionsEditor
              fieldErrors={fieldErrors}
              value={d.sections}
              onChange={(sections) => onChange({ ...d, sections })}
            />
          </SectionPanel>
        );
      case 'events':
        return (
          <SectionPanel titleKey="vault.sections.events">
            <EventsInterestingEditor
              campaignId={campaignId}
              value={d.eventsInteresting}
              fieldErrors={fieldErrors}
              onOpenSessions={onOpenSessions}
              onChange={(eventsInteresting) => onChange({ ...d, eventsInteresting })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  if (category === 'factions') {
    const d = draft as CreateFactionInput;
    switch (sectionId) {
      case 'identity':
        return (
          <SectionPanel titleKey="vault.sections.identity">
            <Field label={t('faction.name')} error={fe('name')}>
              <input value={d.name} onChange={(ev) => onChange({ ...d, name: ev.target.value })} />
            </Field>
            <Field label={t('vault.fields.factionKind')} error={fe('kind')}>
              <select
                value={d.kind ?? ''}
                onChange={(ev) =>
                  onChange({
                    ...d,
                    kind: (ev.target.value || null) as CreateFactionInput['kind'],
                  })
                }
              >
                <option value="">{t('common.none')}</option>
                {factionKindSchema.options.map((k) => (
                  <option key={k} value={k}>
                    {t(`vault.factionKind.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <ImageRefField
              campaignId={campaignId}
              fieldErrors={fieldErrors}
              value={d.image}
              onChange={(image) => onChange({ ...d, image })}
              {...(onOpenImages ? { onOpenImages } : {})}
            />
          </SectionPanel>
        );
      case 'goals':
        return (
          <SectionPanel titleKey="vault.sections.goals">
            <RichTextArea
              labelKey="vault.fields.goals"
              fieldPath="goals"
              fieldErrors={fieldErrors}
              value={d.goals}
              onChange={(goals) => onChange({ ...d, goals })}
            />
            <RichTextArea
              labelKey="vault.fields.secrets"
              fieldPath="secrets"
              fieldErrors={fieldErrors}
              value={d.secrets}
              onChange={(secrets) => onChange({ ...d, secrets })}
            />
          </SectionPanel>
        );
      case 'events':
        return (
          <SectionPanel titleKey="vault.sections.events">
            <EventsInterestingEditor
              campaignId={campaignId}
              value={d.eventsInteresting}
              fieldErrors={fieldErrors}
              onOpenSessions={onOpenSessions}
              onChange={(eventsInteresting) => onChange({ ...d, eventsInteresting })}
            />
          </SectionPanel>
        );
      case 'visibility':
        return (
          <SectionPanel titleKey="vault.sections.visibility">
            <VisibilityControl
              fieldErrors={fieldErrors}
              value={d.visibility}
              onChange={(visibility) => onChange({ ...d, visibility })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  if (category === 'lore_notes') {
    const d = draft as CreateLoreNoteInput;
    switch (sectionId) {
      case 'metadata':
        return (
          <SectionPanel titleKey="vault.sections.metadata">
            <Field label={t('vault.fields.title')} error={fe('title')}>
              <input
                value={d.title}
                onChange={(ev) => onChange({ ...d, title: ev.target.value })}
              />
            </Field>
            <Field label={t('vault.fields.loreKind')} error={fe('kind')}>
              <select
                value={d.kind}
                onChange={(ev) =>
                  onChange({ ...d, kind: ev.target.value as CreateLoreNoteInput['kind'] })
                }
              >
                {loreNoteKindSchema.options.map((k) => (
                  <option key={k} value={k}>
                    {t(`vault.loreKind.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <RichTextArea
              labelKey="vault.fields.tags"
              fieldPath="tags"
              fieldErrors={fieldErrors}
              value={d.tags.join(', ')}
              onChange={(raw) =>
                onChange({
                  ...d,
                  tags: raw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </SectionPanel>
        );
      case 'body':
        return (
          <SectionPanel titleKey="vault.sections.body">
            <RichTextArea
              labelKey="vault.fields.body"
              fieldPath="body"
              fieldErrors={fieldErrors}
              value={d.body}
              onChange={(body) => onChange({ ...d, body })}
              rows={12}
            />
          </SectionPanel>
        );
      case 'links':
        return (
          <SectionPanel titleKey="vault.sections.links">
            <EntityRefPicker
              fieldErrors={fieldErrors}
              campaignId={campaignId}
              value={d.linkedEntities}
              onChange={(linkedEntities) => onChange({ ...d, linkedEntities })}
            />
          </SectionPanel>
        );
      case 'visibility':
        return (
          <SectionPanel titleKey="vault.sections.visibility">
            <VisibilityControl
              fieldErrors={fieldErrors}
              value={d.visibility}
              onChange={(visibility) => onChange({ ...d, visibility })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  if (category === 'narrative_seeds') {
    const d = draft as CreateNarrativeSeedInput;
    switch (sectionId) {
      case 'idea':
        return (
          <SectionPanel titleKey="vault.sections.idea">
            <Field label={t('vault.fields.title')} error={fe('title')}>
              <input
                value={d.title}
                onChange={(ev) => onChange({ ...d, title: ev.target.value })}
              />
            </Field>
            <Field label={t('vault.fields.seedStatus')} error={fe('status')}>
              <select
                value={d.status}
                onChange={(ev) =>
                  onChange({ ...d, status: ev.target.value as CreateNarrativeSeedInput['status'] })
                }
              >
                {narrativeSeedStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`vault.seedStatus.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <RichTextArea
              labelKey="vault.fields.summary"
              fieldPath="summary"
              fieldErrors={fieldErrors}
              value={d.summary}
              onChange={(summary) => onChange({ ...d, summary })}
            />
          </SectionPanel>
        );
      case 'body':
        return (
          <SectionPanel titleKey="vault.sections.detail">
            <RichTextArea
              labelKey="vault.fields.body"
              fieldPath="body"
              fieldErrors={fieldErrors}
              value={d.body ?? ''}
              onChange={(body) => onChange({ ...d, body: body || null })}
              rows={12}
            />
          </SectionPanel>
        );
      case 'links':
        return (
          <SectionPanel titleKey="vault.sections.links">
            <EntityRefPicker
              fieldErrors={fieldErrors}
              campaignId={campaignId}
              value={d.linkedEntities}
              onChange={(linkedEntities) => onChange({ ...d, linkedEntities })}
            />
          </SectionPanel>
        );
      default:
        return null;
    }
  }

  return null;
}
