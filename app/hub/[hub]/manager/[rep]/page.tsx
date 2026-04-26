'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import BookingChart from '@/components/BookingChart';
import RDVList from '@/components/RDVList';
import Scorecard from '@/components/Scorecard';
import AgendaWeek from '@/components/AgendaWeek';
import type { RDVRow, RepStats, BookingEntry } from '@/lib/types';
import { HUB_CONFIG } from '@/lib/constants';
import { fetchJson, TimeoutError } from '@/lib/utils';

const REFRESH_INTERVAL = 30 * 60 * 1000;

export default function HubRepDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const hub     = String(params.hub);
  const repName = decodeURIComponent(String(params.rep));
  const hubCfg  = HUB_CONFIG[hub];

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
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
  const [agendaMode,     setAgendaMode]     = useState(true);
  const [rows,           setRows]           = useState<RDVRow[]>([]);
  const [stats,          setStats]          = useState<RepStats | null>(null);
  const [bookingEntries, setBookingEntries] = useState<BookingEntry[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [slowLoading,    setSlowLoading]    = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const refreshTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);

  const weekKey = format(currentWeek, 'yyyy-MM-dd');
  const weekLabel = `${format(currentWeek, 'd MMM', { locale: fr })} – ${format(
    endOfWeek(currentWeek, { weekStartsOn: 1 }),
    'd MMM yyyy',
    { locale: fr }
  )}`;

  const repId = hubCfg?.repMap[repName];

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const fetchData = useCallback(async () => {
    if (!repId || !hubCfg) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const [rdvData, statsData, bookingsData] = await Promise.all([
        fetchJson<{ rows: RDVRow[] }>(
          `/api/rdv?hub=${hub}&rep=${encodeURIComponent(repName)}&week=${weekKey}`,
          ac.signal
        ),
        fetchJson<{ stats: RepStats[] }>(
          `/api/stats?hub=${hub}&week=${weekKey}`,
          ac.signal
        ),
        fetchJson<{ entries: BookingEntry[] }>(
          `/api/bookings?hub=${hub}&week=${weekKey}&rep=${encodeURIComponent(repName)}`,
          ac.signal
        ),
      ]);

      if (ac.signal.aborted) return;
      setRows(rdvData.rows ?? []);
      setStats(statsData.stats?.find((s) => s.repId === repId) ?? null);
      setBookingEntries(bookingsData.entries ?? []);
      retryCountRef.current = 0;
      setSlowLoading(false);
      setLoading(false);
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof TimeoutError && retryCountRef.current < 1) {
        retryCountRef.current += 1;
        setSlowLoading(true);
        setLoading(false);
        fetchData();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Erreur de chargement';
      console.error(`[hub/${hub}/manager/${repName}] fetchData week=${weekKey}:`, msg);
      setError(msg);
      setSlowLoading(false);
      setLoading(false);
    }
  }, [repName, repId, weekKey, hub, hubCfg]);

  useEffect(() => {
    retryCountRef.current = 0;
    fetchData();
    refreshTimer.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchData]);

  if (!repId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Commercial inconnu : {repName}</p>
          <button
            onClick={() => router.push(`/hub/${hub}/manager${weekKey ? '?week=' + weekKey : ''}`)}
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
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/hub/${hub}/manager${weekKey ? '?week=' + weekKey : ''}`)}
              className="text-gray-400 hover:text-gray-700 text-sm font-medium transition-colors"
            >
              ←
            </button>
            <div>
              <h1 className="font-bold text-gray-900">{repName}</h1>
              <p className="text-xs text-gray-400">Détail commercial</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentWeek((w) => subWeeks(w, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 font-bold transition-colors">‹</button>
            <span className="text-xs font-semibold text-gray-600 min-w-[110px] text-center">{weekLabel}</span>
            <button onClick={() => setCurrentWeek((w) => addWeeks(w, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 font-bold transition-colors">›</button>
          </div>
        </div>

        {/* Liste / Agenda toggle */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            <button
              onClick={() => setAgendaMode(true)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                agendaMode ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Agenda
            </button>
            <button
              onClick={() => setAgendaMode(false)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !agendaMode ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Liste
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {slowLoading && !error && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-center">
            <p className="text-amber-700 text-sm font-semibold">Chargement lent... réessai en cours</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
            <p className="text-red-600 text-sm font-semibold mb-3">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm bg-red-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-red-700 active:scale-95 transition-all"
            >
              Réessayer
            </button>
          </div>
        )}

        {agendaMode ? (
          <>
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Agenda de la semaine
              </h2>
              <AgendaWeek key={weekKey} hub={hub} repName={repName} initialWeek={weekKey} />
            </section>
            <div className="flex gap-3 text-xs text-gray-400 pb-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-200 inline-block" /> Booking</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-200 inline-block" /> Vente</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-200 inline-block" /> RDV sans vente</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-200 inline-block" /> No-show</span>
            </div>
          </>
        ) : (
          <>
            <section>
              {loading ? (
                <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
              ) : (
                <BookingChart entries={bookingEntries} weekStart={weekKey} title="RDV planifiés (bookings)" />
              )}
            </section>
            <section>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                RDV effectués ({rows.length})
              </h2>
              <RDVList rows={rows} loading={loading} />
            </section>
          </>
        )}

        <Scorecard stats={stats} loading={loading} />
        <div className="pb-8" />
      </main>
    </div>
  );
}
