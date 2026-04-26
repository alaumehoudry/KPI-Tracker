interface Props {
  label: string;
  value: string | number;
  sub?: string;
  colorClass?: string;
}

export default function KPICard({ label, value, sub, colorClass = 'text-gray-900' }: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold leading-none ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  );
}
