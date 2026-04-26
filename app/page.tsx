'use client';

import { useRouter } from 'next/navigation';

const HUBS = [
  {
    id:       'sud',
    label:    'Hub Sud',
    subtitle: 'Hub Sud de la France',
    image:    '/sud.webp',
  },
  {
    id:       'ra',
    label:    'Hub Rhône-Alpes',
    subtitle: 'Hub Rhône-Alpes',
    image:    '/lyon.webp',
  },
] as const;

export default function HubLanding() {
  const router = useRouter();

  function selectHub(hubId: string) {
    localStorage.setItem('selectedHub', hubId);
    router.push(`/hub/${hubId}/`);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Logo header */}
      <div className="flex flex-col items-center pt-10 pb-6 gap-3">
        <img
          src="/sumup-logo.png"
          width="56"
          height="56"
          alt="SumUp"
          className="rounded-2xl shadow-lg"
        />
        <p className="text-white/50 text-sm font-medium tracking-wide">KPI Tracker</p>
      </div>

      {/* Hub cards */}
      <div className="flex-1 flex flex-col sm:flex-row gap-4 px-4 pb-10">
        {HUBS.map((hub) => (
          <button
            key={hub.id}
            onClick={() => selectHub(hub.id)}
            className="flex-1 relative overflow-hidden rounded-3xl group focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
            style={{ minHeight: '42vh' }}
          >
            {/* Background image — scales on hover */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-all duration-300 ease-out group-hover:scale-[1.04] group-hover:brightness-110"
              style={{ backgroundImage: `url('${hub.image}')` }}
            />
            {/* Dark gradient overlay — lightens on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent transition-opacity duration-300 group-hover:opacity-80" />
            {/* Text content */}
            <div className="relative z-10 h-full flex flex-col justify-end p-6 text-left">
              <h2 className="text-white text-2xl font-bold leading-tight drop-shadow">
                {hub.label}
              </h2>
              <p className="text-white/65 text-sm mt-1 drop-shadow">{hub.subtitle}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-white/80 text-sm font-semibold group-hover:text-white transition-colors">
                Accéder →
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
