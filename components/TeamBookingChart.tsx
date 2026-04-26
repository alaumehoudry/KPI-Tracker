'use client';

import { useState } from 'react';
import { format, addDays, parseISO, startOfWeek, getMonth, getYear, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BookingEntry } from '@/lib/types';

const DAILY_TARGET_SINGLE = 3;

interface BarData {
  label: string;
  count: number;
  key: string;
}

function getWeeklyBars(entries: BookingEntry[], weekStart: string, selectedRep: string): BarData[] {
  return Array.from({ length: 5 }, (_, i) => {
    const date = format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd');
    const dayLabel = format(addDays(parseISO(weekStart), i), 'EEE', { locale: fr });
    const count = entries
      .filter((e) => (!selectedRep || e.repName === selectedRep) && e.date === date)
      .reduce((s, e) => s + e.count, 0);
    return {
      label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1, 3),
      count,
      key: date,
    };
  });
}

function getMonthlyBars(entries: BookingEntry[], currentMonth: Date, selectedRep: string): BarData[] {
  const year = getYear(currentMonth);
  const month = getMonth(currentMonth); // 0-indexed

  // Start from the Monday of the week containing the 1st of the month
  const firstDay = new Date(year, month, 1);
  let monday = startOfWeek(firstDay, { weekStartsOn: 1 });

  const bars: BarData[] = [];

  while (true) {
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);

    const mondayInTarget =
      getYear(monday) === year && getMonth(monday) === month;
    const sundayInTarget =
      getYear(sunday) === year && getMonth(sunday) === month;

    // Past the target month — stop
    if (
      !mondayInTarget &&
      !sundayInTarget &&
      (getYear(monday) > year || (getYear(monday) === year && getMonth(monday) > month))
    ) {
      break;
    }

    // Before the target month — skip forward
    if (!mondayInTarget && !sundayInTarget) {
      monday = addWeeks(monday, 1);
      continue;
    }

    const mondayStr = format(monday, 'yyyy-MM-dd');
    const sundayStr = format(sunday, 'yyyy-MM-dd');

    const count = entries
      .filter(
        (e) =>
          (!selectedRep || e.repName === selectedRep) &&
          e.date >= mondayStr &&
          e.date <= sundayStr
      )
      .reduce((s, e) => s + e.count, 0);

    // Label: "7 avr", "14 avr", etc.
    const label = format(monday, 'd MMM', { locale: fr });
    bars.push({ label, count, key: mondayStr });

    monday = addWeeks(monday, 1);
  }

  return bars;
}

interface Props {
  entries: BookingEntry[];
  view: 'weekly' | 'monthly';
  weekStart: string;     // YYYY-MM-DD Monday
  currentMonth: Date;    // used in monthly mode
  repNames: string[];    // alphabetically sorted list of rep names
  teamSize?: number;     // defaults to repNames.length; used for team target (teamSize × 3)
}

export default function TeamBookingChart({
  entries,
  view,
  weekStart,
  currentMonth,
  repNames,
  teamSize,
}: Props) {
  const [selectedRep, setSelectedRep] = useState(''); // '' = toute l'équipe

  const bars =
    view === 'weekly'
      ? getWeeklyBars(entries, weekStart, selectedRep)
      : getMonthlyBars(entries, currentMonth, selectedRep);

  const total = bars.reduce((s, b) => s + b.count, 0);

  const isTeam = selectedRep === '';
  const effectiveTeamSize = teamSize ?? repNames.length;
  const DAILY_TARGET_TEAM = effectiveTeamSize * DAILY_TARGET_SINGLE;
  const dailyTarget = isTeam ? DAILY_TARGET_TEAM : DAILY_TARGET_SINGLE;
  // Per-bar target: daily for weekly view, weekly (×5 days) for monthly view
  const barTarget = view === 'monthly' ? dailyTarget * 5 : dailyTarget;

  const maxCount = Math.max(...bars.map((b) => b.count), barTarget, 1);
  // Add 15% headroom so the target line isn't flush with the top
  const scale = maxCount * 1.15;
  const targetPct = (barTarget / scale) * 100;

  const periodLabel = view === 'weekly' ? 'cette semaine' : 'ce mois';
  const targetLineLabel =
    isTeam ? 'Cible équipe' : view === 'monthly' ? 'Cible : 15/sem' : 'Cible : 3/jour';

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            RDV Pris — Vue Équipe
          </h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {total}{' '}
            <span className="text-sm font-normal text-gray-400">
              RDV pris {periodLabel}
            </span>
          </p>
        </div>

        {/* Rep selector dropdown */}
        <select
          value={selectedRep}
          onChange={(e) => setSelectedRep(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 self-start"
        >
          <option value="">Toute l&apos;équipe</option>
          {repNames.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Count labels above bars */}
      <div className="flex gap-2 mb-1">
        {bars.map((b) => (
          <div
            key={b.key}
            className={`flex-1 text-center text-xs font-bold ${
              b.count >= barTarget
                ? 'text-green-600'
                : b.count > 0
                ? 'text-gray-700'
                : 'text-gray-300'
            }`}
          >
            {b.count > 0 ? b.count : '–'}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: '112px' }}>
        {/* Target dashed line */}
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none"
          style={{ bottom: `${targetPct}%` }}
        >
          <div className="border-t-2 border-dashed border-orange-400 relative">
            <span className="absolute right-0 -top-5 text-xs text-orange-500 font-semibold bg-white px-1 leading-tight">
              {targetLineLabel}
            </span>
          </div>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-2 h-full">
          {bars.map((b) => {
            const heightPct = b.count > 0 ? Math.max((b.count / scale) * 100, 3) : 0;
            const barColor =
              b.count >= barTarget
                ? 'bg-green-400'
                : b.count > 0
                ? 'bg-blue-400'
                : 'bg-gray-100';
            return (
              <div
                key={b.key}
                className={`flex-1 rounded-t-md transition-all duration-500 ${barColor}`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Bar labels */}
      <div className="flex gap-2 mt-1.5">
        {bars.map((b) => (
          <div
            key={b.key}
            className="flex-1 text-center text-xs font-semibold text-gray-400 truncate"
          >
            {b.label}
          </div>
        ))}
      </div>

      {/* Footer summary */}
      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        {total} RDV pris — Cible&nbsp;: {barTarget}
        {view === 'weekly' ? '/jour' : '/sem'}
      </div>
    </div>
  );
}
