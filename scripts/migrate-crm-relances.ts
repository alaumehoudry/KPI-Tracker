/**
 * Mod 6 migration: create CRM_Relances tab and seed it from existing CRM rows
 * that have a dateRelance value (carrying over legacy relance dates).
 *
 * Usage:
 *   npx ts-node scripts/migrate-crm-relances.ts [--dry-run] [--rep=NOM] [--hub=sud|ra]
 *
 * Idempotent: if a relance already exists for a prospect ID it is not duplicated.
 */

import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import { HUB_CONFIG } from '../lib/constants';

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const hubArg  = (args.find((a) => a.startsWith('--hub=')) ?? '').replace('--hub=', '') || 'sud';
const repArg  = (args.find((a) => a.startsWith('--rep=')) ?? '').replace('--rep=', '');

const CRM_TAB          = 'CRM';
const CRM_RELANCES_TAB = 'CRM_Relances';
const CRM_RELANCES_HDR = ['id_relance', 'id_prospect', 'date_relance', 'commentaire', 'done', 'created_at'];

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  let credentials: object;
  try { credentials = JSON.parse(raw); }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateRelancesSheet(sheets: any, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = (meta.data.sheets as { properties?: { title?: string; sheetId?: number } }[])
    ?.find((s) => s.properties?.title === CRM_RELANCES_TAB);

  if (existing) return existing.properties!.sheetId!;

  if (DRY_RUN) {
    console.log(`    DRY RUN — would create tab "${CRM_RELANCES_TAB}"`);
    return -1;
  }

  const createRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: CRM_RELANCES_TAB } } }] },
  });
  const newGid: number = createRes.data.replies[0].addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CRM_RELANCES_TAB}!A1:F1`,
    valueInputOption: 'RAW',
    requestBody: { values: [CRM_RELANCES_HDR] },
  });

  return newGid;
}

async function migrateRep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: any,
  repName: string,
  sheetId: string
) {
  console.log(`\n[${repName}] spreadsheetId=${sheetId}`);

  // Ensure CRM_Relances tab exists
  await getOrCreateRelancesSheet(sheets, sheetId);

  // Read CRM tab
  let crmRows: string[][] = [];
  try {
    const crmRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${CRM_TAB}!A2:G`,
    });
    crmRows = (crmRes.data.values ?? []) as string[][];
  } catch {
    console.log(`  [${repName}] CRM tab not found, skipping`);
    return;
  }

  // Read existing CRM_Relances to avoid duplicates
  let existingRelances: string[][] = [];
  if (!DRY_RUN) {
    try {
      const relRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${CRM_RELANCES_TAB}!A2:F`,
      });
      existingRelances = (relRes.data.values ?? []) as string[][];
    } catch { /* empty tab */ }
  }

  const existingProspectIds = new Set(existingRelances.map((r) => r[1] ?? ''));

  // Build new relance rows from CRM rows that have a dateRelance and no existing relance
  const now = new Date().toISOString();
  const newRows: string[][] = [];

  for (const row of crmRows) {
    const prospectId  = row[0] ?? '';
    const dateRelance = row[4] ?? '';
    const done        = row[6] === 'TRUE';

    if (!prospectId || !dateRelance) continue;
    if (existingProspectIds.has(prospectId)) {
      console.log(`  [${repName}] prospect ${prospectId} already has relances, skipping`);
      continue;
    }

    newRows.push([
      randomUUID(),   // id_relance
      prospectId,     // id_prospect
      dateRelance,    // date_relance
      '',             // commentaire
      done ? 'Oui' : 'Non', // done (inherit prospect done state)
      now,            // created_at
    ]);
  }

  console.log(`  [${repName}] ${newRows.length} relances to seed`);
  if (newRows.length === 0) return;

  if (DRY_RUN) {
    console.log(`  DRY RUN — would insert ${newRows.length} rows into ${CRM_RELANCES_TAB}`);
    return;
  }

  // Find next empty row
  const colARes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CRM_RELANCES_TAB}!A:A`,
  });
  let nextRow = ((colARes.data.values ?? []) as string[][]).length + 1;

  // Write rows one batch
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: newRows.map((row, i) => ({
        range: `${CRM_RELANCES_TAB}!A${nextRow + i}:F${nextRow + i}`,
        values: [row],
      })),
    },
  });

  console.log(`  [${repName}] Seeded ${newRows.length} relances`);
}

async function main() {
  const hubCfg = HUB_CONFIG[hubArg];
  if (!hubCfg) { console.error(`Unknown hub: ${hubArg}`); process.exit(1); }

  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`Hub: ${hubArg} (${hubCfg.label})`);
  console.log(`Dry run: ${DRY_RUN}`);

  const repsToProcess = repArg
    ? [[repArg, hubCfg.repSheetIds[repArg]] as [string, string]]
    : Object.entries(hubCfg.repSheetIds) as [string, string][];

  for (const [repName, sheetId] of repsToProcess) {
    if (!sheetId) { console.warn(`No sheet ID for ${repName}, skipping`); continue; }
    await migrateRep(sheets, repName, sheetId);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
