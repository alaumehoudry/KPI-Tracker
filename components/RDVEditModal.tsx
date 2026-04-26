'use client';

import { useState } from 'react';
import type { RDVRow } from '@/lib/types';

interface Props {
  row: RDVRow;
  onClose: () => void;
  onSuccess: () => void;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          !value ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        }`}
      >
        Non
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          value ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        }`}
      >
        Oui
      </button>
    </div>
  );
}

export default function RDVEditModal({ row, onClose, onSuccess }: Props) {
  const [client,      setClient]      = useState(row.client);
  const [dateRDV,     setDateRDV]     = useState(row.dateRDV);
  const [heureRDV,    setHeureRDV]    = useState(row.heureRDV);
  const [rdvEffectue, setRdvEffectue] = useState(row.rdvEffectue === 'Oui');
  const [venteSignee, setVenteSignee] = useState(row.venteSignee === 'Oui');
  const [netRevenue,  setNetRevenue]  = useState(row.netRevenue?.toString() ?? '');
  const [register,    setRegister]    = useState(row.register);
  const [contrat,     setContrat]     = useState(row.contrat);
  const [posPlus,     setPosPlus]     = useState(row.posPlus);
  const [notes,       setNotes]       = useState(row.notes ?? '');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client.trim()) { setError('Le nom du client est requis'); return; }
    if (venteSignee) {
      const rev = parseFloat(netRevenue);
      if (!netRevenue || isNaN(rev) || rev <= 0) {
        setError('Le net revenue est requis et doit être supérieur à 0');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const hasVente = rdvEffectue && venteSignee;
      const res = await fetch('/api/rdv', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:          row.id,
          client:      client.trim(),
          dateRDV,
          heureRDV,
          rdvEffectue,
          venteSignee: rdvEffectue ? venteSignee : false,
          netRevenue:  hasVente && netRevenue ? parseFloat(netRevenue) : null,
          register:    hasVente ? register : false,
          contrat:     hasVente ? contrat  : false,
          posPlus:     hasVente ? posPlus  : false,
          notes:       notes.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erreur serveur');
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm';

  const products = [
    { key: 'register', label: 'Register', value: register, set: setRegister },
    { key: 'contrat',  label: 'Contrat',  value: contrat,  set: setContrat  },
    { key: 'posPlus',  label: 'POS Plus', value: posPlus,  set: setPosPlus  },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors"
          >
            Annuler
          </button>
          <h2 className="font-bold text-gray-900">Modifier le RDV</h2>
          <div className="w-14" />
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className={fieldClass}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={dateRDV}
                onChange={(e) => setDateRDV(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Heure</label>
              <input
                type="time"
                value={heureRDV}
                onChange={(e) => setHeureRDV(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">RDV effectué ?</label>
            <Toggle
              value={rdvEffectue}
              onChange={(v) => {
                setRdvEffectue(v);
                if (!v) {
                  setVenteSignee(false);
                  setNetRevenue('');
                  setRegister(false);
                  setContrat(false);
                  setPosPlus(false);
                }
              }}
            />
          </div>

          {rdvEffectue && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Vente signée ?</label>
              <Toggle
                value={venteSignee}
                onChange={(v) => {
                  setVenteSignee(v);
                  if (!v) {
                    setNetRevenue('');
                    setRegister(false);
                    setContrat(false);
                    setPosPlus(false);
                  }
                }}
              />
            </div>
          )}

          {rdvEffectue && venteSignee && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Net revenue (€) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={netRevenue}
                  onChange={(e) => setNetRevenue(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Produits vendus</label>
                <div className="grid grid-cols-3 gap-2">
                  {products.map(({ key, label, value, set }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set(!value)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                        value
                          ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300 border-blue-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexte, remarques..."
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="pt-1 pb-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-md hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
