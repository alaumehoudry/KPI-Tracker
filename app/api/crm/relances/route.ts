import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { NewRelancePayload, UpdateRelancePayload, CRMRelance } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function mapRelance(row: Record<string, unknown>): CRMRelance {
  return {
    id:          row.id as string,
    idProspect:  row.id_prospect as string,
    dateRelance: row.date_relance as string,
    commentaire: (row.commentaire as string) ?? '',
    done:        (row.done as boolean) ?? false,
    createdAt:   row.created_at as string,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: NewRelancePayload = await req.json();
    const { hub = 'sud', rep, idProspect, dateRelance, commentaire } = body;

    if (!rep || !idProspect || !dateRelance) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm_relance')
      .insert({
        hub,
        rep,
        id_prospect:  idProspect,
        date_relance: dateRelance,
        commentaire:  commentaire ?? '',
        done:         false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ relance: mapRelance(data as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/crm/relances]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: UpdateRelancePayload = await req.json();
    const { hub = 'sud', rep, id, dateRelance, commentaire, done } = body;

    if (!rep || !id) {
      return NextResponse.json({ error: 'Missing rep or id' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (dateRelance !== undefined) updates.date_relance = dateRelance;
    if (commentaire !== undefined) updates.commentaire  = commentaire;
    if (done        !== undefined) updates.done         = done;

    const { error } = await supabase
      .from('crm_relance')
      .update(updates)
      .eq('id', id)
      .eq('hub', hub)
      .eq('rep', rep);

    if (error) throw new Error(error.message);
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

    const { error } = await supabase
      .from('crm_relance')
      .delete()
      .eq('id', id)
      .eq('hub', hub)
      .eq('rep', rep);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/crm/relances]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
