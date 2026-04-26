/**
 * Diagnostic endpoint — never deployed to production.
 * Call: GET /api/debug?hub=ra
 * Returns raw sheet metadata + first rows to diagnose data issues.
 */
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { HUB_CONFIG } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  let credentials: object;
  try { credentials = JSON.parse(raw); }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function inspectSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: any,
  spreadsheetId: string,
  label: string,
  tabsToRead: string[] = [],
) {
  // 1. List all tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs: string[] = (meta.data.sheets as { properties?: { title?: string } }[])
    .map((s) => s.properties?.title ?? '(no title)');

  const reads: Record<string, unknown> = {};

  // 2. Read each requested tab (first 8 rows, all columns)
  for (const tab of tabsToRead) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A1:L8`,
      });
      reads[tab] = (res.data.values ?? []).map((row: string[], i: number) => ({
        rowIndex: i + 1,
        cols: row,
      }));
    } catch (err) {
      reads[tab] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 3. Also read the first tab automatically (whatever it is)
  if (tabs.length > 0 && !tabsToRead.includes(tabs[0])) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabs[0]}!A1:L8`,
      });
      reads[`[first tab: ${tabs[0]}]`] = (res.data.values ?? []).map((row: string[], i: number) => ({
        rowIndex: i + 1,
        cols: row,
      }));
    } catch (err) {
      reads[`[first tab: ${tabs[0]}]`] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { label, spreadsheetId, tabs, reads };
}

export async function GET(req: NextRequest) {
  const hub = new URL(req.url).searchParams.get('hub') ?? 'ra';
  const hubCfg = HUB_CONFIG[hub];
  if (!hubCfg) return NextResponse.json({ error: `Unknown hub: ${hub}` }, { status: 400 });

  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Get first rep name + sheet id for individual sheet inspection
  const firstRepName = Object.keys(hubCfg.repSheetIds)[0]; // e.g. LOUISE
  const firstRepSheetId = hubCfg.repSheetIds[firstRepName];

  const [masterInfo, individualInfo] = await Promise.all([
    inspectSheet(sheets, hubCfg.masterSheetId, `${hub} MASTER SHEET`, [
      'Saisie_RDV_All',
      'Saisie_RDV_All ',  // with trailing space
      'saisie_rdv_all',   // lowercase
      'Saisie RDV All',   // with spaces
    ]),
    inspectSheet(sheets, firstRepSheetId, `${firstRepName} individual sheet`, [
      'Saisie_RDV',
      'Saisie_RDV ',      // with trailing space
      'Saisie RDV',       // with space
      'saisie_rdv',       // lowercase
    ]),
  ]);

  return NextResponse.json(
    {
      hub,
      hubLabel:         hubCfg.label,
      masterSheetId:    hubCfg.masterSheetId,
      firstRep:         firstRepName,
      firstRepSheetId,
      repMap:           hubCfg.repMap,
      master:           masterInfo,
      individual:       individualInfo,
    },
    { status: 200 }
  );
}
