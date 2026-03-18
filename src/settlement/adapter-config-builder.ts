import type { AdapterCard } from '../schemas/card';

interface AdapterConfigEntry {
  platform: string;
  enabled: boolean;
  role: string;
}

export function buildAdapterConfig(card: AdapterCard): string {
  const entries: AdapterConfigEntry[] = card.platforms.map((p) => ({
    platform: p.platform,
    enabled: p.enabled,
    role: p.role,
  }));

  return JSON.stringify(entries, null, 2);
}
