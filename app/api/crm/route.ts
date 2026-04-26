import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { NewCRMPayload, UpdateCRMPayload, CRMProspect, CRMRelance } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function mapProspect(row: Record<string, unknown>): CRMProspect {
  return {
    id:          row.id as string,
    nomClient:   row.nom_client as string,
    dateRDV:     (row.date_rdv as string) ?? '',
    tpvEstime:   (row.tpv_estime as number | null) ?? null,
    dateRelance: (row.date_relance as string) ?? '',
    commentaire: (row.commentaire as string) ?? '',
    done:        (row.done as boolean) ?? false,
  };
}

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

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const hub    = searchParams.get('hub') ?? 'sud';
  const repRaw = searchParams.get('rep');
  const rep    = repRaw ? decodeURIComponent(repRaw) : null;

  if (!rep) return NextResponse.json({ error: 'Missing rep param' }, { status: 400 });

  console.log(`[GET /api/crm] hub=${hub} rep=${rep}`);

  try {
    const [prospectsRes, relancesRes] = await Promise.all([
      supabase.from('crm_prospect').select('*').eq('hub', hub).eq('rep', rep).order('date_relance'),
      supabase.from('crm_relance').select('*').eq('hub', hub).eq('rep', rep),
    ]);

    if (prospectsRes.error) {
      console.error(`[GET /api/crm] prospects error:`, prospectsRes.error.message);
      throw new Error(prospectsRes.error.message);
    }
    if (relancesRes.error) {
      console.error(`[GET /api/crm] relances error:`, relancesRes.error.message);
      throw new Error(relancesRes.error.message);
    }
    console.log(`[GET /api/crm] prospects=${prospectsRes.data?.length ?? 0} relances=${relancesRes.data?.length ?? 0}`);

    const prospects = (prospectsRes.data ?? []).map(mapProspect);
    const relances  = (relancesRes.data ?? []).map(mapRelance);

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

    console.log(`[POST /api/crm] hub=${hub} rep=${rep} nomClient=${nomClient} dateRelance=${dateRelance}`);

    if (!rep || !nomClient?.trim() || !dateRelance) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const row = {
      hub,
      rep,
      nom_client:   nomClient.trim(),
      date_rdv:     dateRDV ?? '',
      tpv_estime:   tpvEstime ?? null,
      date_relance: dateRelance,
      commentaire:  commentaire ?? '',
      done:         false,
    };

    console.log(`[POST /api/crm] inserting:`, JSON.stringify(row));

    const { data, error } = await supabase
      .from('crm_prospect')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error(`[POST /api/crm] Supabase error:`, error.message, error.details);
      throw new Error(error.message);
    }

    console.log(`[POST /api/crm] success id=${(data as Record<string, unknown>).id}`);
    return NextResponse.json({ prospect: mapProspect(data as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/crm]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: UpdateCRMPayload = await req.json();
    const { hub = 'sud', rep, id, nomClient, dateRDV, tpvEstime, dateRelance, commentaire, done } = body;

    if (!rep || !id) {
      return NextResponse.json({ error: 'Missing rep or id' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (nomClient   !== undefined) updates.nom_client   = nomClient.trim();
    if (dateRDV     !== undefined) updates.date_rdv     = dateRDV;
    if (tpvEstime   !== undefined) updates.tpv_estime   = tpvEstime;
    if (dateRelance !== undefined) updates.date_relance = dateRelance;
    if (commentaire !== undefined) updates.commentaire  = commentaire;
    if (done        !== undefined) updates.done         = done;

    const { error } = await supabase
      .from('crm_prospect')
      .update(updates)
      .eq('id', id)
      .eq('hub', hub)
      .eq('rep', rep);

    if (error) throw new Error(error.message);
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

    const { error } = await supabase
      .from('crm_prospect')
      .delete()
      .eq('id', id)
      .eq('hub', hub)
      .eq('rep', rep);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/crm]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
