'use client';

import type { RDVRow } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface Props {
  rows: RDVRow[];
  loading: boolean;
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-semibold ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {label}
    </span>
  );
}

export default function RDVList({ rows, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-sm">Aucun RDV enregistré cette semaine</p>
      </div>
    );
  }

  // Sort by date desc
  const sorted = [...rows].sort((a, b) => b.dateRDV.localeCompare(a.dateRDV));

  return (
    <div className="space-y-3">
      {sorted.map((row, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{row.client}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(row.dateRDV)} · {row.heureRDV}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <StatusBadge label="RDV" active={row.rdvEffectue === 'Oui'} />
              <StatusBadge label="Vente" active={row.venteSignee === 'Oui'} />
              <StatusBadge label="Actif" active={row.clientActive === 'Oui'} />
            </div>
          </div>
          {row.netRevenue !== null && row.netRevenue > 0 && (
            <p className="text-sm font-semibold text-green-600 mt-2">
              {row.netRevenue.toLocaleString('fr-FR')} €
            </p>
          )}
          {row.notes && (
            <p className="text-xs text-gray-400 mt-2 italic leading-relaxed">{row.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}
