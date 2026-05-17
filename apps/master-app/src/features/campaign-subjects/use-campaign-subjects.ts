import type { Campaign } from '@amber/shared';
import { useEffect, useMemo, useState } from 'react';

import { filterSubjectsByQuery } from './filter-subjects.js';
import { loadCampaignSubjects } from './load-campaign-subjects.js';
import type { CampaignSubjectOption } from './types.js';

type Result = {
  loading: boolean;
  options: CampaignSubjectOption[];
  optionsForKind: (kind: string) => CampaignSubjectOption[];
  labelFor: (kind: string, id: string) => string | undefined;
};

export function useCampaignSubjects(campaignId: Campaign['id']): Result {
  const [options, setOptions] = useState<CampaignSubjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadCampaignSubjects(campaignId)
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

  const optionsForKind = useMemo(() => {
    const byKind = new Map<string, CampaignSubjectOption[]>();
    for (const opt of options) {
      const list = byKind.get(opt.kind) ?? [];
      list.push(opt);
      byKind.set(opt.kind, list);
    }
    return (kind: string) => byKind.get(kind) ?? [];
  }, [options]);

  const labelFor = useMemo(() => {
    const index = new Map(options.map((o) => [`${o.kind}:${o.id}`, o.label] as const));
    return (kind: string, id: string) => index.get(`${kind}:${id}`);
  }, [options]);

  return { loading, options, optionsForKind, labelFor };
}

export { filterSubjectsByQuery };
