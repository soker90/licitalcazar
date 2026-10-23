import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, AlertOctagon, HelpCircle, Sparkles } from 'lucide-react';
import { getDiscrepancias } from '@/lib/discrepancias';
import DiscrepanciasClientView from '@/components/DiscrepanciasClientView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Buzón de Discrepancias e Inconsistencias Registrales | LicitAlcázar',
  description:
    'Monitor de incidencias cronológicas, registrales y metodológicas detectadas en los expedientes de contratación pública de Alcázar de San Juan para revisión manual y asistida por IA.',
};

export default function DiscrepanciasPage() {
  const stats = getDiscrepancias();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-white min-h-[80vh]">
      {/* Breadcrumb & Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-[#0d9373] transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-900">Discrepancias Detectadas</span>
      </nav>

      {/* Hero Header */}
      <div className="border-b border-slate-200 pb-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
            <AlertOctagon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Discrepancias e Incoherencias Registrales
              </h1>
              <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Buzón de Auditoría
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Identificación sistemática de desfases de fechas, erratas administrativas y anomalías de datos abiertos para revisión técnica y asistida por IA.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
            <span>Discrepancias Registrales</span>
            <span className="text-xs">🚨</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-950 font-mono">
              {stats.conteoPorCategoria.REGISTRAL}
            </span>
            <span className="text-xs text-amber-800">
              expedientes prioritarios
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-800/90 leading-tight">
            Adjudicación previa al cierre de ofertas o formalización previa a adjudicación.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-800 flex items-center justify-between">
            <span>Inconsistencias de Feed Histórico</span>
            <span className="text-xs">ℹ️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-950 font-mono">
              {stats.conteoPorCategoria.TEMPORAL}
            </span>
            <span className="text-xs text-blue-800">
              expedientes competitivos
            </span>
          </div>
          <p className="mt-1 text-[11px] text-blue-800/90 leading-tight">
            Fecha de publicación en PLACSP posterior al límite por rectificación de pliegos.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
            <span>Censo Auditado</span>
            <span className="text-xs">🛡️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">
              2.039
            </span>
            <span className="text-xs text-slate-600">
              contratos analizados
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 leading-tight">
            Motor de validación cronológica continua ejecutado sobre toda la serie municipal.
          </p>
        </div>
      </div>

      {/* Explanatory Context Alert */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <HelpCircle className="h-4 w-4 text-[#0d9373]" />
          <span>Criterio Metodológico de Detección y Revisión</span>
        </div>
        <p className="leading-relaxed">
          Una discrepancia temporal <strong>no constituye por sí misma una ilegalidad</strong> ni implica mala fe. En la contratación pública electrónica es frecuente que los funcionarios introduzcan erratas involuntarias al teclear las fechas en los formularios web de PLACSP (por ejemplo, registrar el año anterior), o que el volcado de datos abiertos sobrescriba el anuncio inicial tras una modificación de pliegos.
        </p>
        <p className="leading-relaxed flex items-center gap-1.5 text-slate-600">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Cada caso cuenta con un botón directo para <strong>Copiar el prompt de auditoría</strong>, diseñado específicamente para que puedas pegarlo en un modelo de inteligencia artificial junto a los pliegos o actas y determinar con exactitud el origen de la errata.</span>
        </p>
      </div>

      {/* Interactive Client View */}
      <DiscrepanciasClientView
        initialItems={stats.items}
        conteoPorCategoria={stats.conteoPorCategoria}
        conteoPorGravedad={stats.conteoPorGravedad}
      />
    </div>
  );
}
