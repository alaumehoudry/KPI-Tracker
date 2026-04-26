'use client';

import { useState, useEffect } from 'react';
import { HUB_CONFIG } from '@/lib/constants';

interface Props {
  hub: string;
  onSelect: (rep: string) => void;
  onBack: () => void;
}

export default function RepSelector({ hub, onSelect, onBack }: Props) {
  const hubCfg   = HUB_CONFIG[hub];
  const repNames = hubCfg ? Object.keys(hubCfg.repMap).sort() : [];

  const [overdueCounts, setOverdueCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!hubCfg || repNames.length === 0) return;

    // Build today's date as a YYYY-MM-DD string in local time.
    // Avoids the UTC-midnight trap of new Date("YYYY-MM-DD") which parses as
    // UTC and appears as "tomorrow at 00:00" in timezones ahead of UTC (e.g. France).
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    Promise.all(
      repNames.map(async (rep) => {
        try {
          const res = await fetch(`/api/crm?hub=${hub}&rep=${encodeURIComponent(rep)}`);
          if (!res.ok) return [rep, 0] as [string, number];
          const data = await res.json();
          const prospects: { done: boolean; dateRelance: string }[] = data.prospects ?? [];
          // String comparison is safe for YYYY-MM-DD: lexicographic order = chronological order
          const count = prospects.filter(
            (p) => !p.done && p.dateRelance && p.dateRelance <= todayStr
          ).length;
          return [rep, count] as [string, number];
        } catch {
          return [rep, 0] as [string, number];
        }
      })
    ).then((results) => {
      const counts: Record<string, number> = {};
      for (const [rep, count] of results) counts[rep] = count;
      setOverdueCounts(counts);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/sumup-logo.png" width="64" height="64" alt="SumUp" className="mx-auto mb-4 rounded-2xl" />
          <h1 className="text-2xl font-bold text-gray-900">SumUp KPI Tracker</h1>
          {hubCfg && (
            <p className="text-blue-500 text-xs font-semibold uppercase tracking-widest mt-1">
              {hubCfg.label}
            </p>
          )}
          <p className="text-gray-500 mt-2 text-sm">Sélectionne ton nom pour commencer</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {repNames.map((name) => {
            const overdueCount = overdueCounts[name] ?? 0;
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className="relative bg-white border border-gray-200 rounded-xl p-4 text-center font-semibold text-gray-800 hover:bg-blue-50 hover:border-blue-400 active:scale-95 transition-all shadow-sm text-sm"
              >
                {name}
                {overdueCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
                    {overdueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <a href={`/hub/${hub}/manager`} className="text-sm text-blue-500 hover:underline">
            Vue Cockpit →
          </a>
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Changer de hub
          </button>
        </div>
      </div>
    </div>
  );
}
