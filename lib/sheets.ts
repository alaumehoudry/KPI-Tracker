import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import { format, startOfWeek } from 'date-fns';
import {
  READ_SHEET, BOOKING_SHEET_ID, BOOKING_TAB,
  HUB_CONFIG,
} from './constants';
import { parseSheetDate, isInWeekRange, normalizeBookingName } from './utils';
import type { RDVRow, CRMProspect, CRMRelance } from './types';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    try {
      credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON or base64-encoded JSON');
    }
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Retry helper ──────────────────────────────────────────────────────────────

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function withRetry<T>(fn: () => Promise<T>, context = ''): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (!RETRYABLE_STATUSES.has(status ?? 0) || attempt === 2) throw err;
      const delay = 2 ** attempt * 1000;
      console.warn(
        `[withRetry${context ? ` ${context}` : ''}] attempt ${attempt + 1} failed (HTTP ${status}), retry in ${delay}ms`
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error('withRetry: unreachable');
}

// ── Name normalization helpers ─────────────────────────────────────────────────

// eslint-disable-next-line no-misleading-character-class
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase().trim();
}

function findInMap<T>(map: Record<string, T>, key: string): T | undefined {
  if (key in map) return map[key];
  const norm = normalizeStr(key);
  const entry = Object.entries(map).find(([k]) => normalizeStr(k) === norm);
  return entry?.[1];
}

// ── RDV rows ─────────────────────────────────────────────────────────────────

function parseRDVRow(
  row: string[],
  repIdOverride?: string
): RDVRow | null {
  const colA = row[0] ?? '';
  const colB = row[1] ?? '';
  const colC = row[2] ?? '';
  const colD = row[3] ?? '';

  const repId = repIdOverride ?? colB;
  if (!repId) return null;

  const parsedDate = parseSheetDate(colD) || parseSheetDate(colA);
  if (!parsedDate || parsedDate.length < 8) return null;

  return {
    id:          '',
    semaine:     parseSheetDate(colA) || parsedDate,
    commercial:  repId,
    client:      colC,
    dateRDV:     parsedDate,
    heureRDV:    row[4] ?? '',
    rdvEffectue: (row[5] === 'Oui' ? 'Oui' : 'Non') as 'Oui' | 'Non',
    venteSignee: (row[6] === 'Oui' ? 'Oui' : 'Non') as 'Oui' | 'Non',
    netRevenue:  row[8] ? parseFloat(String(row[8]).replace(',', '.')) : null,
    notes:       row[9] ?? '',
    rdvValide:   1 as const,
    register:    row[11] === 'Oui',
    contrat:     row[12] === 'Oui',
    posPlus:     row[13] === 'Oui',
  };
}

async function getAllRowsFromMaster(hub: string): Promise<RDVRow[]> {
  const hubCfg = HUB_CONFIG[hub];
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId: hubCfg.masterSheetId,
      range: `${READ_SHEET}!A3:N`,   // extended to N for product cols
    }),
    `hub=${hub} getAllRowsFromMaster`
  );

  const raw = (res.data.values ?? []) as string[][];
  console.log(`[getAllRows:${hub}:master] RAW rows: ${raw.length}`);

  let kept = 0;
  const dropped: string[] = [];
  const mapped: RDVRow[] = [];

  for (const [idx, row] of raw.entries()) {
    if (!Array.isArray(row)) { dropped.push(`[${idx}] not array`); continue; }
    const parsed = parseRDVRow(row);
    if (!parsed) { dropped.push(`[${idx}] repId=${row[1] ?? '–'} date="${row[3] ?? '–'}"`); continue; }
    kept++;
    mapped.push(parsed);
  }

  console.log(`[getAllRows:${hub}:master] Kept: ${kept} | Dropped: ${dropped.length}`);
  if (dropped.length > 0 && dropped.length <= 20) {
    console.log('[getAllRows] Dropped:\n' + dropped.join('\n'));
  }
  return mapped;
}

