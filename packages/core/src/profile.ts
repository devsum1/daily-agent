import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Profile } from './types';

let cached: Profile | null = null;

/** Load + lightly validate config/profile.json. */
export function loadProfile(path = process.env.PROFILE_PATH ?? './config/profile.json'): Profile {
  if (cached) return cached;
  const raw = readFileSync(resolve(path), 'utf-8');
  const p = JSON.parse(raw) as Profile;

  const wsum = Object.values(p.priorityWeights).reduce((a, b) => a + b, 0);
  if (Math.abs(wsum - 1) > 0.001) {
    throw new Error(`profile.priorityWeights must sum to 1.0 (got ${wsum})`);
  }
  if (!p.skills.core.length) throw new Error('profile.skills.core is empty');
  cached = p;
  return p;
}

export function clearProfileCache() { cached = null; }
