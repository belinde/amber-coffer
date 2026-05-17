import type { Campaign, ImageLink, ImageLinkKind } from '@amber/shared';
import { imageLinkKindSchema } from '@amber/shared';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { SubjectPicker } from '../../components/ui/SubjectPicker.js';
import { TabularList } from '../../components/ui/TabularList.js';
import { loadImageLinkSubjects } from '../campaign-subjects/load-image-link-subjects.js';

type Props = {
  campaignId: Campaign['id'];
  value: ImageLink[];
  onChange: (value: ImageLink[]) => void;
};

const LINK_KINDS = imageLinkKindSchema.options;

function linkKey(ref: ImageLink): string {
  return `${ref.kind}:${ref.id}`;
}

export function ImageLinkPicker({ campaignId, value, onChange }: Props): ReactElement {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadImageLinkSubjects>>>([]);
  const [loading, setLoading] = useState(true);
  const [draftKind, setDraftKind] = useState<ImageLinkKind>('character');
  const [draftId, setDraftId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadImageLinkSubjects(campaignId)
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const labelFor = useMemo(() => {
    const index = new Map(options.map((o) => [`${o.kind}:${o.id}`, o.label] as const));
    return (kind: string, id: string) => index.get(`${kind}:${id}`);
  }, [options]);

  const entries = useMemo(
    () =>
      value.map((ref) => ({
        id: linkKey(ref),
        row: {
          title: labelFor(ref.kind, ref.id) ?? ref.id,
          subtitle: t(`vault.imageLinkKind.${ref.kind}`),
        },
      })),
    [value, labelFor, t],
  );

  function addLink(): void {
    if (!draftId) return;
    if (value.some((r) => r.kind === draftKind && r.id === draftId)) return;
    onChange([...value, { kind: draftKind, id: draftId } as ImageLink]);
    setDraftId('');
  }

  function removeLink(key: string): void {
    onChange(value.filter((r) => linkKey(r) !== key));
  }

  return (
    <div className="vault-list-editor">
      <SubjectPicker
        campaignId={campaignId}
        allowedKinds={LINK_KINDS}
        kind={draftKind}
        subjectId={draftId}
        subjectOptions={options}
        subjectOptionsLoading={loading}
        onKindChange={(k) => {
          if (k !== '') setDraftKind(k);
        }}
        onSubjectIdChange={setDraftId}
        translateKind={(k) => t(`vault.imageLinkKind.${k}`)}
        kindLabel={t('vault.fields.linkKind')}
        subjectLabel={t('vault.fields.linkSubject')}
        subjectTrailing={
          <Button
            type="button"
            className="subject-picker__add-btn"
            icon={ActionIcons.add}
            disabled={!draftId}
            onClick={addLink}
          >
            {t('vault.fields.addLink')}
          </Button>
        }
      />
      {entries.length > 0 ? (
        <TabularList
          showThumbnails={false}
          entries={entries}
          renderActions={(key) => (
            <Button
              type="button"
              variant="danger"
              icon={ActionIcons.delete}
              onClick={() => removeLink(key)}
            >
              {t('common.delete')}
            </Button>
          )}
        />
      ) : null}
    </div>
  );
}
