'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { CRMProspect } from '@/lib/types';

interface Props {
  isOpen:       boolean;
  initialData?: Partial<CRMProspect>;
  onClose:      () => void;
  onSave:       (data: Omit<CRMProspect, 'id' | 'done'>) => void;
  saving?:      boolean;
}

const fieldClass =
  'w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function CRMForm({ isOpen, initialData, onClose, onSave, saving }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [nomClient,   setNomClient]   = useState('');
  const [dateRelance, setDateRelance] = useState('');
  const [commentaire, setCommentaire] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNomClient(  initialData?.nomClient   ?? '');
    setDateRelance(initialData?.dateRelance ?? '');
    setCommentaire(initialData?.commentaire ?? '');
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nomClient.trim() || !dateRelance) return;
    onSave({
      nomClient:   nomClient.trim(),
      dateRDV:     '',
      tpvEstime:   null,
      dateRelance: dateRelance,
      commentaire: commentaire.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-none">
          <h2 className="font-bold text-gray-900">
            {initialData?.nomClient ? 'Modifier le prospect' : 'Nouveau prospect'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-4">
            {/* Nom client */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nom client <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nomClient}
                onChange={(e) => setNomClient(e.target.value)}
                placeholder="Nom de l'entreprise"
                className={fieldClass}
                autoFocus
                required
              />
            </div>

            {/* Date relance */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Date de relance <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateRelance}
                min={today}
                onChange={(e) => setDateRelance(e.target.value)}
                className={fieldClass}
                required
              />
            </div>

            {/* Commentaire */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Commentaire <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Contexte, prochaines étapes..."
                rows={3}
                className={`${fieldClass} resize-none`}
              />
            </div>

            <div className="pt-1 pb-6">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
