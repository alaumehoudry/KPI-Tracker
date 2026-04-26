'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import KPICard from '@/components/KPICard';
import RepTable from '@/components/RepTable';
import type { RepStats, TeamSummary } from '@/lib/types';
import { KPI_TARGETS, HUB_CONFIG } from '@/lib/constants';
import { getColorForRate, fetchJson } from '@/lib/utils';

type ViewMode = 'weekly' | 'monthly';

const REFRESH_INTERVAL = 30 * 60 * 1000;

export default function HubManagerPage() {
  const params  = useParams();
  const router  = useRouter();
  const hub     = String(params.hub);
  const hubCfg  = HUB_CONFIG[hub];

  const [view,           setView]           = useState<ViewMode>('weekly');
  const [currentWeek,    setCurrentWeek]    = useState<Date>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const w = p.get('week');
      if (w) {
        const d = new Date(w + 'T00:00:00');
        if (!isNaN(d.getTime())) return startOfWeek(d, { weekStartsOn: 1 });
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  const [currentMonth,   setCurrentMonth]   = useState(() => new Date());
  const [stats,   setStats]   = useState<RepStats[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);

  const weekKey  = format(currentWeek, 'yyyy-MM-dd');
  const monthKey = format(currentMonth, 'yyyy-MM');

  const weekLabel = `${format(currentWeek, 'd MMM', { locale: fr })} – ${format(
    endOfWeek(currentWeek, { weekStartsOn: 1 }),
    'd MMM yyyy',
    { locale: fr }
  )}`;
  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: fr });

  const sortedRepNames = hubCfg ? [...Object.keys(hubCfg.repMap)].sort() : [];

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const fetchStats = useCallback(async () => {
    if (!hubCfg) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const periodParam = view === 'weekly' ? `week=${weekKey}` : `month=${monthKey}`;
      const statsData = await fetchJson<{ stats: RepStats[]; summary: TeamSummary }>(
        `/api/stats?hub=${hub}&${periodParam}`,
        ac.signal
      );

      if (ac.signal.aborted) return;
      setStats(statsData.stats ?? []);
      setSummary(statsData.summary ?? null);
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Erreur de chargement';
      console.error(`[hub/${hub}/manager] fetchStats view=${view}:`, msg);
      setError(msg);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [view, weekKey, monthKey, hub, hubCfg]);

  useEffect(() => {
    fetchStats();
    refreshTimer.current = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStats]);

  function handleRepClick(repName: string) {
    router.push(`/hub/${hub}/manager/${encodeURIComponent(repName)}?week=${weekKey}`);
  }

  function exportCSV() {
    const headers = [
      'Commercial', 'RDV effectués', 'Taux présence %', 'Taux closing %',
      'Ventes signées', 'Register', 'Contrat', 'POS Plus',
    ];
    const dataRows = stats
      .filter((s) => s.totalRDV > 0)
      .sort((a, b) => b.totalRDV - a.totalRDV)
      .map((s) => [
        s.repName,
        s.rdvEffectues  > 0 ? s.rdvEffectues       : '',
        s.totalRDV      > 0 ? `${s.tauxPresence}%` : '',
        s.rdvEffectues  > 0 ? `${s.tauxClosing}%`  : '',
        s.ventesSignees > 0 ? s.ventesSignees       : '',
        s.totalRegister > 0 ? s.totalRegister       : '',
        s.totalContrat  > 0 ? s.totalContrat        : '',
        s.totalPosPlus  > 0 ? s.totalPosPlus        : '',
      ]);

    const csv = [headers, ...dataRows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpi-${hub}-${view === 'weekly' ? weekKey : monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!hubCfg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Hub inconnu : {hub}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href={`/hub/${hub}/`}
              className="text-gray-400 hover:text-gray-700 text-sm font-medium transition-colors"
            >
              ← Retour
            </a>
            <div>
              <h1 className="font-bold text-gray-900">Manager — {hubCfg.label}</h1>
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
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex bg-gray-200 rounded-xl p-1">
            {(['weekly', 'monthly'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  view === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'weekly' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>

          {view === 'weekly' ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentWeek((w) => subWeeks(w, 1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors">‹</button>
              <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
              <button onClick={() => setCurrentWeek((w) => addWeeks(w, 1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors">›</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors">‹</button>
              <span className="text-sm font-semibold text-gray-700 min-w-[150px] text-center capitalize">{monthLabel}</span>
              <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 text-gray-600 font-bold transition-colors">›</button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
            <p className="text-red-600 text-sm font-semibold mb-3">{error}</p>
            <button
              onClick={fetchStats}
              className="text-sm bg-red-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-red-700 active:scale-95 transition-all"
            >
              Réessayer
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPICard label="Total RDV effectués" value={summary.totalPresents} sub="équipe" />
            <KPICard label="Taux de présence"    value={`${summary.tauxPresence}%`} sub={`cible ${KPI_TARGETS.tauxPresence}%`} colorClass={getColorForRate(summary.tauxPresence, KPI_TARGETS.tauxPresence)} />
            <KPICard label="Total Ventes"        value={summary.totalVentes} sub="équipe" />
            <KPICard label="Taux de closing"     value={`${summary.tauxClosing}%`}  sub={`cible ${KPI_TARGETS.tauxClosing}%`}  colorClass={getColorForRate(summary.tauxClosing,  KPI_TARGETS.tauxClosing)}  />
          </div>
        ) : null}

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

        <div className="flex gap-5 text-xs text-gray-400 pb-6">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ≥ cible</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> 70–99% de la cible</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {'<'} 70% de la cible</span>
        </div>
      </main>
    </div>
  );
}
