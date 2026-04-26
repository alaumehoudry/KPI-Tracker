import { NextRequest, NextResponse } from 'next/server';
import {
  getCRMProspects,
  addCRMProspect,
  updateCRMProspect,
  deleteCRMProspect,
  getCRMRelances,
} from '@/lib/sheets';
import type { NewCRMPayload, UpdateCRMPayload, CRMRelance } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const hub    = searchParams.get('hub') ?? 'sud';
  const repRaw = searchParams.get('rep');
  const rep    = repRaw ? decodeURIComponent(repRaw) : null;

  if (!rep) return NextResponse.json({ error: 'Missing rep param' }, { status: 400 });

  try {
    const [prospects, relances] = await Promise.all([
      getCRMProspects(hub, rep),
      getCRMRelances(hub, rep),
    ]);

    // Join relances onto each prospect
    const relancesByProspect = new Map<string, CRMRelance[]>();
    for (const r of relances) {
      if (!relancesByProspect.has(r.idProspect)) relancesByProspect.set(r.idProspect, []);
      relancesByProspect.get(r.idProspect)!.push(r);
    }

    const prospectsWithRelances = prospects.map((p) => ({
      ...p,
      relances: (relancesByProspect.get(p.id) ?? [])
        .sort((a, b) => a.dateRelance.localeCompare(b.dateRelance)),
    }));

    console.log(`[GET /api/crm] hub=${hub} rep=${rep} — ${Date.now() - t0}ms | prospects=${prospects.length}`);
    return NextResponse.json({ prospects: prospectsWithRelances });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/crm] hub=${hub} rep=${rep} — ${Date.now() - t0}ms ERR:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: NewCRMPayload = await req.json();
    const { hub = 'sud', rep, nomClient, dateRDV, tpvEstime, dateRelance, commentaire } = body;

    if (!rep || !nomClient?.trim() || !dateRelance) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prospect = await addCRMProspect(hub, rep, {
      nomClient: nomClient.trim(),
      dateRDV:     dateRDV     ?? '',
      tpvEstime:   tpvEstime   ?? null,
      dateRelance: dateRelance,
      commentaire: commentaire ?? '',
      done:        false,
    });

    return NextResponse.json({ prospect }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/crm]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: UpdateCRMPayload = await req.json();
    const { hub = 'sud', rep, id, ...updates } = body;

    if (!rep || !id) {
      return NextResponse.json({ error: 'Missing rep or id' }, { status: 400 });
    }

    await updateCRMProspect(hub, rep, id, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PATCH /api/crm]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { hub?: string; rep?: string; id?: string };
    const { hub = 'sud', rep, id } = body;

    if (!rep || !id) {
      return NextResponse.json({ error: 'Missing rep or id' }, { status: 400 });
    }

    await deleteCRMProspect(hub, rep, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/crm]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
