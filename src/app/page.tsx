import Link from 'next/link';
import { Suspense } from 'react';
import { getStats } from '@/lib/db';
import { getPlacspId } from '@/lib/placsp';
import { formatCurrency, formatNumber, formatDate, formatCompactCurrency, formatDecimal, formatPercent } from '@/lib/format';
import { getContractAmountPresentation } from '@/lib/importe-presentacion';
import HomeHero from '@/components/HomeHero';
import HomeAuditoriaSection from '@/components/HomeAuditoriaSection';
import HomeExpiringContractsSection from '@/components/HomeExpiringContractsSection';
import { AnnualEvolutionChart, HorizontalBarList } from '@/components/Charts';
import TopEmpresasSection from '@/components/TopEmpresasSection';
import AmbitoSelector from '@/components/AmbitoSelector';
import { EstadoBadge, TipoBadge, ProcedimientoBadge } from '@/components/Badge';
import { 
  FileText, 
  Coins, 
  Building2, 
  Users, 
  ChevronRight,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ scope?: string }> }) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawAmbito = resolvedParams.scope || 'directa';
  const scope = rawAmbito === 'todos' ? undefined : rawAmbito;
  const stats = getStats(undefined, scope);

  const kpis = [
    {
      title: 'Licitaciones Analizadas',
      value: formatNumber(stats.totalLicitaciones),
      subtitle: stats.ambitoSeleccionado === 'Directa Municipal'
        ? 'Contratación del Ayuntamiento (2018–2026)'
        : stats.ambitoSeleccionado === 'Indirecta (Mancomunidad)'
          ? 'Mancomunidad de residuos (21 municipios, 2018–2026)'
          : 'Total de licitaciones en Alcázar (2018–2026)',
      badge: stats.ambitoSeleccionado === 'Directa Municipal'
        ? 'Solo Ayuntamiento · 2018–2026'
        : stats.ambitoSeleccionado === 'Indirecta (Mancomunidad)'
          ? 'Comsermancha · 2018–2026'
          : 'Total Alcázar · 2018–2026',
      icon: FileText,
      iconBg: 'bg-[#eff6ff] text-[#2563eb] border-[#d1fae5]',
    },
    {
      title: 'Gasto Público Adjudicado',
      value: formatCompactCurrency(stats.gastoAdjudicado),
      subtitle: stats.ambitoSeleccionado === 'Directa Municipal'
        ? 'Gasto público con adjudicación registrada'
        : stats.ambitoSeleccionado === 'Indirecta (Mancomunidad)'
          ? 'Gasto adjudicado Comsermancha'
          : `Ayto: ${formatDecimal(stats.desgloseAmbito.directa.gastoAdjudicado / 1e6, 1)} M€ · Comser.: ${formatDecimal(stats.desgloseAmbito.mancomunidad.gastoAdjudicado / 1e6, 1)} M€`,
      badge: stats.ambitoSeleccionado === 'Directa Municipal'
        ? `${formatPercent(stats.desgloseAmbito.directa.pctGasto, 1)} del gasto`
        : stats.ambitoSeleccionado === 'Indirecta (Mancomunidad)'
          ? `${formatPercent(stats.desgloseAmbito.mancomunidad.pctGasto, 1)} del gasto`
          : `-${formatPercent(stats.ahorroMedioPct, 1)} baja media s/máx`,
      icon: Coins,
      iconBg: 'bg-[#ecfdf5] text-[#0d9373] border-[#d1fae5]',
    },
    {
      title: 'Organismos Públicos',
      value: formatNumber(stats.totalOrganismos),
      subtitle: stats.ambitoSeleccionado === 'Directa Municipal'
        ? 'Dependencias municipales directas'
        : stats.ambitoSeleccionado === 'Indirecta (Mancomunidad)'
          ? 'Mancomunidad supramunicipal'
          : 'Entidades directas e indirectas',
      badge: stats.ambitoSeleccionado === 'Directa Municipal' ? 'Ayto, Aguas, Patronato...' : 'Entidades públicas',
      icon: Building2,
      iconBg: 'bg-[#ecfeff] text-[#0891b2] border-[#cffafe]',
    },
    {
      title: 'Empresas Adjudicatarias',
      value: `+${formatNumber(stats.totalEmpresas)}`,
      subtitle: 'Contratistas y proveedores (2018–2026)',
      badge: 'Red de empresas',
      icon: Users,
      iconBg: 'bg-[#fffbeb] text-[#d97706] border-[#fef3c7]',
    },
  ];

  return (
    <div className="space-y-10 pb-20 bg-[#ffffff]">
      {/* Hero */}
      <HomeHero 
        ultimaActualizacion={stats.ultimaActualizacion}
        ultimaSincronizacion={stats.ultimaSincronizacion}
        ultimaLicitacion={stats.ultimaLicitacion}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8 -mt-6 relative z-10">
        {/* Selector de Ámbito Institucional */}
        <Suspense fallback={null}>
          <AmbitoSelector
            currentAmbito={rawAmbito}
            counts={{
              directaVolumen: stats.desgloseAmbito.directa.volumen,
              mancomunidadVolumen: stats.desgloseAmbito.mancomunidad.volumen,
              totalVolumen: stats.desgloseAmbito.directa.volumen + stats.desgloseAmbito.mancomunidad.volumen,
            }}
          />
        </Suspense>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div
                key={idx}
                className="mint-card p-5 sm:p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] font-mono">
                      {kpi.title}
                    </span>
                    <div className={`p-2 rounded-lg border ${kpi.iconBg}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="text-2xl sm:text-3xl font-extrabold text-[#0a0a0a] tracking-tight font-mono">
                    {kpi.value}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e2e8f0] text-[11px]">
                  <span className="text-slate-500">{kpi.subtitle}</span>
                  <span className="font-semibold text-[#0d9373] bg-[#ecfdf5] border border-[#d1fae5] px-2 py-0.5 rounded-full text-[10px]">
                    {kpi.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desglose de Naturaleza Económica y Estado Contractual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-700 block">Ingresos y Cánones Patrimoniales</span>
              <span className="text-[11px] text-slate-500">Abonados al Ayuntamiento por concesiones</span>
            </div>
            <span className="font-extrabold font-mono text-emerald-700 text-sm">
              +{formatCompactCurrency(stats.ingresosAdjudicados)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-700 block">Licitaciones en Tramitación</span>
              <span className="text-[11px] text-slate-500">Presupuesto publicado en curso</span>
            </div>
            <span className="font-extrabold font-mono text-blue-700 text-sm">
              {formatCompactCurrency(stats.gastoEnCurso)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-700 block">Licitaciones Desiertas</span>
              <span className="text-[11px] text-slate-500">PBL finalizado sin adjudicación</span>
            </div>
            <span className="font-extrabold font-mono text-slate-600 text-sm">
              {formatCompactCurrency(stats.gastoDesierto)}
            </span>
          </div>
        </div>

        {/* Semáforo y Centro de Análisis de Riesgos */}
        <HomeAuditoriaSection scope={scope} />

        {/* Vigilancia de Contratos en Vigor y Próximos Vencimientos */}
        <HomeExpiringContractsSection contratosVivos={stats.contratosVivos} scope={scope} />

        {/* Evolución Histórica de Inversión */}
        <AnnualEvolutionChart data={stats.evolucionAnual} />

        {/* Desgloses por Tipo y Procedimiento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HorizontalBarList
            title="Distribución por Tipo de Contrato"
            filterType="tipo"
            items={stats.porTipo.map((t) => ({ label: t.tipo, count: t.contratos, volumen: t.volumen }))}
            total={stats.totalImporte}
          />
          <HorizontalBarList
            title="Distribución por Procedimiento"
            filterType="procedimiento"
            items={stats.porProcedimiento.map((p) => ({ label: p.procedimiento, count: p.contratos, volumen: p.volumen }))}
            total={stats.totalImporte}
          />
        </div>

        {/* Top 10 Empresas Adjudicatarias */}
        <TopEmpresasSection
          topVolumen={stats.topEmpresasVolumen.map(e => ({ ...e, adjudicatario: e.awardee }))}
          topContratos={stats.topEmpresasContratos.map(e => ({ ...e, adjudicatario: e.awardee }))}
        />

        {/* Top Organismos Públicos de Alcázar */}
        <div className="mint-card p-6 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                  <Building2 className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
                  Organismos Públicos y Entidades Contratantes
                </h3>
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                Gasto público acumulado por dependencias municipales y entes con sede o actuación en Alcázar
              </p>
            </div>
            <Link
              href="/organismos"
              className="text-xs font-semibold text-[#0d9373] hover:text-[#00b48a] flex items-center gap-1.5 self-start sm:self-auto transition-colors"
            >
              <span>Ver todos los {stats.totalOrganismos} organismos</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.topOrganismos.slice(0, 6).map((org, idx) => {
              const authorityIdentifier = org.placsp_id || org.authorityId;
              const cardContent = (
                <>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                      <span className="font-mono text-[#0d9373] font-semibold">
                        Nº {idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {org.scope === 'Indirecta (Mancomunidad)' || org.organo.includes('COMSERMANCHA') ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                            Mancomunidad
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#f8fafb] text-slate-600 border border-[#e2e8f0]">
                            Directa
                          </span>
                        )}
                        <span className="font-mono">{formatNumber(org.contratos)} lic.</span>
                      </div>
                    </div>
                    <h4 className="font-bold text-[#1e293b] text-sm group-hover:text-[#0d9373] transition-colors line-clamp-2">
                      {org.organo}
                    </h4>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Total adjudicado:</span>
                    <span className="font-bold font-mono text-slate-900 text-sm sm:text-base">
                      {formatCompactCurrency(org.volumen)}
                    </span>
                  </div>
                </>
              );
              const cardClassName = 'group p-4.5 rounded-xl bg-[#f8fafb] hover:bg-white border border-[#e2e8f0] hover:border-[#00d4a4] hover:shadow-xs transition-all flex flex-col justify-between';

              return authorityIdentifier ? (
                <Link
                  key={authorityIdentifier}
                  href={`/organismos/${encodeURIComponent(authorityIdentifier)}`}
                  className={cardClassName}
                >
                  {cardContent}
                </Link>
              ) : (
                <div key={`unlinked-authority-${idx}`} className={cardClassName}>
                  {cardContent}
                </div>
              );
            })}
          </div>
        </div>

        {/* Últimos Contratos Publicados */}
        <div className="mint-card p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
                  Últimas Licitaciones y Contratos Registrados
                </h3>
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                Expedientes de contratación y adjudicaciones más recientes en Alcázar de San Juan
              </p>
            </div>
            <Link
              href="/licitaciones"
              className="text-xs font-semibold text-[#0d9373] hover:text-[#00b48a] flex items-center gap-1.5 self-start sm:self-auto transition-colors"
            >
              <span>Ver las {formatNumber(stats.totalLicitaciones)} licitaciones</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#e2e8f0] rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
            {stats.ultimasLicitaciones.map((lic) => (
              <div
                key={lic.id}
                className="p-4 sm:p-5 hover:bg-[#f8fafb] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="min-w-0 space-y-2 flex-1 pr-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono font-medium text-slate-500 bg-[#f8fafb] px-2 py-0.5 rounded border border-[#e2e8f0]">
                      {lic.case_number || 'Sin exp.'}
                    </span>
                    <EstadoBadge estado={lic.status} />
                    <TipoBadge tipo={lic.contract_type} />
                    <ProcedimientoBadge procedimiento={lic.procedimiento} />
                  </div>

                  <Link
                    href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                    className="font-bold text-[#1e293b] hover:text-[#0d9373] text-xs sm:text-sm block transition-colors line-clamp-2 leading-snug"
                  >
                    {lic.object_description}
                  </Link>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="text-slate-700 font-medium">
                      🏛️ {lic.contracting_authority_name}
                    </span>
                    {lic.awardee && (
                      <>
                        <span>•</span>
                        <span className="text-slate-700 truncate max-w-[240px]">
                          🤝 {lic.awardee}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span className="font-mono text-slate-400">{formatDate(lic.publication_date || lic.award_date)}</span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#e2e8f0]">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {getContractAmountPresentation(lic).label}
                  </span>
                  <span className="font-extrabold font-mono text-[#0a0a0a] text-sm sm:text-base group-hover:text-[#0d9373] transition-colors">
                    {(() => {
                      const amount = getContractAmountPresentation(lic);
                      return amount.value === null ? 'No disponible' : formatCurrency(amount.value);
                    })()}
                  </span>
                  <Link
                    href={`/licitaciones/${encodeURIComponent(getPlacspId(lic.id) || lic.id)}`}
                    className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>Ficha técnica</span>
                    <ChevronRight className="h-3 w-3" />
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
