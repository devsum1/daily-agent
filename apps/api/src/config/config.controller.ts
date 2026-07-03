import { Controller, Get } from '@nestjs/common';
import { loadProfile } from '@jsa/core';

// Small read-only surface that n8n hits to drive the daily workflow.
@Controller('config')
export class ConfigController {
  private profile = loadProfile();

  @Get('flags')
  flags() {
    return {
      mode: process.env.AUTO_APPLY_MODE ?? 'off',
      discoveryEnabled: process.env.DISCOVERY_ENABLED !== 'false',
      outboundEnabled: process.env.OUTBOUND_ENABLED === 'true',
      autoApplyMinScore: Number(process.env.AUTO_APPLY_MIN_SCORE ?? 80),
    };
  }

  /** Cartesian product of enabled {platform × keyword × location}, capped per run. */
  @Get('search-matrix')
  searchMatrix() {
    const pages = this.profile.limits.perPlatformSearchPagesPerRun ?? 2;
    const platforms = Object.entries(this.profile.platforms).filter(([, v]) => v.enabled).map(([k]) => k.toUpperCase());
    const combos: { platform: string; keyword: string; location: string; pages: number }[] = [];
    for (const platform of platforms) {
      for (const keyword of this.profile.searchKeywords) {
        for (const location of this.profile.locations) {
          combos.push({ platform, keyword, location, pages });
        }
      }
    }
    // n8n splits on `combos`. Cap to keep daily volume + cost bounded.
    return { count: combos.length, combos: combos.slice(0, 120) };
  }
}
