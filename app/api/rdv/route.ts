import { NextRequest, NextResponse } from 'next/server';
import { getAllRows, appendRDV } from '@/lib/sheets';
import { HUB_CONFIG } from '@/lib/constants';
import { isInWeekRange } from '@/lib/utils';
import type { NewRDVPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(request.url);
  const hub    = searchParams.get('hub') ?? 'sud';
  const repRaw = searchParams.get('rep');
  const rep    = repRaw ? decodeURIComponent(repRaw) : null;
  const week   = searchParams.get('week');
  const month  = searchParams.get('month');

  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) return NextResponse.json({ error: 'Unknown hub' }, { status: 400 });

  try {
    let rows = await getAllRows(hub);

    if (rep) {
      const repId = hubCfg.repMap[rep];
      if (!repId) return NextResponse.json({ error: 'Unknown rep' }, { status: 400 });
      rows = rows.filter((r) => r.commercial === repId);
    }

    if (week) {
      rows = rows.filter((r) => isInWeekRange(r.dateRDV, week));
    } else if (month) {
      rows = rows.filter((r) => r.dateRDV.startsWith(month));
    }

    console.log(`[GET /api/rdv] hub=${hub} rep=${rep ?? '—'} — ${Date.now() - t0}ms | rows=${rows.length}`);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error(`[GET /api/rdv] hub=${hub} rep=${rep ?? '—'} — ${Date.now() - t0}ms ERR:`, error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: NewRDVPayload = await request.json();
    const hub = body.hub ?? 'sud';
    const hubCfg = HUB_CONFIG[hub];

    if (!hubCfg) return NextResponse.json({ error: 'Unknown hub' }, { status: 400 });
    if (!body.repName || !hubCfg.repMap[body.repName]) {
      return NextResponse.json({ error: 'Invalid rep name' }, { status: 400 });
    }
    if (!body.client?.trim() || !body.dateRDV || !body.heureRDV) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hasVente = body.rdvEffectue && body.venteSignee;

    await appendRDV(
      body.repName,
      {
        client:       body.client.trim(),
        dateRDV:      body.dateRDV,
        heureRDV:     body.heureRDV,
        rdvEffectue:  body.rdvEffectue,
        venteSignee:  body.rdvEffectue ? body.venteSignee : false,
        clientActive: hasVente ? body.clientActive : false,
        netRevenue:   hasVente ? body.netRevenue : null,
        notes:        body.notes ?? '',
        register:     hasVente ? (body.register ?? false) : false,
        contrat:      hasVente ? (body.contrat  ?? false) : false,
        posPlus:      hasVente ? (body.posPlus  ?? false) : false,
      },
      hub
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/rdv]:', error);
    const gErr = error as Error & { response?: { status?: number; data?: unknown } };
    if (gErr.response) {
      console.error('  Google API status:', gErr.response.status);
      console.error('  Google API data:', JSON.stringify(gErr.response.data, null, 2));
    }
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
