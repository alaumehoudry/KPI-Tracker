import { NextRequest, NextResponse } from 'next/server';
import { getAllRows, getBookingsWithClients } from '@/lib/sheets';
import { isInWeekRange } from '@/lib/utils';
import { HUB_CONFIG } from '@/lib/constants';
import { addDays, format } from 'date-fns';
import type { AgendaDay } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  try {
    const [bookings, allRows] = await Promise.all([
      getBookingsWithClients({ week, repName: rep, hub }),
      getAllRows(hub),
    ]);

    const repId = hubCfg.repMap[rep];
    const repRows = allRows.filter(
      (r) => r.commercial === repId && isInWeekRange(r.dateRDV, week)
    );

    const monday = new Date(week + 'T00:00:00');
    const days: AgendaDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = format(addDays(monday, i), 'yyyy-MM-dd');
      days.push({
        date,
        bookings: bookings
          .filter((b) => b.date === date)
          .map((b) => ({ clientName: b.clientName, time: b.time })),
        rdvs: repRows
          .filter((r) => r.dateRDV === date)
          .map((r) => ({
            client:      r.client,
            heureRDV:    r.heureRDV,
            rdvEffectue: r.rdvEffectue,
            venteSignee: r.venteSignee,
            netRevenue:  r.netRevenue,
            register:    r.register,
            contrat:     r.contrat,
            posPlus:     r.posPlus,
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
