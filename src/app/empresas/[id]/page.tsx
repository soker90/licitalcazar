import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getEmpresaDetail, getAlertasForEmpresa } from '@/lib/db';
import { formatCurrency, formatCompactCurrency, formatNumber, formatDate, formatNif } from '@/lib/format';
import { 
  Building2, 
  ArrowLeft, 
  ShieldCheck, 
  RefreshCw, 
  Layers, 
  Briefcase, 
  ShieldAlert,
  Info,
  ExternalLink,
  Gift,
  AlertTriangle,
  ChevronRight,
  Clock
} from 'lucide-react';
import EmpresaContratosView from '@/components/EmpresaContratosView';
import EmpresaSubvencionesSection from '@/components/EmpresaSubvencionesSection';
import { FilterDenominacionTrigger, FilterFilialTrigger, FilterProrrogasTrigger } from '@/components/EmpresaFilterTriggers';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const emp = getEmpresaDetail(decodedId);
  if (!emp) return { title: 'Empresa no encontrada · LicitAlcázar' };

  const isCanonical = emp.id === decodedId;
  return {
    title: `${emp.nombre} · Dossier de Proveedor · LicitAlcázar`,
    description: `Perfil de contratación municipal de ${emp.nombre} en Alcázar de San Juan.`,
    robots: {
      index: isCanonical,
      follow: true,
    },
  };
}

