'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, isToday, isTomorrow, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import CRMForm from './CRMForm';
import type { CRMProspect, CRMProspectWithRelances, CRMRelance } from '@/lib/types';

interface Props {
  repName: string;
  hub: string;
  prefill?: { client: string; dateRDV: string } | null;
  onPrefillConsumed?: () => void;
}

type FilterMode = 'tous' | 'relancer' | 'semaine' | 'relances';

// ── Relance helpers ───────────────────────────────────────────────────────────

function getNextPendingRelance(relances: CRMRelance[]): CRMRelance | null {
  const pending = relances
    .filter((r) => !r.done)
    .sort((a, b) => a.dateRelance.localeCompare(b.dateRelance));
  return pending[0] ?? null;
}

function getEffectiveRelanceDate(p: CRMProspectWithRelances): string | null {
  const next = getNextPendingRelance(p.relances ?? []);
  if (next) return next.dateRelance;
  if (!p.done && p.dateRelance) return p.dateRelance;
  return null;
}

function getRelanceBadge(dateStr: string | null, done: boolean) {
  if (done) return { label: 'Relancé', color: 'bg-gray-100 text-gray-400' };
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = parseISO(dateStr);
  if (d <= today) return { label: 'Urgent', color: 'bg-red-100 text-red-600 font-bold' };
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const sunday = endOfWeek(today, { weekStartsOn: 1 });
  if (isWithinInterval(d, { start: monday, end: sunday })) {
    return { label: 'Cette sem.', color: 'bg-orange-100 text-orange-600 font-bold' };
  }
  return { label: 'À venir', color: 'bg-green-100 text-green-600' };
}

function formatRelanceDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    if (isToday(d))    return "Aujourd'hui";
    if (isTomorrow(d)) return 'Demain';
    return format(d, 'd MMM yyyy', { locale: fr });
  } catch { return dateStr; }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats(prospects: CRMProspectWithRelances[]) {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const sunday = endOfWeek(today, { weekStartsOn: 1 });

  const active = prospects.filter((p) => !p.done);
  const overdue = active.filter((p) => {
    const d = getEffectiveRelanceDate(p);
    return d && parseISO(d) <= today;
  });
  const thisWeek = active.filter((p) => {
    const d = getEffectiveRelanceDate(p);
    return d && isWithinInterval(parseISO(d), { start: monday, end: sunday });
  });

  return { total: prospects.length, overdue: overdue.length, thisWeek: thisWeek.length };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CRMView({ repName, hub, prefill, onPrefillConsumed }: Props) {
  const [prospects,        setProspects]        = useState<CRMProspectWithRelances[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [filter,           setFilter]           = useState<FilterMode>('tous');
  const [search,           setSearch]           = useState('');
  const [formOpen,         setFormOpen]         = useState(false);
  const [editTarget,       setEditTarget]       = useState<CRMProspect | null>(null);
  const [saving,           setSaving]           = useState(false);
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [addingRelanceFor, setAddingRelanceFor] = useState<string | null>(null);
  const [newRelanceDate,   setNewRelanceDate]   = useState('');
  const [newRelanceComment,setNewRelanceComment]= useState('');
  const [savingRelance,    setSavingRelance]    = useState(false);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm?hub=${hub}&rep=${encodeURIComponent(repName)}`);
      if (res.ok) setProspects((await res.json()).prospects ?? []);
    } finally {
      setLoading(false);
    }
  }, [hub, repName]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  useEffect(() => {
    if (prefill) { setEditTarget(null); setFormOpen(true); }
  }, [prefill]);

  // ── Filter + search ──────────────────────────────────────────────────────

  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const sunday = endOfWeek(today, { weekStartsOn: 1 });

  const filtered = prospects.filter((p) => {
    if (filter === 'relancer') {
      if (p.done) return false;
      const d = getEffectiveRelanceDate(p);
      if (!d || parseISO(d) > today) return false;
    } else if (filter === 'semaine') {
      if (p.done) return false;
      const d = getEffectiveRelanceDate(p);
      if (!d || !isWithinInterval(parseISO(d), { start: monday, end: sunday })) return false;
    } else if (filter === 'relances') {
      if (!p.done) return false;
    }
    if (search.trim()) {
      return (
        p.nomClient.toLowerCase().includes(search.toLowerCase()) ||
        p.commentaire.toLowerCase().includes(search.toLowerCase())
      );
    }
    return true;
  });

  const stats = computeStats(prospects);

  // ── Prospect handlers ────────────────────────────────────────────────────

  async function handleSave(data: Omit<CRMProspect, 'id' | 'done'>) {
    setSaving(true);
    try {
      if (editTarget) {
        await fetch('/api/crm', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hub, rep: repName, id: editTarget.id, ...data }),
        });
      } else {
        await fetch('/api/crm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hub, rep: repName, ...data }),
        });
      }
      setFormOpen(false);
      setEditTarget(null);
      onPrefillConsumed?.();
      await fetchProspects();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDone(p: CRMProspectWithRelances) {
    await fetch('/api/crm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hub, rep: repName, id: p.id, done: !p.done }),
    });
    await fetchProspects();
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce prospect ?')) return;
    await fetch('/api/crm', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hub, rep: repName, id }),
    });
    await fetchProspects();
  }

  function handleEdit(p: CRMProspectWithRelances) {
    setEditTarget(p);
    setFormOpen(true);
  }

  // ── Relance handlers ─────────────────────────────────────────────────────

  async function handleAddRelance(prospectId: string) {
    if (!newRelanceDate) return;
    setSavingRelance(true);
    try {
      await fetch('/api/crm/relances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hub,
          rep: repName,
          idProspect: prospectId,
          dateRelance: newRelanceDate,
          commentaire: newRelanceComment.trim(),
        }),
      });
      setAddingRelanceFor(null);
      setNewRelanceDate('');
      setNewRelanceComment('');
      await fetchProspects();
    } finally {
      setSavingRelance(false);
    }
  }

  async function handleToggleRelance(r: CRMRelance) {
    await fetch('/api/crm/relances', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hub, rep: repName, id: r.id, done: !r.done }),
    });
    await fetchProspects();
  }

  async function handleDeleteRelance(id: string) {
    await fetch('/api/crm/relances', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hub, rep: repName, id }),
    });
    await fetchProspects();
  }

  // ── URL helpers ──────────────────────────────────────────────────────────

  function buildGCalUrl(p: CRMProspectWithRelances): string {
    const effectiveDate = getEffectiveRelanceDate(p) ?? p.dateRelance;
    const dateCompact = effectiveDate.replace(/-/g, '');
    const text    = encodeURIComponent(`Relance ${p.nomClient}`);
    const details = encodeURIComponent(
      `Relance prospect SumUp${p.commentaire ? ` — ${p.commentaire}` : ''}`
    );
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dateCompact}/${dateCompact}&details=${details}`;
  }

  function buildMailto(p: CRMProspectWithRelances): string {
    const subject = encodeURIComponent(`Suivi — ${p.nomClient}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nJe me permets de revenir vers vous suite à notre échange...\n\nCordialement,\n${repName}`
    );
    return `mailto:?subject=${subject}&body=${body}`;
  }

  const FILTERS: { key: FilterMode; label: string; count?: number }[] = [
    { key: 'tous',    label: 'Tous',               count: prospects.length },
    { key: 'relancer',label: 'À relancer',         count: stats.overdue },
    { key: 'semaine', label: 'Relances cette sem.', count: stats.thisWeek },
    { key: 'relances',label: 'Relancés' },
  ];

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-4 pb-10">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total',               value: stats.total,    red: false, orange: false },
          { label: 'À relancer',          value: stats.overdue,  red: true,  orange: false },
          { label: 'Relances cette sem.', value: stats.thisWeek, red: false, orange: true  },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-3 text-center shadow-sm">
            <p className={`text-lg font-bold ${s.red ? 'text-red-500' : s.orange ? 'text-orange-500' : 'text-gray-900'}`}>
              {s.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              filter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            {f.label}{f.count != null ? ` (${f.count})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un client..."
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />

      {/* New prospect button */}
      <button
        onClick={() => { setEditTarget(null); setFormOpen(true); }}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all"
      >
        + Nouveau prospect
      </button>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">Aucun prospect</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const relances = p.relances ?? [];
            const effectiveDate = getEffectiveRelanceDate(p);
            const badge = getRelanceBadge(effectiveDate, p.done);
            const pendingRelancesCount = relances.filter((r) => !r.done).length;
            const isExpanded = expandedId === p.id;
            const isAddingRelance = addingRelanceFor === p.id;

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-2xl p-4 shadow-sm transition-opacity ${
                  p.done ? 'opacity-60 border-gray-100' : 'border-gray-100'
                }`}
              >
                {/* Header: client + badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className={`font-semibold flex-1 min-w-0 truncate ${p.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {p.nomClient}
                  </p>
                  {badge && (
                    <span className={`flex-none text-xs px-2 py-1 rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                </div>

                {/* Next relance date */}
                {effectiveDate && (
                  <p className="text-xs text-gray-500 mb-1">
                    Prochaine relance : {formatRelanceDate(effectiveDate)}
                    {pendingRelancesCount > 1 && (
                      <span className="ml-1 text-gray-400">({pendingRelancesCount} planifiées)</span>
                    )}
                  </p>
                )}

                {/* Commentaire */}
                {p.commentaire && (
                  <p className="text-xs text-gray-400 italic mb-2 leading-relaxed">{p.commentaire}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <a
                    href={buildMailto(p)}
                    className="px-3 py-1.5 text-xs font-semibold text-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    title="Envoyer un email"
                  >
                    ✉ Mail
                  </a>
                  {effectiveDate && (
                    <a
                      href={buildGCalUrl(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                      title="Ajouter au Google Calendar"
                    >
                      📅
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setAddingRelanceFor(isAddingRelance ? null : p.id);
                      setNewRelanceDate(todayStr);
                      setNewRelanceComment('');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg transition-colors"
                  >
                    + Relance
                  </button>
                  {relances.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    >
                      {isExpanded ? '▲' : '▼'} Relances ({relances.length})
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleDone(p)}
                    className={`flex-1 min-w-[80px] py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
                      p.done
                        ? 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500'
                        : 'bg-green-50 hover:bg-green-100 border-green-200 text-green-700'
                    }`}
                  >
                    {p.done ? '↩ Réactiver' : '✓ Relancé'}
                  </button>
                  <button
                    onClick={() => handleEdit(p)}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    🖊️
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>

                {/* Add relance inline form */}
                {isAddingRelance && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                    <input
                      type="date"
                      value={newRelanceDate}
                      min={todayStr}
                      onChange={(e) => setNewRelanceDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <textarea
                      value={newRelanceComment}
                      onChange={(e) => setNewRelanceComment(e.target.value)}
                      placeholder="Commentaire (optionnel)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddRelance(p.id)}
                        disabled={!newRelanceDate || savingRelance}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {savingRelance ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={() => setAddingRelanceFor(null)}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded relances list */}
                {isExpanded && relances.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                    {[...relances]
                      .sort((a, b) => a.dateRelance.localeCompare(b.dateRelance))
                      .map((r) => (
                        <div
                          key={r.id}
                          className={`flex items-start gap-2 text-xs ${r.done ? 'opacity-50' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className={`font-semibold ${r.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {formatRelanceDate(r.dateRelance)}
                            </span>
                            {r.commentaire && (
                              <span className="ml-2 text-gray-400 italic">{r.commentaire}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleToggleRelance(r)}
                            className={`flex-none px-2 py-1 rounded border text-xs font-semibold transition-colors ${
                              r.done
                                ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            }`}
                          >
                            {r.done ? '↩' : '✓'}
                          </button>
                          <button
                            onClick={() => handleDeleteRelance(r.id)}
                            className="flex-none px-2 py-1 rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 text-xs font-semibold transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CRMForm
        isOpen={formOpen}
        initialData={
          editTarget
            ? editTarget
            : prefill
            ? { nomClient: prefill.client }
            : undefined
        }
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
          onPrefillConsumed?.();
        }}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
