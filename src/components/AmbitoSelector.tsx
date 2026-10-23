'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Landmark, Users2, Info, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { formatDecimal } from '@/lib/format';

interface AmbitoSelectorProps {
  currentAmbito?: string;
  basePath?: string;
  counts?: {
    directaVolumen?: number;
    mancomunidadVolumen?: number;
    totalVolumen?: number;
  };
  showNote?: boolean;
}

export default function AmbitoSelector({
  currentAmbito,
  basePath,
  counts,
  showNote = true,
}: AmbitoSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeAmbito = (currentAmbito || searchParams.get('ambito') || 'directa').toLowerCase();

  const handleChange = (ambitoKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (ambitoKey === 'directa') {
      // Directa Municipal es el ámbito predeterminado en V2
      params.delete('ambito');
    } else {
      params.set('ambito', ambitoKey);
    }
    const path = basePath || window.location.pathname;
    const queryString = params.toString();
    router.push(queryString ? `${path}?${queryString}` : path);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 sm:p-3 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 px-1">
          <Landmark className="h-4 w-4 text-[#0d9373]" />
          <span>Filtrar por entidad:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Opción 1: Solo Ayuntamiento */}
          <button
            type="button"
            onClick={() => handleChange('directa')}
            title="Gasto gestionado directamente por el Ayuntamiento de Alcázar y sus organismos locales"
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer min-h-[40px] ${
              activeAmbito === 'directa'
                ? 'bg-[#ecfdf5] text-[#0d9373] border-[#a7f3d0] shadow-xs font-bold ring-1 ring-[#0d9373]/20'
                : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-3.5 w-3.5 text-[#0d9373] shrink-0" />
            <span className="whitespace-nowrap">Solo Ayuntamiento</span>
            {counts?.directaVolumen ? (
              <span className="text-[10px] font-mono opacity-85 ml-0.5 px-1.5 py-0.2 bg-emerald-100/60 rounded text-emerald-800">
                {formatDecimal(counts.directaVolumen / 1e6, 1)} M€
              </span>
            ) : null}
          </button>

          {/* Opción 2: Comsermancha (21 municipios) */}
          <button
            type="button"
            onClick={() => handleChange('mancomunidad')}
            title="Servicios mancomunados de recogida y tratamiento de residuos para 21 municipios asociados"
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer min-h-[40px] ${
              activeAmbito === 'mancomunidad'
                ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe] shadow-xs font-bold ring-1 ring-[#2563eb]/20'
                : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users2 className="h-3.5 w-3.5 text-[#2563eb] shrink-0" />
            <span className="whitespace-nowrap">
              Comsermancha <span className="hidden sm:inline">(21 municipios)</span>
            </span>
            {counts?.mancomunidadVolumen ? (
              <span className="text-[10px] font-mono opacity-85 ml-0.5 px-1.5 py-0.2 bg-blue-100/60 rounded text-blue-800">
                {formatDecimal(counts.mancomunidadVolumen / 1e6, 1)} M€
              </span>
            ) : null}
          </button>

          {/* Opción 3: Total */}
          <button
            type="button"
            onClick={() => handleChange('todos')}
            title="Suma total de toda la contratación pública oficial registrada en Alcázar de San Juan"
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer min-h-[40px] ${
              activeAmbito === 'todos'
                ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-xs font-bold ring-1 ring-slate-900/30'
                : 'bg-white text-slate-600 border-[#e2e8f0] hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            <span>Total</span>
            {counts?.totalVolumen ? (
              <span className={`text-[10px] font-mono opacity-85 ml-0.5 px-1.5 py-0.2 rounded ${
                activeAmbito === 'todos' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
              }`}>
                {formatDecimal(counts.totalVolumen / 1e6, 1)} M€
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Nota contextual dinámica adaptada a lo que el ciudadano tiene seleccionado */}
      {showNote && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs leading-relaxed transition-all bg-white border-slate-200">
          <Info className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-600">
            {activeAmbito === 'directa' ? (
              <p>
                <strong className="text-slate-900">Estás consultando: Solo Ayuntamiento de Alcázar de San Juan.</strong>{' '}
                Muestra el dinero gestionado exclusivamente por la corporación municipal y sus entes locales (Aguas de Alcázar, Patronato Municipal de Cultura e Instituto Municipal de Deportes).
              </p>
            ) : activeAmbito === 'mancomunidad' ? (
              <p>
                <strong className="text-slate-900">Estás consultando: Mancomunidad Comsermancha.</strong>{' '}
                Muestra la contratación de residuos y maquinaria. Aunque tiene su sede central en Alcázar, da servicio comarcal a <strong className="text-slate-800">21 municipios</strong> de Ciudad Real, Toledo y Cuenca, y su coste se comparte entre todas las localidades asociadas.
              </p>
            ) : (
              <p>
                <strong className="text-slate-900">Estás consultando: Total de contratación en Alcázar.</strong>{' '}
                Suma global de todos los contratos oficiales registrados en la Plataforma del Estado (PLACSP): combina el gasto municipal propio con el de la Mancomunidad Comsermancha (21 localidades).
              </p>
            )}

            <div className="pt-0.5">
              <Link 
                href="/metodologia#comsermancha" 
                className="font-medium text-[#0d9373] hover:text-[#00b48a] underline inline-flex items-center gap-1 text-[11px]"
              >
                <span>¿Por qué separamos el Ayuntamiento y Comsermancha? Ver explicación metodológica</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
