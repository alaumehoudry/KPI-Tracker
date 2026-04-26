/**
 * Mod 5 migration: add Register / Contrat / POS Plus columns (L, M, N) to
 * existing RDV rows that were written before Mod 5.
 *
 * Usage:
 *   npx ts-node scripts/migrate-add-product-columns.ts [--dry-run] [--rep=NOM] [--hub=sud|ra]
 *
 * Idempotent: rows that already have a value in col L are skipped.
 */

import { google } from 'googleapis';
import { HUB_CONFIG } from '../lib/constants';

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const hubArg  = (args.find((a) => a.startsWith('--hub=')) ?? '').replace('--hub=', '') || 'sud';
const repArg  = (args.find((a) => a.startsWith('--rep=')) ?? '').replace('--rep=', '');

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

async function migrateRep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: any,
  repName: string,
  sheetId: string,
  tabName: string
) {
  console.log(`\n[${repName}] Reading ${tabName}!A:N from ${sheetId}`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:N`,
  });

  const rows: string[][] = (res.data.values ?? []) as string[][];
  console.log(`[${repName}] ${rows.length} rows found`);

  // Collect ranges to update: rows where col K (index 10) = '1' and col L (index 11) is empty
  const updates: { range: string; values: string[][] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const colK = row[10] ?? '';
    const colL = row[11] ?? '';

    if (colK === '1' && colL === '') {
      const sheetRow = i + 1; // 1-based
      updates.push({
        range: `${tabName}!L${sheetRow}:N${sheetRow}`,
        values: [['Non', 'Non', 'Non']],
      });
    }
  }

  console.log(`[${repName}] ${updates.length} rows need product columns`);
  if (updates.length === 0) return;

  if (DRY_RUN) {
    console.log(`[${repName}] DRY RUN — would update rows:`, updates.map((u) => u.range));
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  console.log(`[${repName}] Updated ${updates.length} rows`);
}

async function main() {
  const hubCfg = HUB_CONFIG[hubArg];
  if (!hubCfg) { console.error(`Unknown hub: ${hubArg}`); process.exit(1); }

  const tabName = hubCfg.individualReadTab ?? 'Saisie_RDV';
  const auth    = getAuth();
  const sheets  = google.sheets({ version: 'v4', auth });

  console.log(`Hub: ${hubArg} (${hubCfg.label})`);
  console.log(`Tab: ${tabName}`);
  console.log(`Dry run: ${DRY_RUN}`);

  const repsToProcess = repArg
    ? [[repArg, hubCfg.repSheetIds[repArg]] as [string, string]]
    : Object.entries(hubCfg.repSheetIds) as [string, string][];

  for (const [repName, sheetId] of repsToProcess) {
    if (!sheetId) { console.warn(`No sheet ID for ${repName}, skipping`); continue; }
    await migrateRep(sheets, repName, sheetId, tabName);
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
