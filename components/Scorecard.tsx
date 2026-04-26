'use client';

import type { RepStats } from '@/lib/types';
import { KPI_TARGETS } from '@/lib/constants';
import { getBgColorForRate } from '@/lib/utils';

interface Props {
  stats: RepStats | null;
  loading: boolean;
}

export default function Scorecard({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    {
      label: 'RDV planifiés',
      display: `${stats.totalRDV} / ${KPI_TARGETS.rdvHebdo}`,
      pct: Math.min(Math.round((stats.totalRDV / KPI_TARGETS.rdvHebdo) * 100), 100),
      target: 100,
    },
    {
      label: 'Présence',
      display: `${stats.tauxPresence}%`,
      pct: stats.tauxPresence,
      target: KPI_TARGETS.tauxPresence,
    },
    {
      label: 'Closing',
      display: `${stats.tauxClosing}%`,
      pct: stats.tauxClosing,
      target: KPI_TARGETS.tauxClosing,
    },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">
        Ma semaine
      </h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-bold text-gray-900">{item.display}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBgColorForRate(item.pct, item.target)}`}
                style={{ width: `${item.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {stats.netRevenue > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-gray-500">Net revenue</span>
          <span className="font-bold text-green-600 text-xl">
            {stats.netRevenue.toLocaleString('fr-FR')} €
          </span>
        </div>
      )}
    </div>
  );
}
