import { NextRequest, NextResponse } from 'next/server';
import { getAllRows } from '@/lib/sheets';
import { HUB_CONFIG } from '@/lib/constants';
import { isInWeekRange } from '@/lib/utils';
import type { RepStats, TeamSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(request.url);
  const hub   = searchParams.get('hub') ?? 'sud';
  const week  = searchParams.get('week');
  const month = searchParams.get('month');

  if (!week && !month) {
    return NextResponse.json(
      { error: 'Provide week (YYYY-MM-DD) or month (YYYY-MM)' },
      { status: 400 }
    );
  }

  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) return NextResponse.json({ error: 'Unknown hub' }, { status: 400 });

  try {
    let rows = await getAllRows(hub);

    if (week) {
      const weekYear = week.slice(0, 7);
      const allForPeriod = rows.filter((r) => r.dateRDV.startsWith(weekYear));
      const included = allForPeriod.filter((r) => isInWeekRange(r.dateRDV, week));
      const excluded = allForPeriod.filter((r) => !isInWeekRange(r.dateRDV, week));

      console.log(
        `[GET /api/stats:${hub}] week="${week}" | total: ${rows.length} | same-month: ${allForPeriod.length} | IN: ${included.length} | OUT: ${excluded.length}`
      );
      if (excluded.length > 0) {
        excluded.forEach((r) =>
          console.log(`  commercial=${r.commercial} dateRDV="${r.dateRDV}"`)
        );
      }

      rows = included;
    } else if (month) {
      rows = rows.filter((r) => r.dateRDV.startsWith(month!));
    }

    // Initialize buckets for every rep in this hub
    const repNames = Object.keys(hubCfg.repMap);
    const statsMap = new Map<string, RepStats>();
    for (const repName of repNames) {
      const repId = hubCfg.repMap[repName];
      statsMap.set(repId, {
        repName, repId,
        totalRDV: 0, rdvEffectues: 0, ventesSignees: 0, clientsActives: 0,
        tauxPresence: 0, tauxClosing: 0, tauxActivation: 0, netRevenue: 0,
        totalRegister: 0, totalContrat: 0, totalPosPlus: 0,
      });
    }

    for (const row of rows) {
      const stat = statsMap.get(row.commercial);
      if (!stat) continue;
      stat.totalRDV++;
      if (row.rdvEffectue  === 'Oui') stat.rdvEffectues++;
      if (row.venteSignee  === 'Oui') stat.ventesSignees++;
      if (row.clientActive === 'Oui') stat.clientsActives++;
      if (row.netRevenue) stat.netRevenue += row.netRevenue;
      if (row.register) stat.totalRegister++;
      if (row.contrat)  stat.totalContrat++;
      if (row.posPlus)  stat.totalPosPlus++;
    }

    for (const stat of statsMap.values()) {
      stat.tauxPresence  = stat.totalRDV     > 0 ? Math.round((stat.rdvEffectues / stat.totalRDV)      * 100) : 0;
      stat.tauxClosing   = stat.rdvEffectues > 0 ? Math.round((stat.ventesSignees / stat.rdvEffectues)  * 100) : 0;
      stat.tauxActivation= stat.ventesSignees> 0 ? Math.round((stat.clientsActives / stat.ventesSignees)* 100) : 0;
    }

    const stats = Array.from(statsMap.values());

    const totals = stats.reduce(
      (acc, s) => ({
        totalRDV:      acc.totalRDV      + s.totalRDV,
        totalPresents: acc.totalPresents + s.rdvEffectues,
        totalVentes:   acc.totalVentes   + s.ventesSignees,
        totalActives:  acc.totalActives  + s.clientsActives,
        netRevenue:    acc.netRevenue    + s.netRevenue,
        totalRegister: acc.totalRegister + s.totalRegister,
        totalContrat:  acc.totalContrat  + s.totalContrat,
        totalPosPlus:  acc.totalPosPlus  + s.totalPosPlus,
      }),
      { totalRDV: 0, totalPresents: 0, totalVentes: 0, totalActives: 0, netRevenue: 0,
        totalRegister: 0, totalContrat: 0, totalPosPlus: 0 }
    );

    const summary: TeamSummary = {
      ...totals,
      tauxPresence:  totals.totalRDV      > 0 ? Math.round((totals.totalPresents / totals.totalRDV)     * 100) : 0,
      tauxClosing:   totals.totalPresents > 0 ? Math.round((totals.totalVentes   / totals.totalPresents)* 100) : 0,
      tauxActivation:totals.totalVentes   > 0 ? Math.round((totals.totalActives  / totals.totalVentes)  * 100) : 0,
    };

    console.log(`[GET /api/stats] hub=${hub} period=${week ?? month} — ${Date.now() - t0}ms`);
    return NextResponse.json({ stats, summary });
  } catch (error) {
    console.error(`[GET /api/stats] hub=${hub} — ${Date.now() - t0}ms ERR:`, error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
