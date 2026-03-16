import { describe, it, expect } from 'vitest';
import { buildAdapterConfig } from './adapter-config-builder';
import type { AdapterCard } from '../schemas/card';

describe('buildAdapterConfig', () => {
  it('produces valid JSON string', () => {
    const card: AdapterCard = {
      platforms: [
        { platform: 'discord', enabled: true, role: 'community support' },
        { platform: 'x', enabled: true, role: 'announcements' },
      ],
      version: 2,
    };
    const result = buildAdapterConfig(card);
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('maps all platform fields correctly', () => {
    const card: AdapterCard = {
      platforms: [
        { platform: 'telegram', enabled: true, role: 'notifications' },
      ],
      version: 1,
    };
    const parsed = JSON.parse(buildAdapterConfig(card)) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].platform).toBe('telegram');
    expect(parsed[0].enabled).toBe(true);
    expect(parsed[0].role).toBe('notifications');
  });

  it('includes disabled platforms', () => {
    const card: AdapterCard = {
      platforms: [
        { platform: 'discord', enabled: false, role: '' },
      ],
      version: 1,
    };
    const parsed = JSON.parse(buildAdapterConfig(card)) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].enabled).toBe(false);
  });

  it('handles empty platforms', () => {
    const card: AdapterCard = {
      platforms: [],
      version: 1,
    };
    const parsed = JSON.parse(buildAdapterConfig(card)) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(0);
  });

  it('handles multiple platforms', () => {
    const card: AdapterCard = {
      platforms: [
        { platform: 'x', enabled: true, role: 'posting' },
        { platform: 'discord', enabled: true, role: 'support' },
        { platform: 'telegram', enabled: false, role: '' },
        { platform: 'owned_page', enabled: true, role: 'blog' },
      ],
      version: 3,
    };
    const parsed = JSON.parse(buildAdapterConfig(card)) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(4);
    expect(parsed.map((p) => p.platform)).toEqual(['x', 'discord', 'telegram', 'owned_page']);
  });
});
