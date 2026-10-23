'use client';

import { useState } from 'react';
import { User, Microscope, ExternalLink, Database, ShieldCheck } from 'lucide-react';

interface ContractViewModeProps {
  children: React.ReactNode;
  technicalDetails: {
    idCanonica: string;
    cpvPrincipal?: string | null;
    nifOrgano: string;
    dir3Organo?: string | null;
    tipoContrato: string;
    procedimiento?: string | null;
    procedure?: string | null;
    placspUrl: string;
  };
}

export default function ContractViewModeToggle({
  children,
  technicalDetails,
}: ContractViewModeProps) {
  const [mode, setMode] = useState<'ciudadano' | 'investigacion'>('ciudadano');

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0]">
        <div className="text-xs font-semibold text-slate-700 px-1">
          Nivel de detalle del expediente:
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setMode('ciudadano')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
              mode === 'ciudadano'
                ? 'bg-white text-slate-900 border-[#cbd5e1] shadow-2xs font-bold'
                : 'text-slate-600 border-transparent hover:bg-white/60'
            }`}
          >
            <User className="h-3.5 w-3.5 text-[#0d9373] shrink-0" />
            <span>Vista Ciudadana</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('investigacion')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
              mode === 'investigacion'
                ? 'bg-[#1e293b] text-white border-[#1e293b] shadow-2xs font-bold'
                : 'text-slate-600 border-transparent hover:bg-white/60'
            }`}
          >
            <Microscope className="h-3.5 w-3.5 text-[#38bdf8] shrink-0" />
            <span>Modo Investigación / Técnico</span>
          </button>
        </div>
      </div>

      {/* Bloque técnico ampliado (solo en modo investigación) */}
      {mode === 'investigacion' && (
        <div className="mint-card p-6 border-l-4 border-l-[#0284c7] bg-[#f0f9ff]/30 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-sky-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#0284c7]" />
              <h3 className="font-bold text-sm text-[#0c4a6e]">
                Metadatos Técnicos y Trazabilidad CODICE (PLACSP)
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              Datos Auditables
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs font-mono">
            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                URI Canónica CODICE
              </span>
              <span className="font-semibold text-slate-800 break-all select-all">
                {technicalDetails.idCanonica}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Código CPV Oficial
              </span>
              <span className="font-semibold text-slate-800">
                {technicalDetails.cpvPrincipal || 'No especificado en pliego'}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                NIF Órgano / DIR3
              </span>
              <span className="font-semibold text-slate-800">
                {technicalDetails.nifOrgano} {technicalDetails.dir3Organo ? `(${technicalDetails.dir3Organo})` : ''}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Tipo & Procedimiento LCSP
              </span>
              <span className="font-semibold text-slate-800">
                {technicalDetails.tipoContrato} · {technicalDetails.procedimiento || technicalDetails.procedure || 'No especificado'}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Estado del Dato
              </span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                OFICIAL (Sincronizado de PLACSP)
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-sky-100 space-y-1 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Fuente Primaria
              </span>
              <a
                href={technicalDetails.placspUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#0284c7] hover:underline"
              >
                <span>Descargar XML CODICE</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contenido principal del expediente */}
      {children}
    </div>
  );
}