export default async function EmpresaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const emp = getEmpresaDetail(decodedId);

  if (!emp) {
    notFound();
  }

  // Redirección permanente 301/308 hacia el ID canónico opaco para proteger datos de personas físicas (RGPD)
  if (emp.id && decodedId !== emp.id) {
    permanentRedirect(`/empresas/${encodeURIComponent(emp.id)}`);
  }

  const cruce = emp.cruceDatos;
  const alertasEmpresa = getAlertasForEmpresa(emp.nif || emp.nombre || decodedId);
  const tieneCambios = cruce?.tieneCambios;
  const tieneVariasFiliales = (cruce?.grupoCorporativo?.filiales?.length || 0) > 1;
  const tieneMultiplesDenominaciones = (cruce?.denominacionesRegistradas?.length || 0) > 1;
  const hasDivisionesActivas = (cruce?.divisionesActivasCount || 0) > 1;
  const tieneHistoricasAnteriores = cruce?.denominacionesRegistradas?.some(d => d.status === 'historica_anterior');
  const tieneMultiplesDnis = (cruce?.dnisRegistrados?.length || 0) > 1;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-7 bg-[#ffffff]">
      {/* Back button */}
      <div>
        <Link
          href="/empresas"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0d9373] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al directorio de empresas
        </Link>
      </div>

      {/* Header Dossier */}
      <div className="mint-card p-6 sm:p-8 space-y-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {emp.nif && (
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-[#f8fafb] border border-[#e2e8f0] text-slate-700">
              CIF / NIF Canónico: {formatNif(emp.nif)}
            </span>
          )}

          {tieneVariasFiliales && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <Building2 className="h-3.5 w-3.5" />
              {cruce.grupoCorporativo?.nombre}
            </span>
          )}

          {hasDivisionesActivas && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <Layers className="h-3.5 w-3.5" />
              {cruce.divisionesActivasCount} divisiones comerciales activas
            </span>
          )}

          {tieneHistoricasAnteriores && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
              <RefreshCw className="h-3.5 w-3.5" />
              Cambio de Marca / Denominación Histórica
            </span>
          )}

          {!hasDivisionesActivas && !tieneHistoricasAnteriores && tieneMultiplesDenominaciones && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              <RefreshCw className="h-3.5 w-3.5" />
              {cruce.denominacionesRegistradas.length} variantes registradas
            </span>
          )}

          {cruce?.esDniEnmascarado && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <ShieldCheck className="h-3.5 w-3.5" />
              DNI RGPD Unificado
            </span>
          )}

          {emp.subvenciones && emp.subvenciones.total > 0 && (
            <a
              href="#subvenciones-bdns"
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-[#dbeafe] transition-colors"
              title="Ver ayudas y subvenciones oficiales en BDNS"
            >
              <Gift className="h-3.5 w-3.5" />
              {emp.subvenciones.total} ayudas BDNS ({formatCompactCurrency(emp.subvenciones.volumenTotal)})
            </a>
          )}

          <span className="text-xs text-slate-500 font-mono w-full sm:w-auto sm:ml-auto mt-1 sm:mt-0">
            Actividad en Alcázar: {emp.primer_ano || 2018} - {emp.ultimo_ano || 2026}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight leading-snug">
          {emp.nombre}
        </h1>

        {tieneVariasFiliales && cruce.grupoCorporativo && (
          <p className="text-xs sm:text-sm text-slate-600">
            Entidad perteneciente al <strong className="text-slate-900">{cruce.grupoCorporativo.nombre}</strong>
            . Facturación consolidada en Alcázar de todas las filiales del grupo:{' '}
            <strong className="font-mono text-[#0d9373] font-bold">{formatCurrency(cruce.grupoCorporativo.volumenConsolidadoGrupo)}</strong>
            {' '}({cruce.grupoCorporativo.contratosConsolidadoGrupo} contratos).
          </p>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-6 border border-[#d1fae5] bg-[#ecfdf5] shadow-xs">
          <span className="text-xs text-[#0d9373] font-bold uppercase tracking-wider block mb-1">
            {emp.gasto_adjudicado === 0 && emp.ingresos_adjudicados > 0
              ? 'Cánones / Ingresos Abonados'
              : 'Gasto Público Adjudicado'}
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0a0a0a]">
            {formatCompactCurrency(
              emp.gasto_adjudicado === 0 && emp.ingresos_adjudicados > 0
                ? emp.ingresos_adjudicados
                : emp.gasto_adjudicado
            )}
          </span>
          {emp.gasto_adjudicado === 0 && emp.ingresos_adjudicados > 0 ? (
            <p className="text-[11px] text-[#0d9373] font-medium mt-1">
              Abonados al Ayuntamiento en concesiones patrimoniales (Gasto municipal: 0 €)
            </p>
          ) : emp.ingresos_adjudicados > 0 ? (
            <p className="text-[11px] text-[#0d9373] font-medium mt-1">
              +{formatCompactCurrency(emp.ingresos_adjudicados)} en cánones/ingresos abonados
            </p>
          ) : (
            <p className="text-[11px] text-[#0d9373] font-medium mt-1">Facturación pública adjudicada</p>
          )}
        </div>

        <div className="mint-card p-6">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Contratos Ganados
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-800">
            {formatNumber(emp.total_contratos)}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Adjudicaciones públicas totales</p>
        </div>

        <div className="mint-card p-6">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Organismos Clientes
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-800">
            {formatNumber(emp.organismos_distintos)}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Entidades contratantes distintas</p>
        </div>
      </div>

      {/* Indicador de Incidencias de Ejecución / Prórrogas de Plazo si constan */}
      {(emp as any).modificados?.totalContratosConProrroga > 0 && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-sm block text-amber-950">
                Incidencias y Prórrogas de Ejecución Registradas
              </span>
              <span className="text-amber-800 leading-relaxed">
                Esta empresa cuenta con <strong>{(emp as any).modificados.totalContratosConProrroga} {(emp as any).modificados.totalContratosConProrroga === 1 ? 'contrato' : 'contratos'} con ampliación de plazo aprobada</strong> (+{(emp as any).modificados.totalDiasProrroga} días de prórroga acumulados)
                {(emp as any).modificados.totalSobrecosteModificaciones > 0 && (
                  <> y <strong>+{formatCurrency((emp as any).modificados.totalSobrecosteModificaciones)}</strong> en sobrecostes presupuestarios</>
                )}.
              </span>
            </div>
          </div>
          <FilterProrrogasTrigger
            count={(emp as any).modificados.totalContratosConProrroga}
            className="shrink-0 self-start sm:self-auto"
          />
        </div>
      )}

      {/* SECCIÓN PRINCIPAL: CRUCE DE DATOS, IDENTIDAD CORPORATIVA Y HISTORIAL DE NOMBRES */}
      {tieneCambios && (
        <div className="mint-card p-6 sm:p-7 space-y-6 border-l-4 border-l-[#00d4a4]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-4">
            <div>
              <h3 className="font-bold text-[#1e293b] text-base sm:text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-[#0d9373]" />
                <span>Cruce de Datos, Denominaciones y Vinculación Corporativa</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Trazabilidad oficial de razones sociales históricas, variantes de CIF/DNI y conglomerados empresariales
              </p>
            </div>

            <span className={`self-start sm:self-auto text-xs font-semibold px-3 py-1 rounded-full border ${
              cruce.tipoPrincipal === 'cambio_denominacion' 
                ? 'bg-[#fffbeb] text-[#b45309] border-[#fef3c7]'
                : cruce.tipoPrincipal === 'dni_enmascarado'
                ? 'bg-[#ecfdf5] text-[#0d9373] border-[#d1fae5]'
                : cruce.tipoPrincipal === 'grupo_empresarial'
                ? 'bg-[#eff6ff] text-[#2563eb] border-[#dbeafe]'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
              {cruce.tipoPrincipal === 'cambio_denominacion' && '🔄 Cambio de Denominación o Marca Comercial'}
              {cruce.tipoPrincipal === 'dni_enmascarado' && '🛡️ Cruce DNI RGPD Verificado'}
              {cruce.tipoPrincipal === 'grupo_empresarial' && '🏢 Grupo Empresarial / Holding'}
              {cruce.tipoPrincipal === 'variante_cif' && 'ℹ️ Variantes de CIF Unificadas'}
              {cruce.tipoPrincipal === 'estandar' && '✓ Identidad Estándar'}
            </span>
          </div>

          {/* Motivo / Contexto General */}
          <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex items-start gap-3">
            <Info className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900 block font-semibold mb-0.5">Diagnóstico del Cruce de Datos:</strong>
              {cruce.motivoGeneral}
            </div>
          </div>

          {/* SUB-BLOQUE 1: Todas las denominaciones y razones sociales registradas */}
          {cruce.denominacionesRegistradas && cruce.denominacionesRegistradas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                  <span>Historial de Denominaciones Registradas en Licitaciones ({cruce.denominacionesRegistradas.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">Total acumulado: {emp.contratos.length} contratos</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafb] text-slate-500 font-semibold border-b border-[#e2e8f0]">
                    <tr>
                      <th className="py-2.5 px-3.5">Denominación / Razón Social</th>
                      <th className="py-2.5 px-3">CIF Registrado</th>
                      <th className="py-2.5 px-3 text-center">Contratos</th>
                      <th className="py-2.5 px-3 text-right">Volumen</th>
                      <th className="py-2.5 px-3">Periodo</th>
                      <th className="py-2.5 px-3.5">Contexto / Causa</th>
                      <th className="py-2.5 px-3 text-center">Filtrar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {cruce.denominacionesRegistradas.map((denom, idx) => (
                      <tr key={idx} className={denom.status === 'activa_principal' ? 'bg-[#ecfdf5]/30' : denom.status === 'activa_division' ? 'bg-[#eff6ff]/20' : 'hover:bg-[#f8fafb]'}>
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                            <span>{denom.nombre}</span>
                            {denom.status === 'activa_principal' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                                🟢 Principal Activa
                              </span>
                            )}
                            {denom.status === 'activa_division' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                                🔵 División Comercial Activa
                              </span>
                            )}
                            {denom.status === 'historica_anterior' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
                                🟡 Denominación Anterior
                              </span>
                            )}
                          </div>
                          {denom.variantes && denom.variantes.length > 1 && (
                            <div className="text-[11px] text-slate-400 mt-1 font-normal">
                              <span className="font-medium text-slate-500">Registrado en expedientes como:</span> {denom.variantes.join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">
                          {formatNif(denom.cif) || "—"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                          {denom.totalContratos}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#0a0a0a]">
                          {formatCurrency(denom.volumen)}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {denom.primerContrato && denom.ultimoContrato 
                            ? `${formatDate(denom.primerContrato)} - ${formatDate(denom.ultimoContrato)}`
                            : '—'}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 text-[11px] leading-snug">
                          {denom.reason || 'Variante de razón social registrada en el expediente de contratación.'}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <FilterDenominacionTrigger clusterKey={denom.clusterKey} count={denom.totalContratos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-BLOQUE 2: Desglose de DNIs y Códigos de Identificación Registrados */}
          {tieneMultiplesDnis && cruce.dnisRegistrados && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
                <span>Códigos de Identificación y Variantes de DNI/CIF Registradas</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {cruce.dnisRegistrados.map((dni, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3.5 rounded-xl border flex flex-col justify-between text-xs ${
                      dni.tipo === 'verificado'
                        ? 'bg-[#ecfdf5]/40 border-[#d1fae5]'
                        : dni.tipo === 'enmascarado_rgpd'
                        ? 'bg-[#f5f3ff] border-[#ddd6fe]'
                        : 'bg-[#f8fafb] border-[#e2e8f0]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono font-bold text-slate-900 text-sm">{formatNif(dni.cif)}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          dni.tipo === 'verificado'
                            ? 'bg-[#d1fae5] text-[#065f46]'
                            : dni.tipo === 'enmascarado_rgpd'
                            ? 'bg-[#ede9fe] text-[#5b21b6]'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {dni.tipo === 'verificado' && 'DNI Verificado'}
                          {dni.tipo === 'enmascarado_rgpd' && 'Enmascarado RGPD'}
                          {dni.tipo === 'errata_normalizada' && 'Variante Normalizada'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {dni.totalContratos} contrato(s) adjudicado(s) con este código
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200/60 font-mono font-bold text-slate-900 text-right">
                      {formatCurrency(dni.volumen)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-BLOQUE 3: Pertenencia a Grupo Empresarial y Filiales */}
          {tieneVariasFiliales && cruce.grupoCorporativo && (
            <div id="grupo-empresarial" className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-[#2563eb]" />
                  <span>Filiales y Empresas del {cruce.grupoCorporativo.nombre} en Alcázar</span>
                </h4>
                <span className="text-xs font-mono font-semibold text-[#2563eb]">
                  Consolidado: {formatCompactCurrency(cruce.grupoCorporativo.volumenConsolidadoGrupo)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#eff6ff]/40 border border-[#dbeafe] space-y-3">
                <p className="text-xs text-slate-700 leading-relaxed">
                  {cruce.grupoCorporativo.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {cruce.grupoCorporativo.filiales.map((filial, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between text-xs ${
                        filial.esEstaEmpresa
                          ? 'bg-white border-[#2563eb] shadow-xs'
                          : 'bg-[#f8fafb] border-[#e2e8f0] hover:bg-white hover:border-[#cbd5e1] transition-all'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] font-semibold text-slate-500">
                            CIF: {formatNif(filial.cif)}
                          </span>
                          {filial.esEstaEmpresa ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                              Ficha Actual
                            </span>
                          ) : (
                            <Link
                              href={`/empresas/${encodeURIComponent(filial.cif || filial.nombre)}`}
                              className="text-[#2563eb] hover:underline inline-flex items-center gap-0.5 text-[11px] font-semibold"
                            >
                              Ver Ficha <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1">
                          {filial.nombre}
                        </h5>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {filial.contratos} adjudicaciones públicas
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#e2e8f0] flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Facturado</span>
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {formatCompactCurrency(filial.volumen)}
                          </span>
                        </div>
                        <FilterFilialTrigger cif={filial.cif} count={filial.contratos} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed mt-4">
                  <strong>Nota metodológica:</strong> La consolidación de grupos corporativos es un análisis analítico realizado por LicitAlcázar con fines de transparencia y estudio de concentración de mercado; no altera la personalidad jurídica de cada filial adjudicataria.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Señales de Auditoría V2 */}
      <div className="mint-card p-6 sm:p-7 space-y-4 border-l-4 border-l-[#ea580c]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e2e8f0] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c]">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-[#1e293b] text-base">
                Señales de Auditoría en Contratos de esta Empresa ({alertasEmpresa.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Alertas algorítmicas asociadas a expedientes adjudicados a {emp.nombre}
              </p>
            </div>
          </div>
          <Link
            href="/metodologia"
            className="text-xs font-semibold text-[#0d9373] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Metodología de Auditoría</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {alertasEmpresa.length > 0 ? (
          <div className="space-y-3">
            {alertasEmpresa.map((alerta) => (
              <div
                key={alerta.id}
                className={`p-4 rounded-xl border space-y-2 ${
                  alerta.severity === 'ALTA'
                    ? 'bg-[#fef2f2]/60 border-[#fecaca]'
                    : alerta.severity === 'MEDIA'
                    ? 'bg-[#fffbeb]/60 border-[#fde68a]'
                    : 'bg-[#eff6ff]/60 border-[#bfdbfe]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                      alerta.severity === 'ALTA'
                        ? 'bg-red-200 text-red-900 border border-red-300'
                        : alerta.severity === 'MEDIA'
                        ? 'bg-amber-200 text-amber-900 border border-amber-300'
                        : 'bg-blue-200 text-blue-900 border border-blue-300'
                    }`}>
                      {alerta.severity}
                    </span>
                    <span className="font-bold text-xs text-[#1e293b]">{alerta.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-[#e2e8f0]">
                    Fuente: PLACSP (dato contrastado)
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">{alerta.description}</p>

                <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                  <div className="text-slate-600 font-mono">
                    <strong>Evidencia:</strong> {alerta.evidence}
                  </div>
                  <Link
                    href={`/auditoria?alertaId=${encodeURIComponent(alerta.id)}`}
                    className="inline-flex items-center gap-1 font-semibold text-[#0d9373] hover:underline shrink-0"
                  >
                    <span>Ver en Centro de Análisis</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#ecfdf5]/40 border border-[#d1fae5] flex items-center gap-3 text-xs text-slate-700">
            <ShieldCheck className="h-5 w-5 text-[#0d9373] shrink-0" />
            <div>
              <strong className="text-slate-900">Sin señales de riesgo detectadas:</strong> Las adjudicaciones obtenidas por esta empresa no presentan concentración anómala de contratos menores ni ofertas únicas en procedimientos abiertos.
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <strong>Principio rector:</strong> Toda señal es de carácter estrictamente analítico y orientativo. No prejuzga la corrección jurídica de los expedientes administrativos.
        </div>
      </div>

      {/* Desglose de Modalidad: Contratos Menores vs Licitaciones Mayores */}
      {emp.desgloseMenores && (
        <div className="mint-card p-6 sm:p-7 space-y-4">
          <h3 className="font-bold text-[#1e293b] text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#0d9373]" />
            <span>Modalidad Contractual: Menores Directos vs Procedimientos Mayores</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1e293b] uppercase tracking-wider">Contratos Menores Directos</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                  {emp.desgloseMenores.totalMenores} adjudicaciones
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-[#0a0a0a]">
                {formatCurrency(emp.desgloseMenores.volumenMenores)}
              </div>
              {emp.desgloseMenores.totalMenores > 0 && (
                <p className="text-[11px] text-slate-500">
                  Mayor contrato menor adjudicado: <span className="font-mono font-semibold text-slate-700">{formatCurrency(emp.desgloseMenores.maxMenor)}</span>
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1e293b] uppercase tracking-wider">Licitaciones Mayores Competitivas</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                  {emp.desgloseMenores.totalMayores} contratos
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-[#0a0a0a]">
                {formatCurrency(emp.desgloseMenores.volumenMayores)}
              </div>
              <p className="text-[11px] text-slate-500">
                Procedimientos abiertos, negociados y acuerdos marco con publicidad
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Organismos para los que ha trabajado */}
      {emp.organismos && emp.organismos.length > 0 && (
        <div className="mint-card p-6 sm:p-7 space-y-4">
          <h3 className="font-bold text-[#1e293b] text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0891b2]" />
            <span>Organismos Públicos con los que ha contratado en Alcázar</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {emp.organismos.map((org: any) => (
              <div
                key={org.authority_key}
                className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-800 block truncate max-w-[190px]">
                    {org.contracting_authority_name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{org.contratos} adjudicaciones</span>
                </div>
                <span className="font-bold font-mono text-slate-900">{formatCompactCurrency(org.volumen)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN OFICIAL: SUBVENCIONES Y AYUDAS PÚBLICAS BDNS (Solo si constan registros) */}
      {emp.subvenciones && emp.subvenciones.total > 0 && (
        <EmpresaSubvencionesSection
          subvenciones={emp.subvenciones}
          nombreEmpresa={emp.nombre}
        />
      )}

      {/* SECCIÓN INTERACTIVA: HISTORIAL DE LICITACIONES Y CONTRATOS CON FILTRADO POR DENOMINACIÓN Y FILIAL */}
      <div id="historial-contratos">
        <EmpresaContratosView
          contratos={emp.contratos}
          denominaciones={cruce.denominacionesRegistradas.map(d => ({ ...d, estado: d.status }))}
          filiales={tieneVariasFiliales ? (cruce.grupoCorporativo?.filiales || []) : []}
          nombreEmpresa={emp.nombre}
          esGrupo={tieneVariasFiliales}
        />
      </div>
    </div>
  );
}
