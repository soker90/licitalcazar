'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, ChevronUp, Scale, ArrowRight } from 'lucide-react';
import { AlertaV2 } from '@/lib/db';
import { getPlacspId } from '@/lib/placsp';

interface HomeAlertCardProps {
  alerta: AlertaV2;
}

export default function HomeAlertCard({ alerta }: HomeAlertCardProps) {
  const [showEvidencia, setShowEvidencia] = useState(false);

  const primerContrato = alerta.contratosDetalle?.[0];
  const placspId = primerContrato ? (getPlacspId(primerContrato.id) || primerContrato.id) : null;
  const fechaFormateada = primerContrato?.document_date
    ? new Date(primerContrato.document_date).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between hover:border-rose-300 hover:shadow-xs transition-all">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md uppercase bg-rose-100 text-rose-800 border border-rose-200">
            {alerta.tipo.replace('_', ' ')}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            {fechaFormateada && (
              <span className="text-slate-500">{fechaFormateada}</span>
            )}
            <span>•</span>
            <span className="text-slate-600 font-medium">Fuente: PLACSP</span>
          </div>
        </div>

        <h5 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug">
          {alerta.title}
        </h5>

        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
          {alerta.description}
        </p>

        {/* Panel desplegable de evidencia directa */}
        {showEvidencia && (
          <div className="mt-3 pt-3 border-t border-rose-100 space-y-2 bg-rose-50/50 p-3 rounded-lg text-xs transition-all">
            <div className="font-semibold text-rose-950 flex items-center justify-between gap-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 text-rose-600" />
                <span>Evidencia Factual Auditada:</span>
              </div>
            </div>
            
            <p className="font-mono text-[11px] text-slate-700 whitespace-pre-line leading-relaxed bg-white/90 p-2.5 rounded border border-rose-100">
              {alerta.evidence}
            </p>

            <div className="pt-1.5 flex items-center justify-between border-t border-rose-100/80 text-[11px]">
              <Link
                href={`/auditoria?alertaId=${encodeURIComponent(alerta.id)}#alerta-${encodeURIComponent(alerta.id)}`}
                className="font-semibold text-rose-700 hover:text-rose-900 hover:underline flex items-center gap-1"
              >
                <span>Auditar expediente completo</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
        {primerContrato ? (
          <Link
            href={`/licitaciones/${encodeURIComponent(placspId!)}`}
            className="font-medium text-rose-600 hover:underline flex items-center gap-1"
          >
            <span>Ver expediente</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-slate-400">Expediente asociado</span>
        )}

        <button
          type="button"
          onClick={() => setShowEvidencia((prev) => !prev)}
          className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 cursor-pointer py-0.5 px-1.5 rounded hover:bg-slate-100 transition-colors"
          aria-expanded={showEvidencia}
        >
          <span>{showEvidencia ? 'Ocultar evidencia' : 'Ver evidencia'}</span>
          {showEvidencia ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}