async function getAllRowsFromIndividualSheets(hub: string): Promise<RDVRow[]> {
  const hubCfg = HUB_CONFIG[hub];
  const tabName = hubCfg.individualReadTab!;
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const allRows: RDVRow[] = [];

  const results = await Promise.allSettled(
    Object.entries(hubCfg.repSheetIds).map(async ([repName, sheetId]) => {
      const repId = findInMap(hubCfg.repMap, repName);
      const res = await withRetry(
        () => sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${tabName}!A1:N`,   // extended to N for product cols
        }),
        `hub=${hub} rep=${repName}`
      );
      const raw = (res.data.values ?? []) as string[][];
      const rows: RDVRow[] = [];
      for (const row of raw) {
        const parsed = parseRDVRow(row, repId);
        if (!parsed) continue;
        rows.push(parsed);
      }
      console.log(`[getAllRows:${hub}:individual] ${repName}: ${rows.length}/${raw.length} rows`);
      return rows;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allRows.push(...result.value);
    } else {
      console.error(`[getAllRows:${hub}:individual] rep fetch failed:`, result.reason);
    }
  }

  console.log(`[getAllRows:${hub}:individual] Total merged: ${allRows.length}`);
  return allRows;
}

// ── In-memory cache (60 s TTL, invalidated on write) ─────────────────────────

interface CacheEntry { data: RDVRow[]; expiresAt: number; }
const rowsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

function clearRowsCache(hub: string) {
  rowsCache.delete(hub);
  console.log(`[rowsCache:${hub}] invalidated`);
}

export async function getAllRows(hub = 'sud'): Promise<RDVRow[]> {
  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) throw new Error(`Unknown hub: ${hub}`);

  const now = Date.now();
  const cached = rowsCache.get(hub);
  if (cached && now < cached.expiresAt) {
    console.log(`[rowsCache:${hub}] HIT — ${Math.round((cached.expiresAt - now) / 1000)}s left`);
    return cached.data;
  }

  const data = hubCfg.individualReadTab
    ? await getAllRowsFromIndividualSheets(hub)
    : await getAllRowsFromMaster(hub);

  rowsCache.set(hub, { data, expiresAt: now + CACHE_TTL });
  return data;
}

// ── Write RDV to individual sheet (Mod 2 + Mod 5) ────────────────────────────

export async function appendRDV(
  repName: string,
  data: {
    client: string;
    dateRDV: string;
    heureRDV: string;
    rdvEffectue: boolean;
    venteSignee: boolean;
    netRevenue: number | null;
    notes: string;
    register: boolean;
    contrat: boolean;
    posPlus: boolean;
  },
  hub = 'sud'
): Promise<void> {
  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) throw new Error(`Unknown hub: ${hub}`);

  const repId = findInMap(hubCfg.repMap, repName);
  if (!repId) throw new Error(`Unknown rep: ${repName}`);

  const repSheetId = findInMap(hubCfg.repSheetIds, repName);
  if (!repSheetId) throw new Error(`No individual sheet for rep: ${repName}`);

  const [year, month, day] = data.dateRDV.split('-').map(Number);
  const rdvDate = new Date(year, month - 1, day);
  const monday = startOfWeek(rdvDate, { weekStartsOn: 1 });
  const semaine = format(monday, 'yyyy-MM-dd');

  const colB = hubCfg.individualReadTab ? repName : repId;

  // 14 columns: A=semaine, B=commercial, C=client, D=dateRDV, E=heureRDV,
  // F=rdvEffectue, G=venteSignee, H=(unused), I=netRevenue, J=notes, K=rdvValide,
  // L=register, M=contrat, N=posPlus
  const row = [
    semaine, colB, data.client, data.dateRDV, data.heureRDV,
    data.rdvEffectue ? 'Oui' : 'Non',
    data.venteSignee ? 'Oui' : 'Non',
    '',
    data.netRevenue !== null ? data.netRevenue : '',
    data.notes,
    1,
    data.register ? 'Oui' : 'Non',
    data.contrat  ? 'Oui' : 'Non',
    data.posPlus  ? 'Oui' : 'Non',
  ];

  const writeTab = hubCfg.individualReadTab ?? 'Saisie_RDV';
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Mod 2: read col A to find the actual next empty row, then use values.update
  // (values.append can mis-detect the write column on sheets with named ranges)
  const colARes = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId: repSheetId,
      range: `${writeTab}!A:A`,
    }),
    `hub=${hub} rep=${repName} appendRDV findNextRow`
  );
  const nextRow = ((colARes.data.values ?? []) as string[][]).length + 1;

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId: repSheetId,
      range: `${writeTab}!A${nextRow}:N${nextRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }),
    `hub=${hub} rep=${repName} appendRDV`
  );

  clearRowsCache(hub);
}

// ── Bookings (shared sheet, hub-specific name map) ────────────────────────────

// Set to null to force re-resolution after a tab-name fix; cached per process thereafter.
let _bookingTabCache: string | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBookingTab(sheets: any): Promise<string> {
  if (_bookingTabCache) return _bookingTabCache;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = await withRetry(
      () => sheets.spreadsheets.get({ spreadsheetId: BOOKING_SHEET_ID }),
      'resolveBookingTab'
    );
    const tabs: string[] = (
      meta.data.sheets as { properties?: { title?: string } }[]
    ).map((s) => s.properties?.title ?? '');

    console.log('[resolveBookingTab] Available tabs:', tabs);

    const candidates = [
      'BOOKING DETAIL',
      'Booking Detail',
      'booking detail',
      BOOKING_TAB,
      'Booking overview',
      'Booking Overview',
      'BOOKING OVERVIEW',
      'booking overview',
      'Bookings',
    ];
    for (const c of candidates) {
      if (tabs.includes(c)) { _bookingTabCache = c; return c; }
    }

    const detailFuzzy = tabs.find((t) => t.toLowerCase().includes('detail'));
    if (detailFuzzy) { _bookingTabCache = detailFuzzy; return detailFuzzy; }

    const fuzzy = tabs.find((t) => t.toLowerCase().includes('booking'));
    if (fuzzy) { _bookingTabCache = fuzzy; return fuzzy; }

    _bookingTabCache = tabs[0] ?? BOOKING_TAB;
    console.warn(`[resolveBookingTab] Falling back to "${_bookingTabCache}"`);
    return _bookingTabCache;
  } catch (err) {
    console.error('[resolveBookingTab] Error fetching metadata:', err);
    return BOOKING_TAB;
  }
}

function buildNormalisedNameMap(
  bookingNameMap: Record<string, string>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const [key, val] of Object.entries(bookingNameMap)) {
    m.set(normalizeBookingName(key), val);
  }
  return m;
}

