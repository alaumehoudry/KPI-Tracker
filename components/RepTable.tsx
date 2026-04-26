'use client';

import type { RepStats } from '@/lib/types';
import { KPI_TARGETS } from '@/lib/constants';
import { getColorForRate } from '@/lib/utils';

interface Props {
  stats: RepStats[];
  view: 'weekly' | 'monthly';
  onRepClick?: (repName: string) => void;
}

export default function RepTable({ stats, onRepClick }: Props) {

  const sorted = [...stats]
    .filter((s) => s.totalRDV > 0)
    .sort((a, b) => b.totalRDV - a.totalRDV);

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
        Aucune donnée pour cette période
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Nom</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">RDV effectués</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Taux présence</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Ventes signées</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Taux closing</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Register</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Contrat</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">POS Plus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((stat) => (
                <tr key={stat.repId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                    {onRepClick ? (
                      <button
                        onClick={() => onRepClick(stat.repName)}
                        className="hover:text-blue-600 hover:underline transition-colors text-left"
                      >
                        {stat.repName}
                      </button>
                    ) : (
                      stat.repName
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-center font-bold text-gray-700">
                    {stat.rdvEffectues > 0 ? stat.rdvEffectues : '—'}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-center font-bold ${getColorForRate(stat.tauxPresence, KPI_TARGETS.tauxPresence)}`}
                  >
                    {stat.totalRDV > 0 ? `${stat.tauxPresence}%` : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-center font-bold text-gray-700">
                    {stat.ventesSignees > 0 ? stat.ventesSignees : '—'}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-center font-bold ${getColorForRate(stat.tauxClosing, KPI_TARGETS.tauxClosing)}`}
                  >
                    {stat.rdvEffectues > 0 ? `${stat.tauxClosing}%` : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-center font-bold text-gray-700">
                    {stat.totalRegister > 0 ? stat.totalRegister : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-center font-bold text-gray-700">
                    {stat.totalContrat > 0 ? stat.totalContrat : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-center font-bold text-gray-700">
                    {stat.totalPosPlus > 0 ? stat.totalPosPlus : '—'}
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
