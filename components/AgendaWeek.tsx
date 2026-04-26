'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isToday, startOfWeek, endOfWeek, addWeeks, subWeeks, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AgendaDay, AgendaRDV } from '@/lib/types';

interface Props {
  repName: string;
  hub: string;
  initialWeek?: string; // YYYY-MM-DD (monday) — defaults to current week
}

const DAILY_BOOKING_TARGET = 3;

function sortRdvs(rdvs: AgendaRDV[]): AgendaRDV[] {
  return [...rdvs].sort((a, b) => {
    if (!a.heureRDV && !b.heureRDV) return 0;
    if (!a.heureRDV) return 1;
    if (!b.heureRDV) return -1;
    return a.heureRDV.localeCompare(b.heureRDV);
  });
}

function rdvColorClass(rdvEffectue: 'Oui' | 'Non', venteSignee: 'Oui' | 'Non') {
  if (rdvEffectue === 'Non') return 'bg-red-50 border-red-200 text-red-700';
  if (venteSignee === 'Oui') return 'bg-green-50 border-green-200 text-green-700';
  return 'bg-orange-50 border-orange-200 text-orange-700';
}

function statusDot(rdvEffectue: 'Oui' | 'Non', venteSignee: 'Oui' | 'Non') {
  if (rdvEffectue === 'Non') return 'bg-red-400';
  if (venteSignee === 'Oui') return 'bg-green-500';
  return 'bg-orange-400';
}

function productTags(rdv: AgendaRDV) {
  const tags: string[] = [];
  if (rdv.register) tags.push('Register');
  if (rdv.contrat)  tags.push('Contrat');
  if (rdv.posPlus)  tags.push('POS+');
  return tags;
}

// ── Day modal ──────────────────────────────────────────────────────────────────

function DayModal({ day, onClose }: { day: AgendaDay; onClose: () => void }) {
  const d          = parseISO(day.date);
  const title      = format(d, 'EEEE d MMMM', { locale: fr });
  const rdvsSorted = sortRdvs(day.rdvs);
  const nbFaits    = day.rdvs.filter((r) => r.rdvEffectue === 'Oui').length;
  const nbVentes   = day.rdvs.filter((r) => r.venteSignee === 'Oui').length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:rounded-2xl sm:shadow-2xl sm:max-h-[85vh]">
        <div className="flex-none border-b border-gray-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900 capitalize">{title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {day.bookings.length} pris · {nbFaits} faits · {nbVentes} vente{nbVentes !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-none w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">RDV pris</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                day.bookings.length >= DAILY_BOOKING_TARGET
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {day.bookings.length} / {DAILY_BOOKING_TARGET}
              </span>
            </div>
            {day.bookings.length === 0 ? (
              <p className="text-sm text-gray-300 py-2">Aucun booking</p>
            ) : (
              <div className="space-y-1.5">
                {day.bookings.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-none" />
                    <span className="text-sm font-semibold text-blue-800 flex-1 min-w-0 truncate">{b.clientName}</span>
                    {b.time && <span className="text-xs text-blue-500 flex-none">{b.time}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">RDV effectués</h3>
            {rdvsSorted.length > 0 && (
              <p className="text-sm text-gray-500 mb-2">
                {nbFaits} RDV effectué{nbFaits !== 1 ? 's' : ''} ce jour
              </p>
            )}
            {rdvsSorted.length === 0 ? (
              <p className="text-sm text-gray-300 py-2">Aucun RDV</p>
            ) : (
              <div className="space-y-2">
                {rdvsSorted.map((r, i) => {
                  const tags = productTags(r);
                  return (
                    <div key={i} className={`rounded-xl border px-3 py-2.5 ${rdvColorClass(r.rdvEffectue, r.venteSignee)}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-none ${statusDot(r.rdvEffectue, r.venteSignee)}`} />
                        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{r.client}</span>
                        {r.heureRDV && <span className="text-xs opacity-70 flex-none">{r.heureRDV}</span>}
                      </div>
                      {r.rdvEffectue === 'Non' && <p className="text-xs mt-1 opacity-60 ml-4">No-show</p>}
                      {r.venteSignee === 'Oui' && (
                        <div className="flex items-center gap-2 mt-1 ml-4 flex-wrap">
                          {tags.map((t) => (
                            <span key={t} className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">{t}</span>
                          ))}
                          {r.netRevenue != null && (
                            <span className="text-xs font-bold">{r.netRevenue.toLocaleString('fr-FR')} €</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// ── Week grid ──────────────────────────────────────────────────────────────────

export default function AgendaWeek({ repName, hub, initialWeek }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    if (initialWeek) {
      const d = new Date(initialWeek + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  const [days,        setDays]        = useState<AgendaDay[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selectedDay, setSelectedDay] = useState<AgendaDay | null>(null);

  const weekKey  = format(weekStart, 'yyyy-MM-dd');
  const weekEnd  = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = `Semaine du ${format(weekStart, 'd', { locale: fr })} au ${format(weekEnd, 'd MMMM yyyy', { locale: fr })}`;
  const canGoForward = isBefore(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  const fetchDays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?hub=${hub}&rep=${encodeURIComponent(repName)}&week=${weekKey}`);
      if (res.ok) {
        const data = await res.json();
        setDays(data.days ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [hub, repName, weekKey]);

  useEffect(() => { fetchDays(); }, [fetchDays]);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
          <div className="flex gap-1">
            <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse" />
            <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex-none w-[calc(100vw/3.2)] sm:flex-1 h-[100px] bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 capitalize">{weekLabel}</p>
        <div className="flex gap-1">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 font-bold transition-colors"
            title="Semaine précédente"
          >
            ‹
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            disabled={!canGoForward}
            className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold transition-colors ${
              canGoForward ? 'hover:bg-gray-100 text-gray-500' : 'text-gray-200 cursor-not-allowed'
            }`}
            title="Semaine suivante"
          >
            ›
          </button>
        </div>
      </div>

      {/* Day grid */}
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-7 sm:overflow-x-visible sm:gap-2">
        {days.map((day) => {
          const d          = parseISO(day.date);
          const todayDay   = isToday(d);
          const dayLabel   = format(d, 'EEE d', { locale: fr });
          const nbPris     = day.bookings.length;
          const nbFaits    = day.rdvs.filter((r) => r.rdvEffectue === 'Oui').length;
          const hasVentes  = day.rdvs.some((r) => r.venteSignee === 'Oui');
          const hasNoShows = day.rdvs.some((r) => r.rdvEffectue === 'Non');
          const hasActivity = nbPris > 0 || day.rdvs.length > 0;

          return (
            <div
              key={day.date}
              onClick={() => setSelectedDay(day)}
              className={`flex-none w-[calc(100vw/3.2)] snap-start sm:w-auto rounded-2xl border p-2 min-h-[100px] cursor-pointer active:scale-95 transition-transform ${
                todayDay ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-300'
              }`}
            >
              <p className={`text-xs font-bold mb-2 capitalize ${todayDay ? 'text-blue-700' : 'text-gray-500'}`}>
                {dayLabel}
              </p>
              {hasActivity ? (
                <p className="text-xs text-gray-500 leading-snug">
                  {nbPris} pris · {nbFaits} fait{nbFaits !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-xs text-gray-300 text-center mt-3">—</p>
              )}
              {(hasVentes || hasNoShows) && (
                <div className="flex gap-1 mt-1.5">
                  {hasVentes  && <span className="w-2 h-2 rounded-full bg-green-500 flex-none" />}
                  {hasNoShows && <span className="w-2 h-2 rounded-full bg-red-400 flex-none" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <DayModal day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </>
  );
}
