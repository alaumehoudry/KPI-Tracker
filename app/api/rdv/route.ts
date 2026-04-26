import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { HUB_CONFIG } from '@/lib/constants';
import type { RDVRow, NewRDVPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Use T12:00:00 (noon) to avoid UTC midnight crossing date boundaries in UTC+ timezones
function weekToSunday(monday: string): string {
  const d = new Date(monday + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function toMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function mapRow(row: Record<string, unknown>): RDVRow {
  return {
    id:          row.id           as string,
    semaine:     row.semaine      as string,
    commercial:  row.commercial   as string,
    client:      row.client       as string,
    dateRDV:     row.date_rdv     as string,
    heureRDV:    row.heure_rdv    as string,
    rdvEffectue: row.rdv_effectue ? 'Oui' : 'Non',
    venteSignee: row.vente_signee ? 'Oui' : 'Non',
    netRevenue:  row.net_revenue  as number | null,
    notes:       (row.notes ?? '') as string,
    rdvValide:   1,
    register:    !!row.register,
    contrat:     !!row.contrat,
    posPlus:     !!row.pos_plus,
  };
}

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
    let query = supabase.from('rdv').select('*').eq('hub', hub);

    if (rep) {
      const repId = hubCfg.repMap[rep];
      if (!repId) {
        console.error(`[GET /api/rdv] repId not found for repName="${rep}" in hub="${hub}". Known names: ${Object.keys(hubCfg.repMap).join(', ')}`);
        return NextResponse.json({ error: 'Unknown rep' }, { status: 400 });
      }
      query = query.eq('commercial', repId);
      console.log(`[GET /api/rdv] repName="${rep}" → repId="${repId}"`);
    }

    if (week) {
      const sunday = weekToSunday(week);
      query = query.gte('date_rdv', week).lte('date_rdv', sunday);
      console.log(`[GET /api/rdv] week filter: ${week} → ${sunday}`);
    } else if (month) {
      const next = nextMonthStart(month);
      query = query.gte('date_rdv', `${month}-01`).lt('date_rdv', next);
      console.log(`[GET /api/rdv] month filter: ${month}-01 → ${next}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[GET /api/rdv] Supabase error:`, error.message);
      throw new Error(error.message);
    }

    const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
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

    console.log(`[POST /api/rdv] hub=${hub} repName=${body.repName} dateRDV=${body.dateRDV}`);

    if (!hubCfg) return NextResponse.json({ error: 'Unknown hub' }, { status: 400 });

    const repId = hubCfg.repMap[body.repName];
    if (!body.repName || !repId) {
      console.error(`[POST /api/rdv] Invalid repName="${body.repName}". Known: ${Object.keys(hubCfg.repMap).join(', ')}`);
      return NextResponse.json({ error: 'Invalid rep name' }, { status: 400 });
    }
    if (!body.client?.trim() || !body.dateRDV || !body.heureRDV) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hasVente = body.rdvEffectue && body.venteSignee;
    const row = {
      hub,
      commercial:   repId,
      client:       body.client.trim(),
      date_rdv:     body.dateRDV,
      heure_rdv:    body.heureRDV,
      rdv_effectue: body.rdvEffectue,
      vente_signee: body.rdvEffectue ? body.venteSignee : false,
      net_revenue:  hasVente ? body.netRevenue : null,
      notes:        body.notes ?? '',
      register:     hasVente ? (body.register ?? false) : false,
      contrat:      hasVente ? (body.contrat  ?? false) : false,
      pos_plus:     hasVente ? (body.posPlus  ?? false) : false,
      semaine:      toMonday(body.dateRDV),
    };

    console.log(`[POST /api/rdv] inserting:`, JSON.stringify(row));

    const { error } = await supabase.from('rdv').insert(row);
    if (error) {
      console.error(`[POST /api/rdv] Supabase error:`, error.message, error.details);
      throw new Error(error.message);
    }

    console.log(`[POST /api/rdv] success — commercial=${repId} date=${body.dateRDV}`);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/rdv]:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      id: string;
      client?: string;
      dateRDV?: string;
      heureRDV?: string;
      rdvEffectue?: boolean;
      venteSignee?: boolean;
      netRevenue?: number | null;
      notes?: string;
      register?: boolean;
      contrat?: boolean;
      posPlus?: boolean;
    };
    const { id, rdvEffectue, venteSignee } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const hasVente = rdvEffectue && venteSignee;

    const updates: Record<string, unknown> = {
      client:       body.client?.trim(),
      date_rdv:     body.dateRDV,
      heure_rdv:    body.heureRDV,
      rdv_effectue: rdvEffectue,
      vente_signee: rdvEffectue ? venteSignee : false,
      net_revenue:  hasVente ? (body.netRevenue ?? null) : null,
      notes:        body.notes ?? '',
      register:     hasVente ? (body.register ?? false) : false,
      contrat:      hasVente ? (body.contrat  ?? false) : false,
      pos_plus:     hasVente ? (body.posPlus  ?? false) : false,
    };

    // Remove keys whose value is undefined
    for (const k of Object.keys(updates)) {
      if (updates[k] === undefined) delete updates[k];
    }

    console.log(`[PATCH /api/rdv] id=${id}`, JSON.stringify(updates));
    const { error } = await supabase.from('rdv').update(updates).eq('id', id);
    if (error) {
      console.error(`[PATCH /api/rdv] Supabase error:`, error.message);
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/rdv]:', error);
    return NextResponse.json({ error: 'Failed to update RDV' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { id: string };
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    console.log(`[DELETE /api/rdv] id=${id}`);
    const { error } = await supabase.from('rdv').delete().eq('id', id);
    if (error) {
      console.error(`[DELETE /api/rdv] Supabase error:`, error.message);
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/rdv]:', error);
    return NextResponse.json({ error: 'Failed to delete RDV' }, { status: 500 });
  }
}
