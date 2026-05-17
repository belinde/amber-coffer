import type { Campaign } from '@amber/shared';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CampaignSubjectOption } from '../../features/campaign-subjects/types.js';
import {
  filterSubjectsByQuery,
  useCampaignSubjects,
} from '../../features/campaign-subjects/use-campaign-subjects.js';

import { Field } from './Field.js';

type Props<K extends string> = {
  campaignId: Campaign['id'];
  allowedKinds: readonly K[];
  kind: K | '';
  subjectId: string;
  onKindChange: (kind: K | '') => void;
  onSubjectIdChange: (id: string) => void;
  translateKind: (kind: K) => string;
  kindLabel: string;
  subjectLabel: string;
  allowEmptyKind?: boolean;
  required?: boolean;
  idPrefix?: string;
  kindError?: string | undefined;
  subjectIdError?: string | undefined;
  /** When set, replaces campaign-wide subjects (e.g. image links without factions). */
  subjectOptions?: CampaignSubjectOption[];
  subjectOptionsLoading?: boolean;
  /** Placed beside the subject combobox (e.g. an add-link button). */
  subjectTrailing?: ReactNode;
};

export function SubjectPicker<K extends string>({
  campaignId,
  allowedKinds,
  kind,
  subjectId,
  onKindChange,
  onSubjectIdChange,
  translateKind,
  kindLabel,
  subjectLabel,
  allowEmptyKind = false,
  required = false,
  kindError,
  subjectIdError,
  subjectOptions,
  subjectOptionsLoading,
  subjectTrailing,
}: Props<K>): ReactElement {
  const { t } = useTranslation();
  const campaignSubjects = useCampaignSubjects(campaignId);
  const loading = subjectOptionsLoading ?? campaignSubjects.loading;
  const optionsForKind = (k: string) =>
    subjectOptions
      ? subjectOptions.filter((o) => o.kind === k)
      : campaignSubjects.optionsForKind(k);
  const labelFor = (k: string, id: string) =>
    subjectOptions
      ? subjectOptions.find((o) => o.kind === k && o.id === id)?.label
      : campaignSubjects.labelFor(k, id);
  const kindSelectId = useId();
  const subjectInputId = useId();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const kindOptions = optionsForKind(kind);
  const filtered = filterSubjectsByQuery(kindOptions, query);
  const selectedLabel = kind && subjectId ? labelFor(kind, subjectId) : undefined;

  useEffect(() => {
    if (!kind || !subjectId) return;
    if (kindOptions.length > 0 && !kindOptions.some((o) => o.id === subjectId)) {
      onSubjectIdChange('');
    }
  }, [kind, subjectId, kindOptions, onSubjectIdChange]);

  useEffect(() => {
    function onDocPointer(ev: PointerEvent): void {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, []);

  function handleKindChange(nextKind: string): void {
    onKindChange((nextKind || '') as K | '');
    onSubjectIdChange('');
    setQuery('');
    setOpen(false);
  }

  function selectSubject(id: string, label: string): void {
    onSubjectIdChange(id);
    setQuery(label);
    setOpen(false);
  }

  const inputValue = open ? query : (query || selectedLabel || '');

  return (
    <div className="subject-picker" ref={rootRef}>
      <Field label={kindLabel} htmlFor={kindSelectId} error={kindError}>
        <select
          id={kindSelectId}
          value={kind}
          onChange={(ev) => handleKindChange(ev.target.value)}
        >
          {allowEmptyKind ? <option value="">{t('common.none')}</option> : null}
          {allowedKinds.map((k) => (
            <option key={k} value={k}>
              {translateKind(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={subjectLabel} htmlFor={subjectInputId} error={subjectIdError}>
        <div className="subject-picker__subject-row">
          <div className="subject-picker-autocomplete">
          <input
            id={subjectInputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            disabled={!kind || loading}
            required={required && Boolean(kind)}
            placeholder={
              loading
                ? t('subject.loading')
                : !kind
                  ? t('subject.selectKindFirst')
                  : t('subject.searchPlaceholder')
            }
            value={inputValue}
            onChange={(ev) => {
              setQuery(ev.target.value);
              setOpen(true);
              if (!ev.target.value.trim()) onSubjectIdChange('');
            }}
            onFocus={() => {
              setQuery(selectedLabel ?? '');
              setOpen(true);
            }}
          />
          {open && kind && !loading ? (
            <ul id={listboxId} className="subject-autocomplete-list" role="listbox">
              {filtered.length === 0 ? (
                <li className="subject-autocomplete-empty" role="option">
                  {t('subject.noResults')}
                </li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt.id} role="option">
                    <button
                      type="button"
                      className="subject-autocomplete-option"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => selectSubject(opt.id, opt.label)}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          </div>
          {subjectTrailing}
        </div>
      </Field>
    </div>
  );
}
