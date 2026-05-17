import type { Campaign, CampaignImage } from '@amber/shared';
import { useCallback, useEffect, useState } from 'react';

import { listCampaignImages } from '../../bridge/campaign-images.js';

type State = {
  images: CampaignImage[];
  loading: boolean;
  error: string | null;
};

export function useCampaignImages(campaignId: Campaign['id']): State & { reload: () => void } {
  const [state, setState] = useState<State>({
    images: [],
    loading: true,
    error: null,
  });

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    void listCampaignImages(campaignId)
      .then((images) => setState({ images, loading: false, error: null }))
      .catch((err) =>
        setState({
          images: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
