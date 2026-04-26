'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import RepSelector from '@/components/RepSelector';
import RDVForm from '@/components/RDVForm';
import RDVList from '@/components/RDVList';
import Scorecard from '@/components/Scorecard';
import BookingChart from '@/components/BookingChart';
import CRMView from '@/components/CRMView';
import AgendaWeek from '@/components/AgendaWeek';
import Toast from '@/components/Toast';
import type { RDVRow, RepStats, BookingEntry } from '@/lib/types';
import { HUB_CONFIG } from '@/lib/constants';
import { fetchJson, TimeoutError } from '@/lib/utils';

type TabView = 'dashboard' | 'crm';

const REFRESH_INTERVAL = 30 * 60 * 1000;

export default function HubRepPage() {
  const params   = useParams();
  const router   = useRouter();
  const hub      = String(params.hub);
  const hubCfg   = HUB_CONFIG[hub];
  const storageKey = `selectedRep_${hub}`;

  const [repName,         setRepName]         = useState<string | null>(null);
  const [mounted,         setMounted]         = useState(false);
  const [activeTab,       setActiveTab]       = useState<TabView>('dashboard');
  const [agendaMode,      setAgendaMode]      = useState(true);
  const [showForm,        setShowForm]        = useState(false);
  const [crmPrefill,      setCRMPrefill]      = useState<{ client: string; dateRDV: string } | null>(null);
  const [rows,            setRows]            = useState<RDVRow[]>([]);
  const [stats,           setStats]           = useState<RepStats | null>(null);
  const [bookingEntries,  setBookingEntries]  = useState<BookingEntry[]>([]);
  const [loadingRows,     setLoadingRows]     = useState(false);
  const [loadingStats,    setLoadingStats]    = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [slowLoading,     setSlowLoading]     = useState(false);
  const [toast,           setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const refreshTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);

  const monday   = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekKey  = format(monday, 'yyyy-MM-dd');
  const weekLabel = `${format(monday, 'd MMM', { locale: fr })} – ${format(
    endOfWeek(monday, { weekStartsOn: 1 }),
    'd MMM yyyy',
    { locale: fr }
  )}`;

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(storageKey);
    if (stored && hubCfg?.repMap[stored]) setRepName(stored);
  }, [storageKey, hubCfg]);

  const fetchData = useCallback(
    async (rep: string) => {
      if (!hubCfg) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const repId = hubCfg.repMap[rep];
      setLoadingRows(true);
      setLoadingStats(true);
      setLoadingBookings(true);
      setError(null);

      try {
        const [rdvData, statsData, bookingsData] = await Promise.all([
          fetchJson<{ rows: RDVRow[] }>(
            `/api/rdv?hub=${hub}&rep=${encodeURIComponent(rep)}&week=${weekKey}`,
            ac.signal
          ),
          fetchJson<{ stats: RepStats[] }>(
            `/api/stats?hub=${hub}&week=${weekKey}`,
            ac.signal
          ),
          fetchJson<{ entries: BookingEntry[] }>(
            `/api/bookings?hub=${hub}&week=${weekKey}&rep=${encodeURIComponent(rep)}`,
            ac.signal
          ),
        ]);

        if (ac.signal.aborted) return;
        setRows(rdvData.rows ?? []);
        setLoadingRows(false);
        setStats(statsData.stats?.find((s) => s.repId === repId) ?? null);
        setLoadingStats(false);
        setBookingEntries(bookingsData.entries ?? []);
        setLoadingBookings(false);
        retryCountRef.current = 0;
        setSlowLoading(false);
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof TimeoutError && retryCountRef.current < 1) {
          retryCountRef.current += 1;
          setSlowLoading(true);
          setLoadingRows(false);
          setLoadingStats(false);
          setLoadingBookings(false);
          fetchData(rep);
          return;
        }
        const msg = err instanceof Error ? err.message : 'Erreur de chargement';
        console.error(`[hub/${hub}/page] fetchData rep=${rep} week=${weekKey}:`, msg);
        setError(msg);
        setSlowLoading(false);
        setLoadingRows(false);
        setLoadingStats(false);
        setLoadingBookings(false);
      }
    },
    [weekKey, hub, hubCfg]
  );

  useEffect(() => {
    if (repName) {
      retryCountRef.current = 0;
      fetchData(repName);
      refreshTimer.current = setInterval(() => fetchData(repName), REFRESH_INTERVAL);
      return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    }
  }, [repName, fetchData]);

  function handleSelectRep(name: string) {
    localStorage.setItem(storageKey, name);
    setRepName(name);
  }

  function handleChangeRep() {
    localStorage.removeItem(storageKey);
    setRepName(null);
    setRows([]);
    setStats(null);
    setBookingEntries([]);
    setError(null);
  }

  function handleBack() {
    router.push('/');
  }

  function handleBackFromDashboard() {
    localStorage.removeItem(storageKey);
    router.push(`/hub/${hub}/`);
  }

  if (!mounted) return null;

  if (!hubCfg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Hub inconnu : {hub}</p>
      </div>
    );
  }

  if (!repName) {
    return <RepSelector hub={hub} onSelect={handleSelectRep} onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackFromDashboard}
              className="text-gray-400 hover:text-gray-700 text-sm font-medium transition-colors"
              title="Retour sélection commercial"
            >
              ←
            </button>
            <div>
              <h1 className="font-bold text-gray-900">Bonjour, {repName} 👋</h1>
              <p className="text-xs text-gray-400 mt-0.5">{weekLabel}</p>
            </div>
          </div>
          <button
            onClick={handleChangeRep}
            className="text-xs text-gray-400 hover:text-gray-700 underline transition-colors"
          >
            Changer
          </button>
        </div>

        <div className="max-w-lg mx-auto px-4 flex border-t border-gray-100">
          {(['dashboard', 'crm'] as TabView[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab === 'dashboard' ? 'Tableau de bord' : 'Suivi prospects'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">
        {activeTab === 'dashboard' ? (
          <div className="space-y-5">
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-bold text-lg shadow-md active:scale-95 transition-all"
            >
              Je sors de RDV
            </button>

            {slowLoading && !error && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-center">
                <p className="text-amber-700 text-sm font-semibold">Chargement lent... réessai en cours</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
                <p className="text-red-600 text-sm font-semibold mb-3">{error}</p>
                <button
                  onClick={() => fetchData(repName)}
                  className="text-sm bg-red-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-red-700 active:scale-95 transition-all"
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Liste / Agenda toggle */}
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {agendaMode ? 'Agenda de la semaine' : 'Activité de la semaine'}
              </h2>
              <div className="flex bg-gray-100 rounded-xl p-0.5">
                <button
                  onClick={() => setAgendaMode(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    agendaMode ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  }`}
                >
                  Agenda
                </button>
                <button
                  onClick={() => setAgendaMode(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    !agendaMode ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  }`}
                >
                  Liste
                </button>
              </div>
            </div>

            {agendaMode ? (
              <>
                <AgendaWeek hub={hub} repName={repName!} />
                <div className="flex gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-200 inline-block" /> Booking</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-200 inline-block" /> Vente</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-200 inline-block" /> Sans vente</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-200 inline-block" /> No-show</span>
                </div>
              </>
            ) : (
              <>
                {loadingBookings ? (
                  <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
                ) : (
                  <BookingChart entries={bookingEntries} weekStart={weekKey} />
                )}
                <section>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    RDV effectués cette semaine ({rows.length})
                  </h2>
                  <RDVList rows={rows} loading={loadingRows} />
                </section>
              </>
            )}

            <Scorecard stats={stats} loading={loadingStats} />

            <div className="text-center pb-8">
              <a href={`/hub/${hub}/manager`} className="text-sm text-blue-500 hover:underline">
                Vue Cockpit →
              </a>
            </div>
          </div>
        ) : (
          <CRMView
            repName={repName}
            hub={hub}
            prefill={crmPrefill}
            onPrefillConsumed={() => setCRMPrefill(null)}
          />
        )}
      </main>

      {showForm && (
        <RDVForm
          repName={repName}
          hub={hub}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setToast({ message: 'RDV enregistré avec succès !', type: 'success' });
            fetchData(repName);
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
          onCRMPrompt={(data) => {
            setCRMPrefill(data);
            setActiveTab('crm');
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