// ── Booking sheet — with client names (for agenda) ────────────────────────────

export interface BookingWithClient {
  repName: string;
  date: string;    // YYYY-MM-DD from BOOKING_DATE (col L)
  clientName: string;
  time: string;    // HH:MM from SCHEDULED_AT (col K) or ''
}

export async function getBookingsWithClients({
  week,
  repName,
  hub = 'sud',
}: {
  week: string;
  repName: string;
  hub?: string;
}): Promise<BookingWithClient[]> {
  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) throw new Error(`Unknown hub: ${hub}`);

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const bookingTab = await resolveBookingTab(sheets);

  // Read through col M (index 12) to get BOOKING_TIME
  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId: BOOKING_SHEET_ID,
      range: `${bookingTab}!A:M`,
    }),
    `hub=${hub} rep=${repName} getBookingsWithClients`
  );

  const rows = (res.data.values ?? []) as string[][];
  const normMap = buildNormalisedNameMap(hubCfg.bookingNameMap);
  const results: BookingWithClient[] = [];

  for (const row of rows) {
    const rawName   = String(row[0]  ?? '').trim();
    const appName   = normMap.get(normalizeBookingName(rawName));
    if (!appName || normalizeStr(appName) !== normalizeStr(repName)) continue;

    const bookingDate = parseSheetDate(String(row[11] ?? '').trim());
    if (!bookingDate || !isInWeekRange(bookingDate, week)) continue;

    const firstName  = String(row[3]  ?? '').trim();
    const lastName   = String(row[4]  ?? '').trim();
    const business   = String(row[7]  ?? '').trim();
    const clientName = business || [firstName, lastName].filter(Boolean).join(' ') || '—';

    const scheduledAt = String(row[10] ?? '').trim();
    const timeMatch   = scheduledAt.match(/(\d{1,2}:\d{2})/);
    const time        = timeMatch ? timeMatch[1].padStart(5, '0') : '';

    results.push({ repName: appName, date: bookingDate, clientName, time });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

// ── CRM helpers ───────────────────────────────────────────────────────────────

const CRM_TAB     = 'CRM';
const CRM_HEADERS = ['id', 'nom_client', 'date_rdv', 'tpv_estime', 'date_relance', 'commentaire', 'done'];

function rowToCRM(row: string[]): CRMProspect {
  return {
    id:          row[0] ?? '',
    nomClient:   row[1] ?? '',
    dateRDV:     row[2] ?? '',
    tpvEstime:   row[3] ? parseFloat(row[3]) : null,
    dateRelance: row[4] ?? '',
    commentaire: row[5] ?? '',
    done:        row[6] === 'TRUE',
  };
}

function crmToRow(p: CRMProspect): (string | number)[] {
  return [
    p.id,
    p.nomClient,
    p.dateRDV,
    p.tpvEstime !== null ? p.tpvEstime : '',
    p.dateRelance,
    p.commentaire,
    p.done ? 'TRUE' : 'FALSE',
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateCRMSheet(sheets: any, spreadsheetId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: any = await withRetry(
    () => sheets.spreadsheets.get({ spreadsheetId }),
    `getOrCreateCRMSheet spreadsheetId=${spreadsheetId}`
  );
  const existing = (meta.data.sheets as { properties?: { title?: string; sheetId?: number } }[])
    ?.find((s) => s.properties?.title === CRM_TAB);

  if (existing) return existing.properties!.sheetId!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createRes: any = await withRetry(
    () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CRM_TAB } } }] },
    }),
    `getOrCreateCRMSheet batchUpdate spreadsheetId=${spreadsheetId}`
  );
  const newGid: number = createRes.data.replies[0].addSheet.properties.sheetId;

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CRM_TAB}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CRM_HEADERS] },
    }),
    `getOrCreateCRMSheet initHeaders spreadsheetId=${spreadsheetId}`
  );

  return newGid;
}

