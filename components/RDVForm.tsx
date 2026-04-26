'use client';

import { useState } from 'react';
import { format } from 'date-fns';

interface Props {
  repName: string;
  hub: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onCRMPrompt?: (data: { client: string; dateRDV: string }) => void;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
          !value ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        }`}
      >
        Non
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
          value ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        }`}
      >
        Oui
      </button>
    </div>
  );
}

export default function RDVForm({ repName, hub, onClose, onSuccess, onError, onCRMPrompt }: Props) {
  const today   = format(new Date(), 'yyyy-MM-dd');
  const nowHour = format(new Date(), 'HH:00');

  const [client,       setClient]       = useState('');
  const [dateRDV,      setDateRDV]      = useState(today);
  const [heureRDV,     setHeureRDV]     = useState(nowHour);
  const [rdvEffectue,  setRdvEffectue]  = useState(false);
  const [venteSignee,  setVenteSignee]  = useState(false);
  const [clientActive, setClientActive] = useState(false);
  const [netRevenue,   setNetRevenue]   = useState('');
  const [register,     setRegister]     = useState(false);
  const [contrat,      setContrat]      = useState(false);
  const [posPlus,      setPosPlus]      = useState(false);
  const [notes,        setNotes]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const [crmPrompt, setCRMPrompt] = useState<{ client: string; dateRDV: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client.trim()) { onError('Le nom du client est requis'); return; }

    if (venteSignee) {
      const rev = parseFloat(netRevenue);
      if (!netRevenue || isNaN(rev) || rev <= 0) {
        onError('Le net revenue est requis et doit être supérieur à 0');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rdv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hub,
          repName,
          client: client.trim(),
          dateRDV,
          heureRDV,
          rdvEffectue,
          venteSignee,
          clientActive,
          netRevenue: venteSignee && netRevenue ? parseFloat(netRevenue) : null,
          register,
          contrat,
          posPlus,
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erreur serveur');
      }
      onSuccess();
      if (rdvEffectue && !venteSignee && onCRMPrompt) {
        setCRMPrompt({ client: client.trim(), dateRDV });
      } else {
        onClose();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  }

  // ── CRM prompt screen ──────────────────────────────────────────────────────
  if (crmPrompt) {
    return (
      <div className="fixed inset-0 bg-white z-40 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-5">📋</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ajouter au Suivi Prospects ?</h2>
          <p className="text-gray-500 text-sm mb-6">
            Voulez-vous ajouter{' '}
            <span className="font-semibold text-gray-800">{crmPrompt.client}</span>{' '}
            à votre suivi de relances ?
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Non merci
            </button>
            <button
              onClick={() => { onCRMPrompt!(crmPrompt); onClose(); }}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Oui !
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  const fieldClass =
    'w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

  const products = [
    { key: 'register', label: 'Register', value: register, set: setRegister },
    { key: 'contrat',  label: 'Contrat',  value: contrat,  set: setContrat  },
    { key: 'posPlus',  label: 'POS Plus', value: posPlus,  set: setPosPlus  },
  ];

  return (
    <div className="fixed inset-0 bg-white z-40 flex flex-col">
      <div className="flex-none border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700 font-medium px-2 py-1">
          Annuler
        </button>
        <h2 className="font-bold text-gray-900">Je sors de RDV</h2>
        <div className="w-16" />
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Nom de l'entreprise"
              className={fieldClass}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date du RDV</label>
            <input type="date" value={dateRDV} onChange={(e) => setDateRDV(e.target.value)} className={fieldClass} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Heure du RDV</label>
            <input type="time" value={heureRDV} onChange={(e) => setHeureRDV(e.target.value)} className={fieldClass} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">RDV effectué ?</label>
            <Toggle
              value={rdvEffectue}
              onChange={(v) => {
                setRdvEffectue(v);
                if (!v) {
                  setVenteSignee(false); setClientActive(false);
                  setNetRevenue(''); setRegister(false); setContrat(false); setPosPlus(false);
                }
              }}
            />
          </div>

          {rdvEffectue && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Vente signée ?</label>
              <Toggle
                value={venteSignee}
                onChange={(v) => {
                  setVenteSignee(v);
                  if (!v) {
                    setClientActive(false);
                    setNetRevenue(''); setRegister(false); setContrat(false); setPosPlus(false);
                  }
                }}
              />
            </div>
          )}

          {rdvEffectue && venteSignee && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Produits vendus{' '}
                  <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {products.map(({ key, label, value, set }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set(!value)}
                      className={`py-3 rounded-xl text-sm font-semibold transition-all border ${
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

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Client activé / encaissement ?
                </label>
                <Toggle value={clientActive} onChange={setClientActive} />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexte, remarques..."
              rows={3}
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="pt-2 pb-10">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-base shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer le RDV'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
