import type { GameStatsRecord } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

type Props = {
  value: GameStatsRecord;
  onChange: (value: GameStatsRecord) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

export function GameStatsEditor({ value, onChange, fieldErrors }: Props): ReactElement {
  const { t } = useTranslation();
  const entries = Object.entries(value);
  const blockError = fieldErrorAt(fieldErrors, 'gameStats');

  function updateKey(oldKey: string, newKey: string, val: string): void {
    const next: GameStatsRecord = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === oldKey) {
        if (newKey.trim()) next[newKey.trim()] = parseVal(val);
      } else {
        next[k] = v;
      }
    }
    onChange(next);
  }

  function updateVal(key: string, val: string): void {
    onChange({ ...value, [key]: parseVal(val) });
  }

  function removeKey(key: string): void {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function addRow(): void {
    let i = 1;
    let key = 'field';
    while (key in value) {
      i += 1;
      key = `field${i}`;
    }
    onChange({ ...value, [key]: '' });
  }

  return (
    <div className={blockError ? 'vault-kv-editor field field--invalid' : 'vault-kv-editor'}>
      {blockError ? (
        <p className="field-error" role="alert">
          {blockError}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="empty-state">{t('vault.gameStatsEmpty')}</p>
      ) : null}
      {entries.map(([key, val]) => (
        <div key={key} className="vault-kv-row">
          <input
            type="text"
            value={key}
            aria-label={t('vault.fields.statKey')}
            aria-invalid={Boolean(fieldErrorAt(fieldErrors, `gameStats.${key}`))}
            onChange={(ev) => updateKey(key, ev.target.value, String(val ?? ''))}
          />
          <input
            type="text"
            value={val === null ? '' : String(val)}
            aria-label={t('vault.fields.statValue')}
            aria-invalid={Boolean(fieldErrorAt(fieldErrors, `gameStats.${key}`))}
            onChange={(ev) => updateVal(key, ev.target.value)}
          />
          <Button type="button" variant="danger" icon={ActionIcons.delete} onClick={() => removeKey(key)}>
            {t('common.delete')}
          </Button>
        </div>
      ))}
      <Button type="button" icon={ActionIcons.add} onClick={addRow}>
        {t('vault.addStat')}
      </Button>
    </div>
  );
}

function parseVal(raw: string): string | number | boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const n = Number(raw);
  if (raw !== '' && !Number.isNaN(n)) return n;
  return raw;
}
