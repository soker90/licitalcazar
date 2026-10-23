'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, Droplet, HardHat, FileCheck2, ArrowRight, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/format';

interface HomeHeroProps {
  ultimaActualizacion?: string | null;
  ultimaSincronizacion?: string | null;
  ultimaLicitacion?: string | null;
}

export default function HomeHero({
  ultimaActualizacion,
  ultimaSincronizacion,
  ultimaLicitacion,
}: HomeHeroProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/licitaciones?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/licitaciones');
    }
  };

  const quickFilters = [
    { label: 'Ayuntamiento', query: 'Ayuntamiento', icon: Building2 },
    { label: 'Aguas de Alcázar', query: 'Aguas de Alcázar', icon: Droplet },
    { label: 'Patronato de Cultura', query: 'Cultura', icon: FileCheck2 },
    { label: 'Comsermancha', query: 'COMSERMANCHA', icon: Building2 },
    { label: 'Obras y Proyectos', query: 'Obras', icon: HardHat },
  ];

  return (
    <div className="relative overflow-hidden border-b border-[#e2e8f0] bg-white pt-14 pb-16 sm:pt-20 sm:pb-22">
      {/* Mintlify Atmospheric Radial Green Glows */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] pointer-events-none opacity-80"
        style={{
          background: 'radial-gradient(circle at 50% 10%, rgba(0, 212, 164, 0.09) 0%, transparent 65%)',
        }}
      />
      <div 
        className="absolute top-1/2 -left-20 w-[400px] h-[400px] pointer-events-none opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(13, 147, 115, 0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Label */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d1fae5] bg-[#ecfdf5] px-3.5 py-1.5 text-xs text-[#0d9373] mb-3 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00d4a4]" />
          <span className="font-semibold tracking-wider uppercase text-[11px]">
            Portal de Transparencia y Contratación Municipal
          </span>
        </div>

        {(ultimaSincronizacion || ultimaActualizacion) && (
          <div className="mb-6">
            <span className="inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 font-mono">
              <RefreshCw className="h-3 w-3 text-slate-400 shrink-0" />
              <span>
                Sincronizado con PLACSP el {formatDate(ultimaSincronizacion || ultimaActualizacion)}
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span>
                Última licitación oficial: {formatDate(ultimaLicitacion || ultimaActualizacion)}
              </span>
            </span>
          </div>
        )}

        {/* Main Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1e293b] max-w-4xl mx-auto leading-[1.15]">
          Inteligencia de Contratación en{' '}
          <span className="text-[#0d9373] relative inline-block">
            Alcázar de San Juan
          </span>
        </h1>

        <p className="mt-5 text-sm sm:text-base lg:text-lg text-[#64748b] max-w-2xl mx-auto font-normal leading-relaxed">
          Monitoriza las licitaciones oficiales, adjudicaciones y empresas contratistas del Ayuntamiento de Alcázar de San Juan, sus organismos autónomos, empresas públicas y entidades mancomunadas.
        </p>

        {/* Central Search Box (Mintlify Documentation Search Style) */}
        <form onSubmit={handleSearch} className="mt-8 sm:mt-10 max-w-2xl mx-auto">
          <div className="flex items-center bg-white border border-[#e2e8f0] hover:border-[#cbd5e1] focus-within:border-[#00d4a4] focus-within:ring-4 focus-within:ring-[#00d4a4]/10 rounded-xl p-1.5 shadow-sm transition-all">
            <Search className="h-5 w-5 text-slate-400 ml-3.5 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por objeto de contrato, expediente, adjudicatario o CIF..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] hover:bg-[#1e293b] px-5 py-3 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all shrink-0 active:scale-95"
            >
              <span>Explorar</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        {/* Quick Filter Pill Tags */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] font-medium mr-1 hidden sm:inline">Acceso directo:</span>
          {quickFilters.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => router.push(`/licitaciones?q=${encodeURIComponent(item.query)}`)}
                className="flex items-center gap-1.5 rounded-full bg-[#f8fafb] hover:bg-[#ecfdf5] border border-[#e2e8f0] hover:border-[#d1fae5] px-3.5 py-1.5 text-xs text-slate-700 hover:text-[#0d9373] transition-all font-medium shadow-2xs"
              >
                <Icon className="h-3.5 w-3.5 text-[#0d9373]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
