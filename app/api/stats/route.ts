import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { HUB_CONFIG } from '@/lib/constants';
import type { RepStats, TeamSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function weekToSunday(monday: string): string {
  const d = new Date(monday + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

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
    let query = supabase.from('rdv').select('*').eq('hub', hub);

    if (week) {
      query = query.gte('date_rdv', week).lte('date_rdv', weekToSunday(week));
    } else if (month) {
      query = query.gte('date_rdv', `${month}-01`).lt('date_rdv', nextMonthStart(month));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];

    // Initialize buckets for every rep in this hub
    const repNames = Object.keys(hubCfg.repMap);
    const statsMap = new Map<string, RepStats>();
    for (const repName of repNames) {
      const repId = hubCfg.repMap[repName];
      statsMap.set(repId, {
        repName, repId,
        totalRDV: 0, rdvEffectues: 0, ventesSignees: 0,
        tauxPresence: 0, tauxClosing: 0, netRevenue: 0,
        totalRegister: 0, totalContrat: 0, totalPosPlus: 0,
      });
    }

    for (const row of rows) {
      const stat = statsMap.get(row.commercial as string);
      if (!stat) continue;
      stat.totalRDV++;
      if (row.rdv_effectue)  stat.rdvEffectues++;
      if (row.vente_signee)  stat.ventesSignees++;
      if (row.net_revenue)   stat.netRevenue += row.net_revenue as number;
      if (row.register)      stat.totalRegister++;
      if (row.contrat)       stat.totalContrat++;
      if (row.pos_plus)      stat.totalPosPlus++;
    }

    for (const stat of statsMap.values()) {
      stat.tauxPresence = stat.totalRDV     > 0 ? Math.round((stat.rdvEffectues  / stat.totalRDV)     * 100) : 0;
      stat.tauxClosing  = stat.rdvEffectues > 0 ? Math.round((stat.ventesSignees / stat.rdvEffectues) * 100) : 0;
    }

    const stats = Array.from(statsMap.values());

    const totals = stats.reduce(
      (acc, s) => ({
        totalRDV:      acc.totalRDV      + s.totalRDV,
        totalPresents: acc.totalPresents + s.rdvEffectues,
        totalVentes:   acc.totalVentes   + s.ventesSignees,
        netRevenue:    acc.netRevenue    + s.netRevenue,
        totalRegister: acc.totalRegister + s.totalRegister,
        totalContrat:  acc.totalContrat  + s.totalContrat,
        totalPosPlus:  acc.totalPosPlus  + s.totalPosPlus,
      }),
      { totalRDV: 0, totalPresents: 0, totalVentes: 0, netRevenue: 0,
        totalRegister: 0, totalContrat: 0, totalPosPlus: 0 }
    );

    const summary: TeamSummary = {
      ...totals,
      tauxPresence: totals.totalRDV      > 0 ? Math.round((totals.totalPresents / totals.totalRDV)      * 100) : 0,
      tauxClosing:  totals.totalPresents > 0 ? Math.round((totals.totalVentes   / totals.totalPresents) * 100) : 0,
    };

    console.log(`[GET /api/stats] hub=${hub} period=${week ?? month} — ${Date.now() - t0}ms`);
    return NextResponse.json({ stats, summary });
  } catch (error) {
    console.error(`[GET /api/stats] hub=${hub} — ${Date.now() - t0}ms ERR:`, error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
