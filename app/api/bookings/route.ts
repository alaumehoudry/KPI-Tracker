import { NextRequest, NextResponse } from 'next/server';
import { getRDVPris } from '@/lib/sheets';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const hub    = searchParams.get('hub')   ?? 'sud';
  const week   = searchParams.get('week')  ?? undefined;
  const month  = searchParams.get('month') ?? undefined;
  const repRaw = searchParams.get('rep');
  const rep    = repRaw ? decodeURIComponent(repRaw) : undefined;

  if (!week && !month) {
    return NextResponse.json({ error: 'Missing week or month param' }, { status: 400 });
  }

  try {
    const entries = await getRDVPris({ week, month, repName: rep, hub });
    console.log(`[GET /api/bookings] hub=${hub} rep=${rep ?? '—'} — ${Date.now() - t0}ms | entries=${entries.length}`);
    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/bookings] hub=${hub} — ${Date.now() - t0}ms ERR:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
