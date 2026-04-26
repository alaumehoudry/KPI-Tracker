import { NextRequest, NextResponse } from 'next/server';
import { getBookingsWithClients } from '@/lib/sheets';
import { supabase } from '@/lib/supabase';
import { HUB_CONFIG } from '@/lib/constants';
import { addDays, format } from 'date-fns';
import type { AgendaDay } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function weekToSunday(monday: string): string {
  const d = new Date(monday + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const hub    = searchParams.get('hub') ?? 'sud';
  const repRaw = searchParams.get('rep');
  const rep    = repRaw ? decodeURIComponent(repRaw) : null;
  const week   = searchParams.get('week'); // YYYY-MM-DD (monday)

  if (!rep || !week) {
    return NextResponse.json({ error: 'Missing rep or week param' }, { status: 400 });
  }

  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) return NextResponse.json({ error: 'Unknown hub' }, { status: 400 });

  const repId = hubCfg.repMap[rep];
  if (!repId) {
    console.error(`[GET /api/agenda] repId not found for repName="${rep}" in hub="${hub}"`);
    return NextResponse.json({ error: 'Unknown rep' }, { status: 400 });
  }

  const sunday = weekToSunday(week);

  try {
    const [bookings, rdvRes] = await Promise.all([
      getBookingsWithClients({ week, repName: rep, hub }),
      supabase
        .from('rdv')
        .select('client, date_rdv, heure_rdv, rdv_effectue, vente_signee, net_revenue, register, contrat, pos_plus')
        .eq('hub', hub)
        .eq('commercial', repId)
        .gte('date_rdv', week)
        .lte('date_rdv', sunday),
    ]);

    if (rdvRes.error) {
      console.error(`[GET /api/agenda] Supabase error:`, rdvRes.error.message);
      throw new Error(rdvRes.error.message);
    }

    const rdvData = rdvRes.data ?? [];
    console.log(`[GET /api/agenda] hub=${hub} rep=${rep} repId=${repId} week=${week}→${sunday} rdvs=${rdvData.length} bookings=${bookings.length}`);

    const monday = new Date(week + 'T12:00:00');
    const days: AgendaDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = format(addDays(monday, i), 'yyyy-MM-dd');
      days.push({
        date,
        bookings: bookings
          .filter((b) => b.date === date)
          .map((b) => ({ clientName: b.clientName, time: b.time })),
        rdvs: rdvData
          .filter((r) => r.date_rdv === date)
          .map((r) => ({
            client:      r.client as string,
            heureRDV:    r.heure_rdv as string,
            rdvEffectue: r.rdv_effectue ? 'Oui' : 'Non',
            venteSignee: r.vente_signee ? 'Oui' : 'Non',
            netRevenue:  r.net_revenue as number | null,
            register:    !!r.register,
            contrat:     !!r.contrat,
            posPlus:     !!r.pos_plus,
          })),
      });
    }

    console.log(`[GET /api/agenda] hub=${hub} rep=${rep} — ${Date.now() - t0}ms`);
    return NextResponse.json({ days });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/agenda] hub=${hub} rep=${rep} — ${Date.now() - t0}ms ERR:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
