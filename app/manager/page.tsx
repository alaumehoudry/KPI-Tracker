'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import KPICard from '@/components/KPICard';
import RepTable from '@/components/RepTable';
import type { RepStats, TeamSummary } from '@/lib/types';
import { KPI_TARGETS } from '@/lib/constants';
import { getColorForRate } from '@/lib/utils';

type ViewMode = 'weekly' | 'monthly';

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

export default function ManagerPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('weekly');
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [stats, setStats] = useState<RepStats[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const weekKey = format(currentWeek, 'yyyy-MM-dd');
  const monthKey = format(currentMonth, 'yyyy-MM');

  const weekLabel = `${format(currentWeek, 'd MMM', { locale: fr })} – ${format(
    endOfWeek(currentWeek, { weekStartsOn: 1 }),
    'd MMM yyyy',
    { locale: fr }
  )}`;
  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: fr });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const periodParam = view === 'weekly' ? `week=${weekKey}` : `month=${monthKey}`;
      const res = await fetch(`/api/stats?${periodParam}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats ?? []);
        setSummary(data.summary ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [view, weekKey, monthKey]);

  useEffect(() => {
    fetchStats();

    refreshTimer.current = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchStats]);

  function handleRepClick(repName: string) {
    router.push(`/manager/${encodeURIComponent(repName)}`);
  }

  function exportCSV() {
    const headers = ['Commercial', 'RDV effectués', 'Taux présence %', 'Taux closing %', 'Ventes signées', 'Register', 'Contrat', 'POS Plus', 'Net Revenue €'];
    const dataRows = stats
      .filter((s) => s.totalRDV > 0)
      .sort((a, b) => b.totalRDV - a.totalRDV)
      .map((s) => [
        s.repName,
        s.totalRDV       > 0 ? s.totalRDV              : '',
        s.totalRDV       > 0 ? `${s.tauxPresence}%`    : '',
        s.rdvEffectues   > 0 ? `${s.tauxClosing}%`     : '',
        s.ventesSignees  > 0 ? s.ventesSignees          : '',
        s.totalRegister  > 0 ? s.totalRegister          : '',
        s.totalContrat   > 0 ? s.totalContrat           : '',
        s.totalPosPlus   > 0 ? s.totalPosPlus           : '',
        s.netRevenue     > 0 ? s.netRevenue.toFixed(2)  : '',
      ]);

    const csv = [headers, ...dataRows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpi-${view === 'weekly' ? weekKey : monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-gray-400 hover:text-gray-700 text-sm font-medium">
              ← Retour
            </a>
            <div>
              <h1 className="font-bold text-gray-900">Manager</h1>
              <p className="text-xs text-gray-400">SumUp KPI Tracker</p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-700 active:scale-95 transition-all font-semibold"
          >
            Exporter CSV
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Controls: toggle + date nav */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* View toggle */}
          <div className="flex bg-gray-200 rounded-xl p-1">
            <button
              onClick={() => setView('weekly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'weekly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => setView('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mois
            </button>
          </div>

          {/* Date navigator */}
          {view === 'weekly' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentWeek((w) => subWeeks(w, 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">
                {weekLabel}
              </span>
              <button
                onClick={() => setCurrentWeek((w) => addWeeks(w, 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors"
              >
                ›
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-700 min-w-[150px] text-center capitalize">
                {monthLabel}
              </span>
              <button
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {/* Team KPI cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard label="Total RDV" value={summary.totalRDV} sub="équipe" />
            <KPICard
              label="Taux présence"
              value={`${summary.tauxPresence}%`}
              sub={`cible ${KPI_TARGETS.tauxPresence}%`}
              colorClass={getColorForRate(summary.tauxPresence, KPI_TARGETS.tauxPresence)}
            />
            <KPICard
              label="Taux closing"
              value={`${summary.tauxClosing}%`}
              sub={`cible ${KPI_TARGETS.tauxClosing}%`}
              colorClass={getColorForRate(summary.tauxClosing, KPI_TARGETS.tauxClosing)}
            />
            <KPICard
              label="Net Revenue"
              value={`${summary.netRevenue.toLocaleString('fr-FR')} €`}
              colorClass="text-green-600"
            />
          </div>
        ) : null}

        {/* Per-rep breakdown */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Performance par commercial
          </h2>
          {loading ? (
            <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
          ) : (
            <RepTable
              stats={stats}
              view={view}
              onRepClick={handleRepClick}
            />
          )}
        </section>

        {/* Legend */}
        <div className="flex gap-5 text-xs text-gray-400 pb-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ≥ cible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> 70–99% de la cible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {'<'} 70% de la cible
          </span>
        </div>
      </main>
    </div>
  );
}
