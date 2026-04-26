import { format, startOfWeek, endOfWeek, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';

export function getMondayOfWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function formatWeekRange(monday: Date): string {
  const sunday = endOfWeek(monday, { weekStartsOn: 1 });
  return `${format(monday, 'd MMM', { locale: fr })} – ${format(sunday, 'd MMM yyyy', { locale: fr })}`;
}

export function formatMondayKey(date: Date): string {
  return format(getMondayOfWeek(date), 'yyyy-MM-dd');
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: fr });
  } catch {
    return dateStr;
  }
}

/**
 * Normalises a raw cell value from Google Sheets into a YYYY-MM-DD string.
 * Handles:
 *   - ISO 8601: "2026-04-14" or "2026-04-14T10:30:00" or "2026-04-14 10:30:00"
 *   - European DD/MM/YYYY: "14/04/2026" or "14/4/2026"
 *   - US MM/DD/YYYY: "04/14/2026" (detected when day slot > 12)
 *   - Dot-separated: "14.04.2026"
 *   - Excel / Sheets serial numbers (~40000–70000)
 * Returns the raw string unchanged if none of the patterns match.
 */
export function parseSheetDate(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();

  // ISO 8601 with optional time suffix: 2026-04-14 | 2026-04-14T10:30 | 2026-04-14 10:30:00
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // Slash-separated: could be DD/MM/YYYY (European) or MM/DD/YYYY (US)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = parseInt(slash[1], 10); // left  number
    const b = parseInt(slash[2], 10); // right number
    const yr = slash[3];
    if (a > 12) {
      // a can't be a month → must be DD/MM
      return `${yr}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
    }
    if (b > 12) {
      // b can't be a month → must be MM/DD (US)
      return `${yr}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
    }
    // Ambiguous — assume European (DD/MM) for this French app
    return `${yr}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }

  // Dot-separated: 14.04.2026
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) {
    return `${dot[3]}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`;
  }

  // Excel / Google Sheets serial number (integers ~40000–70000 cover 2009–2063)
  const serial = Number(s);
  if (Number.isInteger(serial) && serial > 40000 && serial < 70000) {
    // Excel epoch is 1899-12-30; subtract 25569 days to get Unix epoch days
    const d = new Date((serial - 25569) * 86_400_000);
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }

  // Last resort: let date-fns try to parse it
  try {
    const d = parseISO(s);
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  } catch {
    // ignore
  }

  return s; // unknown format — return as-is so logging is still useful
}

/**
 * Normalises a person's name for booking-sheet lookup.
 * Strips diacritics and lowercases so "Raphaël" == "Raphael",
 * "Édouard" == "Edouard", "Mattéo" == "Matteo", etc.
 */
export function normalizeBookingName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove combining diacritical marks
}

/**
 * Returns true if a YYYY-MM-DD dateStr falls within the Mon–Sun week that
 * starts on weekMonday (also YYYY-MM-DD).  All comparisons are local-date
 * only (no timezone shifts).
 */
export function isInWeekRange(dateStr: string, weekMonday: string): boolean {
  if (!dateStr || !weekMonday) return false;
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const [wy, wm, wd] = weekMonday.split('-').map(Number);
  if (!dy || !wy) return false;
  const date = new Date(dy, dm - 1, dd);
  const monday = new Date(wy, wm - 1, wd);
  const sunday = new Date(wy, wm - 1, wd + 6); // +6 days = Sunday
  return date >= monday && date <= sunday;
}

/**
 * Returns a Tailwind text color class based on how the value compares to the target.
 * Green ≥ target, orange ≥ 70% of target, red below.
 */
export function getColorForRate(value: number, target: number): string {
  if (value >= target) return 'text-green-600';
  if (value >= target * 0.7) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Returns a Tailwind bg color class for progress bars.
 */
export function getBgColorForRate(value: number, target: number): string {
  if (value >= target) return 'bg-green-500';
  if (value >= target * 0.7) return 'bg-orange-400';
  return 'bg-red-500';
}

export class TimeoutError extends Error {
  constructor() {
    super('La requête a pris trop de temps');
    this.name = 'TimeoutError';
  }
}

/**
 * Typed fetch helper for client components.
 * Throws TimeoutError after timeoutMs (default 15 s).
 * Throws with a human-readable French message on non-ok responses.
 */
export async function fetchJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const timeoutAc = new AbortController();

  // Forward external abort (unmount / new request) into our controller
  const onAbort = () => timeoutAc.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);

  const tid = setTimeout(() => timeoutAc.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: timeoutAc.signal });
    clearTimeout(tid);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `Erreur serveur (HTTP ${res.status})`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    clearTimeout(tid);
    // Our timeout fired but the caller didn't abort → TimeoutError
    if (timeoutAc.signal.aborted && !signal?.aborted) {
      throw new TimeoutError();
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
