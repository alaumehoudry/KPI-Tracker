'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import RDVList from '@/components/RDVList';
import Scorecard from '@/components/Scorecard';
import type { RDVRow, RepStats } from '@/lib/types';
import { REP_MAP } from '@/lib/constants';

const REFRESH_INTERVAL = 30 * 60 * 1000;

export default function RepDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repName = decodeURIComponent(String(params.rep));

  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [rows, setRows] = useState<RDVRow[]>([]);
  const [stats, setStats] = useState<RepStats | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const weekKey = format(currentWeek, 'yyyy-MM-dd');
  const weekLabel = `${format(currentWeek, 'd MMM', { locale: fr })} – ${format(
    endOfWeek(currentWeek, { weekStartsOn: 1 }),
    'd MMM yyyy',
    { locale: fr }
  )}`;

  const repId = REP_MAP[repName];

  const fetchData = useCallback(async () => {
    if (!repId) return;
    setLoading(true);
    try {
      const [rowsRes, statsRes] = await Promise.all([
        fetch(`/api/rdv?rep=${encodeURIComponent(repName)}&week=${weekKey}`),
        fetch(`/api/stats?week=${weekKey}`),
      ]);

      if (rowsRes.ok) {
        const data = await rowsRes.json();
        setRows(data.rows ?? []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        const repStat =
          (data.stats as RepStats[])?.find((s) => s.repId === repId) ?? null;
        setStats(repStat);
      }
    } finally {
      setLoading(false);
    }
  }, [repName, repId, weekKey]);

  useEffect(() => {
    fetchData();

    refreshTimer.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchData]);

  if (!repId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Commercial inconnu : {repName}</p>
          <button
            onClick={() => router.push('/manager')}
            className="text-blue-500 hover:underline text-sm"
          >
            ← Retour au cockpit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/manager')}
              className="text-gray-400 hover:text-gray-700 text-sm font-medium"
            >
              ←
            </button>
            <div>
              <h1 className="font-bold text-gray-900">{repName}</h1>
              <p className="text-xs text-gray-400">Détail commercial</p>
            </div>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentWeek((w) => subWeeks(w, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 font-bold transition-colors"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-gray-600 min-w-[110px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={() => setCurrentWeek((w) => addWeeks(w, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 font-bold transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            RDV effectués ({rows.length})
          </h2>
          <RDVList rows={rows} loading={loading} />
        </section>

        {/* Section 3: KPIs */}
        <Scorecard stats={stats} loading={loading} />

        <div className="pb-8" />
      </main>
    </div>
  );
}
