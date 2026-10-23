import { Metadata } from 'next';
import Link from 'next/link';
import { getSeguimientoData } from '@/lib/seguimiento';
import SeguimientoClientView from '@/components/SeguimientoClientView';
import AmbitoSelector from '@/components/AmbitoSelector';
import { CalendarClock, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Licitaciones y Contratos en Curso | LicitAlcázar',
  description:
    'Monitoreo en tiempo real de licitaciones abiertas en plazo de presentación de ofertas y contratos públicos con fecha de fin o vencimiento estimado próximo en Alcázar de San Juan.',
};

interface SeguimientoPageProps {
  searchParams: Promise<{
    ambito?: string;
  }>;
}

export default async function SeguimientoPage({ searchParams }: SeguimientoPageProps) {
  const params = await searchParams;
  const currentAmbito = params.ambito || 'directa';

  const data = getSeguimientoData(currentAmbito);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#ffffff]">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-700 transition-colors">
            Inicio
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">En Curso</span>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CalendarClock className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Licitaciones y Contratos en Curso
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Convocatorias con plazo de presentación abierto y contratos próximos a vencer
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ámbito Selector */}
        <div className="pt-1">
          <AmbitoSelector currentAmbito={currentAmbito} basePath="/seguimiento" />
        </div>
      </div>

      {/* Vista Cliente Interactiva */}
      <SeguimientoClientView
        kpis={data.kpis}
        licitacionesAbiertas={data.licitacionesAbiertas}
        contratosVivos={data.contratosVivos}
        currentAmbito={currentAmbito}
      />
    </div>
  );
}
