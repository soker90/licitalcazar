import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContractingAuthorityDetail } from '@/lib/db';
import { formatCompactCurrency, formatNumber } from '@/lib/format';
import { getOpaqueEmpresaId } from '@/lib/corporate';
import { AnnualEvolutionChart, HorizontalBarList } from '@/components/Charts';
import { ArrowLeft, Briefcase, FileText, ChevronRight, Info, CalendarClock } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface HistorialPLACSP {
  badge: string;
  titulo: string;
  descripcion: string;
  detalle: string;
  fechaInicio: string;
}

const CONTRACTING_AUTHORITY_HISTORY: Record<string, HistorialPLACSP> = {
  'Aguas de Alcázar': {
    badge: 'Alta en PLACSP: Marzo 2022',
    titulo: 'Integración en la Plataforma Estatal desde marzo de 2022',
    descripcion: 'Aguas de Alcázar (empresa mixta municipal) comenzó a publicar sus licitaciones en la Plataforma de Contratación del Sector Público a partir del 28 de marzo de 2022.',
    detalle: 'La ausencia de contratos registrados entre 2018 y 2021 responde a que sus expedientes se tramitaban previamente en el portal web corporativo propio de la empresa de aguas y no en los canales abiertos unificados de PLACSP.',
    fechaInicio: '28 de marzo de 2022',
  },
  'Patronato Municipal de Cultura': {
    badge: 'Volcado sistemático: 2020-2021',
    titulo: 'Digitalización e integración de contratos menores desde 2020-2021',
    descripcion: 'En los ejercicios 2018 y 2019 únicamente se volcaron a la plataforma estatal licitaciones mayores aisladas (1 contrato anual).',
    detalle: 'A partir de 2020 y consolidado en 2021, el Patronato incorporó el volcado sistemático de la totalidad de sus contratos menores de programación artística, espectáculos festivos y eventos culturales, pasando a registrar entre 55 y 80 contratos anuales.',
    fechaInicio: 'Agosto de 2018 (sistemático desde 2021)',
  },
  'Ayuntamiento de Alcázar de San Juan': {
    badge: 'En PLACSP desde abril 2018',
    titulo: 'Entrada en vigor de la Ley 9/2017 y volcado progresivo de contratos menores',
    descripcion: 'Los registros en la plataforma estatal comienzan el 17 de abril de 2018 con la entrada en vigor de la Ley 9/2017 de Contratos del Sector Público (LCSP).',
    detalle: 'El menor número de contratos en 2018 (93) y 2019 (104) respecto a ejercicios posteriores (~150-195 al año) refleja la implantación técnica gradual de los sistemas de administración electrónica municipal para la remisión periódica y masiva de contratos menores a PLACSP, y no una menor actividad del consistorio.',
    fechaInicio: '17 de abril de 2018',
  },
  'Mancomunidad COMSERMANCHA': {
    badge: 'En PLACSP desde septiembre 2018',
    titulo: 'Entidad supramunicipal en PLACSP desde finales de 2018',
    descripcion: 'La Mancomunidad comenzó a publicar en la plataforma estatal en septiembre de 2018 al adaptarse a las exigencias de la LCSP 9/2017.',
    detalle: 'Además de la cobertura temporal iniciada a finales de 2018, sus contratos corresponden a la gestión de residuos y servicios compartidos entre 21 municipios asociados, por lo que su presupuesto no constituye gasto municipal directo exclusivo de Alcázar.',
    fechaInicio: '20 de septiembre de 2018',
  },
  'Instituto Municipal de Deportes': {
    badge: 'Contratación centralizada',
    titulo: 'Gestión centralizada mediante el Ayuntamiento de Alcázar',
    descripcion: 'El Instituto Municipal de Deportes (IMD) tramita la práctica totalidad de sus inversiones, obras y suministros a través de la contratación centralizada del propio Ayuntamiento de Alcázar de San Juan.',
    detalle: 'Este perfil se reserva para procedimientos y acuerdos marco específicos de gestión deportiva autónoma, lo que explica un volumen anual estable y acotado (entre 3 y 7 expedientes al año).',
    fechaInicio: 'Agosto de 2018',
  },
};

