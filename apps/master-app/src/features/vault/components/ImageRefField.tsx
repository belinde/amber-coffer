import type { Campaign, ImageRef } from '@amber/shared';
import type { ReactElement } from 'react';

import { CampaignImagePicker } from '../../images/CampaignImagePicker.js';

type Props = {
  campaignId: Campaign['id'];
  value: ImageRef | null | undefined;
  onChange: (value: ImageRef | null) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  onOpenImages?: (() => void) | undefined;
};

export function ImageRefField({
  campaignId,
  value,
  onChange,
  fieldErrors,
  onOpenImages,
}: Props): ReactElement {
  return (
    <CampaignImagePicker
      campaignId={campaignId}
      value={value}
      onChange={onChange}
      fieldErrors={fieldErrors}
      {...(onOpenImages ? { onOpenImages } : {})}
    />
  );
}
