import type { Character } from '@amber/shared';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  characters: Character[];
  value: string | null;
  disabled?: boolean;
  onChange: (playerDiscordId: string | null) => void;
};

/**
 * Assigns token drag control to a campaign player already linked via Character.playerDiscordId.
 * Guild roster pickers are avoided here because the backend only accepts linked Discord IDs.
 */
export function TabletopControllerPicker({
  characters,
  value,
  disabled = false,
  onChange,
}: Props): ReactElement {
  const { t } = useTranslation();

  const linkedCharacters = useMemo(() => characters.filter((c) => c.playerDiscordId), [characters]);

  const valueInRoster = value ? linkedCharacters.some((c) => c.playerDiscordId === value) : true;

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t('sessions.tabletop.controllerNone')}</option>
      {!valueInRoster && value ? (
        <option value={value}>{t('sessions.tabletop.controllerUnlinked', { id: value })}</option>
      ) : null}
      {linkedCharacters.map((character) => (
        <option key={character.id} value={character.playerDiscordId ?? ''}>
          {character.name}
        </option>
      ))}
    </select>
  );
}