export default async function OrganismoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const placspId = decodeURIComponent(id);
  const org = getContractingAuthorityDetail(placspId);

  if (!org) {
    notFound();
  }

  const isMancomunidad = org.scope === 'Indirecta (Mancomunidad)' || org.name.toUpperCase().includes('COMSERMANCHA');
  const historial = CONTRACTING_AUTHORITY_HISTORY[org.name];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-7 bg-[#ffffff]">
      {/* Back button */}
      <div>
        <Link
          href="/organismos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0d9373] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a todos los organismos
        </Link>
      </div>

      {/* Header Card */}
      <div className="mint-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs uppercase font-bold tracking-wider px-3 py-0.5 rounded-full border ${
              isMancomunidad
                ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb]'
                : 'bg-[#ecfdf5] border-[#d1fae5] text-[#0d9373]'
            }`}>
              {isMancomunidad ? 'Entidad Supramunicipal (Mancomunidad)' : org.scope}
            </span>
            {historial && (
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {historial.badge}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight leading-snug">
            {org.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#64748b]">
            Actividad contractual registrada entre {org.primer_ano || 2018} y {org.ultimo_ano || 2026}
          </p>
        </div>

        <Link
          href={`/licitaciones?organo=${encodeURIComponent(org.id)}`}
          className="self-start sm:self-auto px-5 py-2.5 rounded-lg bg-[#0a0a0a] hover:bg-[#1e293b] font-semibold text-xs sm:text-sm text-white shadow-xs transition-all flex items-center gap-2 shrink-0 active:scale-95"
        >
          <FileText className="h-4 w-4" />
          <span>Ver {formatNumber(org.total_contratos)} Licitaciones</span>
        </Link>
      </div>

      {/* Aviso de Cobertura Temporal e Historial PLACSP */}
      {historial && (
        <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3.5">
          <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 shrink-0 mt-0.5">
            <CalendarClock className="h-5 w-5 text-[#0d9373]" />
          </div>
          <div className="space-y-1 text-xs sm:text-sm text-slate-700">
            <div className="font-bold text-[#1e293b] flex items-center gap-2">
              <span>{historial.titulo}</span>
            </div>
            <p className="leading-relaxed text-slate-600 text-xs">
              {historial.descripcion} {historial.detalle}
            </p>
            <div className="pt-0.5">
              <Link
                href="/metodologia#cobertura-temporal"
                className="inline-flex items-center gap-1 font-semibold text-[#0d9373] hover:underline text-xs"
              >
                <span>Consultar marco temporal y metodología de cobertura</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Aviso Mancomunidad / Comsermancha */}
      {isMancomunidad && (
        <div className="p-4 sm:p-5 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] flex items-start gap-3.5">
          <div className="p-2 rounded-lg bg-white border border-[#bfdbfe] text-[#2563eb] shrink-0 mt-0.5">
            <Info className="h-5 w-5" />
          </div>
          <div className="space-y-1 text-xs sm:text-sm text-slate-700">
            <div className="font-bold text-[#1e293b] flex items-center gap-2">
              <span>Entidad Supramunicipal Mancomunada (21 municipios asociados)</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                Gasto Mancomunado
              </span>
            </div>
            <p className="leading-relaxed text-slate-600 text-xs">
              La Mancomunidad de Servicios COMSERMANCHA tiene su sede en Alcázar de San Juan (NIF P1300024E), pero gestiona los residuos y servicios de <strong>21 municipios</strong> de las provincias de Ciudad Real, Toledo y Cuenca. Su volumen de contratación ({formatCompactCurrency(org.volumen_total)}) <strong>no es atribuible en su totalidad al Ayuntamiento ni a la ciudadanía de Alcázar</strong>, sino que se sufraga de forma compartida entre los municipios miembros.
            </p>
            <div className="pt-1">
              <Link
                href="/metodologia#comsermancha"
                className="inline-flex items-center gap-1 font-semibold text-[#2563eb] hover:underline text-xs"
              >
                <span>Consultar detalle metodológico y distribución de gasto</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-6 border border-[#d1fae5] bg-[#ecfdf5] shadow-xs">
          <span className="text-xs text-[#0d9373] font-bold uppercase tracking-wider block mb-1">
            Gasto Adjudicado
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0a0a0a]">
            {formatCompactCurrency(org.gasto_adjudicado)}
          </span>
          {org.ingresos_adjudicados > 0 ? (
            <p className="text-[11px] text-[#0d9373] font-medium mt-1">
              +{formatCompactCurrency(org.ingresos_adjudicados)} en ingresos/cánones
            </p>
          ) : (
            <p className="text-[11px] text-[#0d9373] font-medium mt-1">Gasto público adjudicado</p>
          )}
        </div>

        <div className="mint-card p-6">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Licitaciones y Contratos
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-800">
            {formatNumber(org.total_contratos)}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Expedientes tramitados</p>
        </div>

        <div className="mint-card p-6">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Empresas Adjudicatarias
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-800">
            {formatNumber(org.total_adjudicatarios)}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Proveedores contratados</p>
        </div>
      </div>

      {/* Evolution Chart */}
      {org.evolucion && org.evolucion.length > 0 && (
        <div className="space-y-2">
          <AnnualEvolutionChart data={org.evolucion} />
          {historial && (
            <div className="px-4 py-3 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] text-xs text-slate-600 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-800">Nota sobre la serie histórica: </span>
                <span>{historial.detalle}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Breakdown by Type & Top Suppliers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tipos de Contrato */}
        <HorizontalBarList
          title="Tipos de Contrato del Organismo"
          filterType="tipo"
          items={org.porTipo.map((t: any) => ({ label: t.tipo, count: t.contratos, volumen: t.volumen }))}
          total={org.volumen_total}
        />

        {/* Top Proveedores */}
        <div className="mint-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
            <h3 className="font-bold text-[#1e293b] text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#0d9373]" />
              <span>Principales Proveedores Adjudicatarios</span>
            </h3>
          </div>

          <div className="divide-y divide-[#e2e8f0]">
            {org.topAdjudicatarios.map((adj: any, idx: number) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs gap-3">
                <div className="min-w-0 pr-2">
                  <Link
                    href={`/empresas/${encodeURIComponent(getOpaqueEmpresaId(adj.nif, adj.adjudicatario))}`}
                    className="font-bold text-slate-800 hover:text-[#0d9373] transition-colors block truncate"
                  >
                    {adj.adjudicatario}
                  </Link>
                  <span className="text-[11px] font-mono text-slate-400">{adj.contratos} adjudicaciones</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold font-mono text-slate-900 block">
                    {formatCompactCurrency(adj.volumen)}
                  </span>
                  <Link
                    href={`/empresas/${encodeURIComponent(getOpaqueEmpresaId(adj.nif, adj.adjudicatario))}`}
                    className="text-[10px] text-[#0d9373] hover:underline inline-flex items-center gap-0.5"
                  >
                    Ver <ChevronRight className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
