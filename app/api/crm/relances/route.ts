import { NextRequest, NextResponse } from 'next/server';
import { addCRMRelance, updateCRMRelance, deleteCRMRelance } from '@/lib/sheets';
import type { NewRelancePayload, UpdateRelancePayload } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body: NewRelancePayload = await req.json();
    const { hub = 'sud', rep, idProspect, dateRelance, commentaire } = body;

    if (!rep || !idProspect || !dateRelance) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const relance = await addCRMRelance(hub, rep, {
      idProspect,
      dateRelance,
      commentaire: commentaire ?? '',
      done: false,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ relance }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/crm/relances]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: UpdateRelancePayload = await req.json();
    const { hub = 'sud', rep, id, ...updates } = body;

    if (!rep || !id) {
      return NextResponse.json({ error: 'Missing rep or id' }, { status: 400 });
    }

    await updateCRMRelance(hub, rep, id, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PATCH /api/crm/relances]:', msg);
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

    await deleteCRMRelance(hub, rep, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/crm/relances]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
