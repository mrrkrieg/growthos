import fs from 'node:fs';
import { CONFIG_PATH, ensureAppDirs } from './config.js';

export interface GrowthClawConfig {
  dashboard: {
    port: number;
  };
  safeMode: {
    draftOnly: boolean;
    allowForceMoves: boolean;
  };
  limits: {
    maxRetries: number;
  };
  cron: {
    strategyEvolution: {
      times: string[];
    };
  };
  integrations: {
    openclawCron: 'auto' | 'system';
  };
}

const DEFAULT_CONFIG: GrowthClawConfig = {
  dashboard: {
    port: 3333
  },
  safeMode: {
    draftOnly: true,
    allowForceMoves: false
  },
  limits: {
    maxRetries: 2
  },
  cron: {
    strategyEvolution: {
      times: ['09:00', '13:00', '17:00']
    }
  },
  integrations: {
    openclawCron: 'auto'
  }
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeObjects(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };

  for (const key of Object.keys(patch)) {
    const patchValue = patch[key];
    if (patchValue === undefined) continue;

    const baseValue = out[key];
    if (isObject(baseValue) && isObject(patchValue)) {
      out[key] = deepMergeObjects(baseValue, patchValue);
    } else {
      out[key] = patchValue;
    }
  }

  return out;
}

export function getConfig(): GrowthClawConfig {
  ensureAppDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GrowthClawConfig>;
    return deepMergeObjects(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      parsed as Record<string, unknown>
    ) as unknown as GrowthClawConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function updateConfig(patch: Partial<GrowthClawConfig>): GrowthClawConfig {
  const merged = deepMergeObjects(
    getConfig() as unknown as Record<string, unknown>,
    patch as Record<string, unknown>
  ) as unknown as GrowthClawConfig;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function nextRunTimes(times: string[], count = 5): string[] {
  const now = new Date();
  const upcoming: Date[] = [];
  const parsed = times
    .map((t) => {
      const [h, m] = t.split(':').map(Number);
      return { h, m };
    })
    .filter((x) => Number.isInteger(x.h) && Number.isInteger(x.m));

  let cursor = new Date(now);
  while (upcoming.length < count) {
    for (const t of parsed) {
      const candidate = new Date(cursor);
      candidate.setHours(t.h, t.m, 0, 0);
      if (candidate > now) {
        upcoming.push(candidate);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  upcoming.sort((a, b) => a.getTime() - b.getTime());
  return upcoming.slice(0, count).map((d) => d.toISOString());
}
