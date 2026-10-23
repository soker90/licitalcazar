import { Metadata } from 'next';
import Link from 'next/link';
import { getAlertasV2, getAuditoriaKpis } from '@/lib/db';
import AuditoriaClientView from '@/components/AuditoriaClientView';
import AmbitoSelector from '@/components/AmbitoSelector';
import { ShieldAlert, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Centro de Análisis de Riesgos de Contratación | LicitAlcázar',
  description:
    'Monitoreo preventivo y señales estadísticas sobre la contratación pública de Alcázar de San Juan conforme a los criterios de la LCSP.',
};

interface AuditoriaPageProps {
  searchParams: Promise<{
    ambito?: string;
    severidad?: string;
    tipo?: string;
    q?: string;
    alertaId?: string;
  }>;
}

export default async function AuditoriaPage({ searchParams }: AuditoriaPageProps) {
  const params = await searchParams;
  const currentAmbito = params.ambito || 'directa';
  const initialAlertaId = params.alertaId;

  const [alertasResult, kpis] = await Promise.all([
    Promise.resolve(
      getAlertasV2({
        limit: 1000,
        scope: currentAmbito,
      })
    ),
    Promise.resolve(getAuditoriaKpis(currentAmbito)),
  ]);

  const initialSeveridad = params.severidad?.toUpperCase() || 'TODAS';
  const initialTipo = params.tipo?.toUpperCase() || 'TODOS';
  const initialSearch = params.q || '';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#ffffff]">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-700 transition-colors">
            Inicio
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">Análisis de Riesgos</span>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Centro de Análisis de Riesgos de Contratación
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Señales analíticas preventivas sobre concentración de mercado, concurrencia única y acumulación de contratos menores conforme a la LCSP.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/metodologia"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs"
            >
              Ver Metodología LCSP
            </Link>
          </div>
        </div>

        {/* Ámbito Selector */}
        <div className="pt-1">
          <AmbitoSelector currentAmbito={currentAmbito} basePath="/auditoria" />
        </div>
      </div>

      {/* Vista interactiva de auditoría */}
      <AuditoriaClientView
        initialAlertas={alertasResult.alerts}
        kpis={kpis}
        currentAmbito={currentAmbito}
        initialSeveridad={initialSeveridad}
        initialTipo={initialTipo}
        initialSearch={initialSearch}
        initialAlertaId={initialAlertaId}
      />
    </div>
  );
}
