/**
 * Migration script: Google Sheets → Supabase (table: rdv)
 *
 * Reads all Saisie_RDV rows for every rep in Hub Sud + Hub RA,
 * then batch-inserts them into the Supabase `rdv` table.
 *
 * Usage (from project root):
 *   npx tsx scripts/migrate.ts
 *
 * The script reads .env.local for GOOGLE_SERVICE_ACCOUNT_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'fs';
import path from 'path';

// ── Load .env.local before importing anything that reads process.env ──────────

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
  console.log('Loaded .env.local');
} else {
  console.warn('.env.local not found — relying on existing environment variables');
}

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { HUB_CONFIG } from '../lib/constants';
import { parseSheetDate } from '../lib/utils';

// ── Clients ───────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  try {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase().trim();
}
function findInMap<T>(map: Record<string, T>, key: string): T | undefined {
  if (key in map) return map[key];
  const norm = normalizeStr(key);
  return Object.entries(map).find(([k]) => normalizeStr(k) === norm)?.[1];
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (!RETRYABLE.has(status ?? 0) || attempt === 2) throw err;
      const delay = 2 ** attempt * 1500;
      console.warn(`  Retry ${attempt + 1} after ${delay}ms (HTTP ${status})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('unreachable');
}

// ── Column mapping ────────────────────────────────────────────────────────────
// Google Sheets columns A-N (0-indexed):
// A=0  semaine (Monday YYYY-MM-DD)
// B=1  commercial (repId on master, repName on individual sheets)
// C=2  client
// D=3  dateRDV
// E=4  heureRDV
// F=5  rdvEffectue  ('Oui'/'Non')
// G=6  venteSignee  ('Oui'/'Non')
// H=7  clientActive ('Oui'/'Non')
// I=8  netRevenue
// J=9  notes
// K=10 rdvValide (always 1)
// L=11 register  ('Oui'/'Non')
// M=12 contrat   ('Oui'/'Non')
// N=13 posPlus   ('Oui'/'Non')

interface SupabaseRDV {
  hub: string;
  commercial: string;
  client: string;
  date_rdv: string;
  heure_rdv: string;
  rdv_effectue: boolean;
  vente_signee: boolean;
  net_revenue: number | null;
  notes: string;
  register: boolean;
  contrat: boolean;
  pos_plus: boolean;
  semaine: string;
}

function parseRow(
  row: string[],
  hub: string,
  repIdOverride?: string
): SupabaseRDV | null {
  const colA = row[0] ?? '';
  const colB = row[1] ?? '';
  const colD = row[3] ?? '';

  const commercial = repIdOverride ?? colB;
  if (!commercial) return null;

  const dateRDV = parseSheetDate(colD) || parseSheetDate(colA);
  if (!dateRDV || !/^\d{4}-\d{2}-\d{2}$/.test(dateRDV)) return null;

  const semaineRaw = parseSheetDate(colA) || dateRDV;
  const semaine = /^\d{4}-\d{2}-\d{2}$/.test(semaineRaw) ? semaineRaw : dateRDV;

  return {
    hub,
    commercial,
    client:       (row[2] ?? '').trim(),
    date_rdv:     dateRDV,
    heure_rdv:    row[4] ?? '',
    rdv_effectue: row[5] === 'Oui',
    vente_signee: row[6] === 'Oui',
    net_revenue:  row[8] ? parseFloat(String(row[8]).replace(',', '.')) || null : null,
    notes:        row[9] ?? '',
    register:     row[11] === 'Oui',
    contrat:      row[12] === 'Oui',
    pos_plus:     row[13] === 'Oui',
    semaine,
  };
}

// ── Read from Google Sheets ───────────────────────────────────────────────────

async function readMasterSheet(hub: string): Promise<SupabaseRDV[]> {
  const hubCfg = HUB_CONFIG[hub];
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`  Reading master sheet (${hubCfg.masterSheetId})…`);
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: hubCfg.masterSheetId,
      range: 'Saisie_RDV_All!A3:N',
    })
  );

  const raw = (res.data.values ?? []) as string[][];
  const records: SupabaseRDV[] = [];
  let skipped = 0;
  for (const row of raw) {
    const parsed = parseRow(row, hub);
    if (parsed) records.push(parsed);
    else skipped++;
  }
  console.log(`  Master: ${records.length} valid, ${skipped} skipped`);
  return records;
}

async function readIndividualSheets(hub: string): Promise<SupabaseRDV[]> {
  const hubCfg = HUB_CONFIG[hub];
  const tabName = hubCfg.individualReadTab!;
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const all: SupabaseRDV[] = [];

  for (const [repName, sheetId] of Object.entries(hubCfg.repSheetIds)) {
    const repId = findInMap(hubCfg.repMap, repName);
    if (!repId) {
      console.warn(`  Skipping ${repName}: no repId in repMap`);
      continue;
    }

    try {
      const res = await withRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${tabName}!A1:N`,
        })
      );
      const raw = (res.data.values ?? []) as string[][];
      const records: SupabaseRDV[] = [];
      for (const row of raw) {
        const parsed = parseRow(row, hub, repId);
        if (parsed) records.push(parsed);
      }
      console.log(`  ${repName}: ${records.length}/${raw.length} rows`);
      all.push(...records);
    } catch (err) {
      console.error(`  ${repName} ERROR:`, (err as Error).message);
    }

    // Rate-limit: 1 read per second to stay under Sheets quota
    await new Promise((r) => setTimeout(r, 1000));
  }

  return all;
}

// ── Insert into Supabase ──────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function insertBatches(records: SupabaseRDV[], hub: string): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  const total = records.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    const { error } = await supabase.from('rdv').insert(batch);
    if (error) {
      console.error(`  [hub=${hub}] Batch ${batchNum}/${totalBatches} FAILED:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  [hub=${hub}] Batch ${batchNum}/${totalBatches}: ${inserted}/${total} inserted`);
    }
  }

  return { inserted, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function migrateHub(hub: string): Promise<{ inserted: number; errors: number }> {
  const hubCfg = HUB_CONFIG[hub];
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Hub: ${hubCfg.label} (${hub})`);

  const records = hubCfg.individualReadTab
    ? await readIndividualSheets(hub)
    : await readMasterSheet(hub);

  console.log(`  Total to insert: ${records.length}`);
  if (records.length === 0) return { inserted: 0, errors: 0 };

  return insertBatches(records, hub);
}

async function main() {
  console.log('Google Sheets → Supabase migration');
  console.log('Table: rdv');
  console.log('='.repeat(60));

  // Verify Supabase connection
  const { error: pingErr } = await supabase.from('rdv').select('id').limit(1);
  if (pingErr) {
    console.error('Cannot connect to Supabase:', pingErr.message);
    process.exit(1);
  }
  console.log('Supabase connection OK');

  let totalInserted = 0;
  let totalErrors = 0;

  for (const hub of ['sud', 'ra']) {
    const { inserted, errors } = await migrateHub(hub);
    totalInserted += inserted;
    totalErrors += errors;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Migration complete`);
  console.log(`  Inserted : ${totalInserted}`);
  console.log(`  Errors   : ${totalErrors}`);

  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
