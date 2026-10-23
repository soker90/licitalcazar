import { Metadata } from 'next';
import { Suspense } from 'react';
import { getEmpresasList, getFilterValues } from '@/lib/db';
import EmpresasClientView, { EmpresaItem, GrupoItem } from '@/components/EmpresasClientView';

export const metadata: Metadata = {
  title: 'Directorio de Empresas y Grupos Adjudicatarios | LicitAlcázar',
  description:
    'Trazabilidad e inteligencia corporativa de contratistas de Alcázar de San Juan. Unificación de cambios de denominación, cruce de DNIs y holdings empresariales.',
};

interface EmpresasPageProps {
  searchParams?: Promise<{
    q?: string;
    year?: string;
    ano?: string;
    sort?: string;
    page?: string;
    view?: string;
  }>;
}

export default async function EmpresasPage({ searchParams }: EmpresasPageProps) {
  const params = (await searchParams) || {};
  const filterValues = getFilterValues();
  const availableYears: number[] = filterValues.anos || [];

  const currentYear = new Date().getFullYear();
  const defaultYear = availableYears.includes(currentYear) ? String(currentYear) : '';
  const effectiveYear = params.year !== undefined ? params.year : (params.ano !== undefined ? params.ano : defaultYear);
  const effectiveSort = (params.sort === 'contratos' ? 'contratos' : 'volumen') as 'volumen' | 'contratos';
  const effectiveView = (params.view === 'grupos' ? 'grupos' : 'empresas') as 'empresas' | 'grupos';
  const effectivePage = params.page ? Math.max(1, Number(params.page) || 1) : 1;
  const effectiveQ = params.q || '';

  const initialResult = getEmpresasList({
    q: effectiveQ || undefined,
    page: effectivePage,
    limit: 18,
    sort: effectiveSort,
    view: effectiveView,
    year: effectiveYear || undefined,
  });

  const totalGlobalEmpresas = getEmpresasList({ view: 'empresas', limit: 1 }).total;

  let initialData: EmpresaItem[] = [];
  let initialGruposData: GrupoItem[] = [];

  if (effectiveView === 'grupos') {
    initialGruposData = (initialResult.data || []) as unknown as GrupoItem[];
  } else {
    initialData = (initialResult.data || []) as EmpresaItem[];
  }

  return (
    <Suspense fallback={<div className="p-16 text-center text-slate-400 text-sm">Cargando directorio de empresas...</div>}>
      <EmpresasClientView
        initialData={initialData}
        initialGruposData={initialGruposData}
        initialTotal={initialResult.total || 0}
        initialTotalPages={initialResult.totalPages || 1}
        initialTotalGlobalEmpresas={totalGlobalEmpresas}
        initialYear={effectiveYear}
        initialView={effectiveView}
        initialSort={effectiveSort}
        initialQ={effectiveQ}
        initialPage={effectivePage}
        availableYears={availableYears}
      />
    </Suspense>
  );
}
