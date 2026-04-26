'use client';

import { format, addDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BookingEntry } from '@/lib/types';

interface Props {
  entries: BookingEntry[];
  weekStart: string; // YYYY-MM-DD (Monday)
  title?: string;
}

const TARGET = 3;

function getBarColor(count: number): string {
  if (count >= TARGET) return 'bg-green-400';
  if (count >= 1) return 'bg-orange-400';
  return 'bg-red-200';
}

function getCountColor(count: number): string {
  if (count >= TARGET) return 'text-green-600';
  if (count >= 1) return 'text-orange-500';
  return 'text-gray-300';
}

export default function BookingChart({ entries, weekStart, title = 'RDV planifiés cette semaine' }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const days = Array.from({ length: 5 }, (_, i) => {
    const date = format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd');
    const count = entries.filter((e) => e.date === date).reduce((s, e) => s + e.count, 0);
    const dayLabel = format(addDays(parseISO(weekStart), i), 'EEE', { locale: fr });
    return { date, dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1, 3), count };
  });

  const maxCount = Math.max(...days.map((d) => d.count), TARGET);
  const scale = maxCount + 1;
  const targetPct = (TARGET / scale) * 100;

  const totalWeek = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
        <span className="text-sm font-bold text-gray-700">{totalWeek} total</span>
      </div>

      {/* Count labels */}
      <div className="flex gap-2 mb-1">
        {days.map((d) => (
          <div
            key={d.date}
            className={`flex-1 text-center text-xs font-bold ${getCountColor(d.count)}`}
          >
            {d.count > 0 ? d.count : '–'}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: '96px' }}>
        {/* Target dashed line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-blue-300 z-10 pointer-events-none"
          style={{ bottom: `${targetPct}%` }}
        >
          <span className="absolute right-0 -top-4 text-xs text-blue-400 font-semibold bg-white px-1">
            {TARGET}
          </span>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-2 h-full">
          {days.map((d) => {
            const heightPct = d.count > 0 ? Math.max((d.count / scale) * 100, 4) : 0;
            const isToday = d.date === today;
            return (
              <div
                key={d.date}
                className={`flex-1 rounded-t-md transition-all duration-500 ${getBarColor(d.count)} ${
                  isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''
                }`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Day labels */}
      <div className="flex gap-2 mt-1.5">
        {days.map((d) => (
          <div
            key={d.date}
            className={`flex-1 text-center text-xs font-semibold ${
              d.date === today ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            {d.dayLabel}
          </div>
        ))}
      </div>
    </div>
  );
}
