import type { Appearance, Campaign, ImageLinkKind, ImageRef } from '@amber/shared';
import type { ReactElement } from 'react';

import { RichTextArea } from './RichTextArea.js';
import { SectionPanel } from './SectionPanel.js';
import { SubjectImageGallery } from './SubjectImageGallery.js';
import { VisualPromptEditor } from './VisualPromptEditor.js';

type Props = {
  campaignId: Campaign['id'];
  linkKind: ImageLinkKind;
  entityId: string;
  appearance: Appearance;
  image: ImageRef | null | undefined;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  onAppearanceChange: (appearance: Appearance) => void;
  onImageChange: (image: ImageRef | null | undefined) => void;
  onError?: (message: string) => void;
};

/** Appearance tab: description, visual reference, and linked image gallery. */
export function AppearanceTabSections({
  campaignId,
  linkKind,
  entityId,
  appearance,
  image,
  fieldErrors,
  onAppearanceChange,
  onImageChange,
  onError,
}: Props): ReactElement {
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
        <SubjectImageGallery
          campaignId={campaignId}
          linkKind={linkKind}
          entityId={entityId}
          portraitImage={image}
          onPortraitChange={onImageChange}
          {...(onError ? { onError } : {})}
        />
      </SectionPanel>
    </div>
  );
}