function getRepSheetId(hub: string, repName: string): string {
  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) throw new Error(`Unknown hub: ${hub}`);
  const id = findInMap(hubCfg.repSheetIds, repName);
  if (!id) throw new Error(`No sheet for rep: ${repName} (hub: ${hub})`);
  return id;
}

export async function getCRMProspects(hub: string, repName: string): Promise<CRMProspect[]> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await getOrCreateCRMSheet(sheets, spreadsheetId);

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_TAB}!A2:G`,
    }),
    `hub=${hub} rep=${repName} getCRMProspects`
  );

  const rows = (res.data.values ?? []) as string[][];
  return rows.filter((r) => r[0]).map(rowToCRM);
}

export async function addCRMProspect(
  hub: string,
  repName: string,
  data: Omit<CRMProspect, 'id'>
): Promise<CRMProspect> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await getOrCreateCRMSheet(sheets, spreadsheetId);

  const prospect: CRMProspect = { id: randomUUID(), ...data };

  await withRetry(
    () => sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${CRM_TAB}!A:G`,
      valueInputOption: 'RAW',
      requestBody: { values: [crmToRow(prospect)] },
    }),
    `hub=${hub} rep=${repName} addCRMProspect`
  );

  return prospect;
}

export async function updateCRMProspect(
  hub: string,
  repName: string,
  id: string,
  updates: Partial<Omit<CRMProspect, 'id'>>
): Promise<void> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await getOrCreateCRMSheet(sheets, spreadsheetId);

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_TAB}!A2:G`,
    }),
    `hub=${hub} rep=${repName} updateCRMProspect get`
  );
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1) throw new Error(`CRM prospect not found: ${id}`);

  const updated: CRMProspect = { ...rowToCRM(rows[idx]), ...updates };
  const sheetRow = idx + 2; // +1 for header, +1 for 1-based

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CRM_TAB}!A${sheetRow}:G${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [crmToRow(updated)] },
    }),
    `hub=${hub} rep=${repName} updateCRMProspect put`
  );
}

export async function deleteCRMProspect(
  hub: string,
  repName: string,
  id: string
): Promise<void> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const crmGid = await getOrCreateCRMSheet(sheets, spreadsheetId);

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_TAB}!A2:G`,
    }),
    `hub=${hub} rep=${repName} deleteCRMProspect get`
  );
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1) return; // already gone

  await withRetry(
    () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId:    crmGid,
              dimension:  'ROWS',
              startIndex: idx + 1, // +1 for header row
              endIndex:   idx + 2,
            },
          },
        }],
      },
    }),
    `hub=${hub} rep=${repName} deleteCRMProspect delete`
  );
}

// ── CRM Relances (Mod 6) — CRM tab is READ-ONLY, relances go in CRM_Relances ──

