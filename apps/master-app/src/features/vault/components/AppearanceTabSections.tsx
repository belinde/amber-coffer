import type { Appearance, Campaign, ImageRef } from '@amber/shared';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ImageRefField } from './ImageRefField.js';
import { RichTextArea } from './RichTextArea.js';
import { SectionPanel } from './SectionPanel.js';
import { VisualPromptEditor } from './VisualPromptEditor.js';

type Props = {
  campaignId: Campaign['id'];
  appearance: Appearance;
  image: ImageRef | null | undefined;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  linkedImages: ReactNode;
  onAppearanceChange: (appearance: Appearance) => void;
  onImageChange: (image: ImageRef | null | undefined) => void;
  onOpenImages?: (() => void) | undefined;
};

/** Appearance tab: description, visual reference, and linked images as sub-panels. */
export function AppearanceTabSections({
  campaignId,
  appearance,
  image,
  fieldErrors,
  linkedImages,
  onAppearanceChange,
  onImageChange,
  onOpenImages,
}: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="vault-appearance-tab">
      <SectionPanel titleKey="vault.sections.appearance" helpKey="vault.appearanceHint">
        <RichTextArea
          labelKey="vault.fields.appearanceDescription"
          fieldPath="appearance.description"
          fieldErrors={fieldErrors}
          value={appearance.description}
          onChange={(description) => onAppearanceChange({ ...appearance, description })}
        />
      </SectionPanel>
      <SectionPanel titleKey="vault.sections.visual">
        <VisualPromptEditor
          fieldErrors={fieldErrors}
          value={appearance.visualReference.prompt}
          onChange={(prompt) =>
            onAppearanceChange({
              ...appearance,
              visualReference: { prompt },
            })
          }
        />
        <ImageRefField
          campaignId={campaignId}
          fieldErrors={fieldErrors}
          value={image}
          onChange={onImageChange}
          {...(onOpenImages ? { onOpenImages } : {})}
        />
        <p className="vault-section-help">{t('vault.portraitVsArchiveHint')}</p>
      </SectionPanel>
      {linkedImages}
    </div>
  );
}
