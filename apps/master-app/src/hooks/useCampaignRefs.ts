import type { Campaign, Faction, Location } from '@amber/shared';
import { useCallback, useEffect, useState } from 'react';

import { listFactions } from '../bridge/factions.js';
import { listLocations } from '../bridge/locations.js';

type CampaignId = Campaign['id'];

export function useCampaignRefs(campaignId: CampaignId): {
  locations: Location[];
  factions: Faction[];
  loading: boolean;
} {
  const [locations, setLocations] = useState<Location[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locRows, factionRows] = await Promise.all([
        listLocations(campaignId),
        listFactions(campaignId),
      ]);
      setLocations(locRows);
      setFactions(factionRows);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { locations, factions, loading };
}