const CRM_RELANCES_TAB     = 'CRM_Relances';
const CRM_RELANCES_HEADERS = ['id_relance', 'id_prospect', 'date_relance', 'commentaire', 'done', 'created_at'];

function rowToRelance(row: string[]): CRMRelance {
  return {
    id:          row[0] ?? '',
    idProspect:  row[1] ?? '',
    dateRelance: row[2] ?? '',
    commentaire: row[3] ?? '',
    done:        row[4] === 'Oui',
    createdAt:   row[5] ?? '',
  };
}

function relanceToRow(r: CRMRelance): string[] {
  return [
    r.id,
    r.idProspect,
    r.dateRelance,
    r.commentaire,
    r.done ? 'Oui' : 'Non',
    r.createdAt,
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateRelancesSheet(sheets: any, spreadsheetId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: any = await withRetry(
    () => sheets.spreadsheets.get({ spreadsheetId }),
    `getOrCreateRelancesSheet spreadsheetId=${spreadsheetId}`
  );
  const existing = (meta.data.sheets as { properties?: { title?: string; sheetId?: number } }[])
    ?.find((s) => s.properties?.title === CRM_RELANCES_TAB);

  if (existing) return existing.properties!.sheetId!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createRes: any = await withRetry(
    () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CRM_RELANCES_TAB } } }] },
    }),
    `getOrCreateRelancesSheet batchUpdate spreadsheetId=${spreadsheetId}`
  );
  const newGid: number = createRes.data.replies[0].addSheet.properties.sheetId;

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CRM_RELANCES_HEADERS] },
    }),
    `getOrCreateRelancesSheet initHeaders spreadsheetId=${spreadsheetId}`
  );

  return newGid;
}

export async function getCRMRelances(hub: string, repName: string): Promise<CRMRelance[]> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const res = await withRetry(
      () => sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${CRM_RELANCES_TAB}!A2:F`,
      }),
      `hub=${hub} rep=${repName} getCRMRelances`
    );
    const rows = (res.data.values ?? []) as string[][];
    return rows.filter((r) => r[0]).map(rowToRelance);
  } catch {
    return [];
  }
}

export async function addCRMRelance(
  hub: string,
  repName: string,
  data: Omit<CRMRelance, 'id'>
): Promise<CRMRelance> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await getOrCreateRelancesSheet(sheets, spreadsheetId);

  const relance: CRMRelance = { id: randomUUID(), ...data };

  // Find next empty row explicitly to avoid column mis-detection
  const colARes = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A:A`,
    }),
    `hub=${hub} rep=${repName} addCRMRelance findNextRow`
  );
  const nextRow = ((colARes.data.values ?? []) as string[][]).length + 1;

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A${nextRow}:F${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [relanceToRow(relance)] },
    }),
    `hub=${hub} rep=${repName} addCRMRelance`
  );

  return relance;
}

export async function updateCRMRelance(
  hub: string,
  repName: string,
  id: string,
  updates: Partial<Omit<CRMRelance, 'id' | 'idProspect' | 'createdAt'>>
): Promise<void> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await getOrCreateRelancesSheet(sheets, spreadsheetId);

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A2:F`,
    }),
    `hub=${hub} rep=${repName} updateCRMRelance get`
  );
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1) throw new Error(`CRM relance not found: ${id}`);

  const updated: CRMRelance = { ...rowToRelance(rows[idx]), ...updates };
  const sheetRow = idx + 2; // +1 for header, +1 for 1-based

  await withRetry(
    () => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A${sheetRow}:F${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [relanceToRow(updated)] },
    }),
    `hub=${hub} rep=${repName} updateCRMRelance put`
  );
}

export async function deleteCRMRelance(
  hub: string,
  repName: string,
  id: string
): Promise<void> {
  const spreadsheetId = getRepSheetId(hub, repName);
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const gid = await getOrCreateRelancesSheet(sheets, spreadsheetId);

  const res = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CRM_RELANCES_TAB}!A2:F`,
    }),
    `hub=${hub} rep=${repName} deleteCRMRelance get`
  );
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx === -1) return;

  await withRetry(
    () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId:    gid,
              dimension:  'ROWS',
              startIndex: idx + 1, // +1 for header row
              endIndex:   idx + 2,
            },
          },
        }],
      },
    }),
    `hub=${hub} rep=${repName} deleteCRMRelance delete`
  );
}
