'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPlacspId } from '@/lib/placsp';
import { RenovacionMercadoStats } from '@/lib/db';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { 
  Users, 
  HelpCircle, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  ChevronRight, 
  Calendar, 
  Award
} from 'lucide-react';

interface RenovacionMercadoSectionProps {
  data: RenovacionMercadoStats;
  ano?: number | string;
}

export default function RenovacionMercadoSection({ data, ano }: RenovacionMercadoSectionProps) {
  const [activeTab, setActiveTab] = useState<'evolucion' | 'veteranas' | 'debutantes'>('evolucion');

  const { resumenGlobal, evolucion, veteranas, nuevosEntrantes, anoSeleccionado } = data;
  const effectiveAno = ano ? Number(ano) : anoSeleccionado;

  // Selected year for exploration in debutantes tab
  const defaultExplorationYear = effectiveAno || (evolucion.length > 0 ? evolucion[evolucion.length - 1].year : 2025);
  const [selectedYear, setSelectedYear] = useState<number>(defaultExplorationYear);

  // Active year in evolution
  const currentEvo = evolucion.find((e) => e.year === (effectiveAno || selectedYear)) || evolucion[evolucion.length - 1];

  // Maximum value for bar scaling in evolution
  const maxTotalActivos = Math.max(...evolucion.map((e) => e.totalActivos), 1);

  return (
    <div className="w-full mint-card p-6 sm:p-7 space-y-6">
      {/* Cabecera */}
      <div className="border-b border-[#e2e8f0] pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <Users className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-[#1e293b] text-base sm:text-lg tracking-tight">
              Renovación de Proveedores: Empresas Nuevas vs. Veteranas
            </h3>
          </div>
          <p className="text-xs text-[#64748b] mt-1.5 max-w-2xl">
            Seguimiento del primer contrato histórico de cada adjudicatario y tasa de rotación anual frente a proveedores recurrentes en el municipio.
          </p>
        </div>

        <Link
          href="/metodologia#renovacion-mercado"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0d9373] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] transition-colors self-start md:self-auto shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Metodología de Renovación</span>
        </Link>
      </div>

      {/* Tarjetas KPI de Diagnóstico */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Tasa de Renovación */}
        <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
            Tasa de Rotación ({currentEvo?.year || 'Actual'})
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono ${currentEvo?.pctRenovacion < 50 ? 'text-[#b91c1c]' : 'text-[#0d9373]'}`}>
              {currentEvo?.pctRenovacion ?? 0}%
            </span>
            <span className="text-xs text-slate-500 font-medium">nuevos</span>
          </div>
          <span className="text-[11px] text-slate-500 block pt-0.5">
            {currentEvo?.nuevosEntrantes ?? 0} debutantes de {currentEvo?.totalActivos ?? 0} activos
          </span>
        </div>

        {/* Media Histórica */}
        <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
            Media Histórica (2019-2026)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-800">
              {resumenGlobal.tasaRenovacionMedia}%
            </span>
            <span className="text-xs text-slate-400 font-medium">rotación</span>
          </div>
          <span className="text-[11px] text-slate-500 block pt-0.5">
            Máx: {resumenGlobal.anoMaxRenovacion} · Mín: {resumenGlobal.anoMinRenovacion}
          </span>
        </div>

        {/* Gasto Captado por Veteranas */}
        <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
            Presupuesto en Veteranas
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#1e293b]">
              {currentEvo?.pctGastoVeteranos ?? 0}%
            </span>
            <span className="text-xs text-slate-500 font-medium">del total</span>
          </div>
          <span className="text-[11px] font-mono text-[#0d9373] block pt-0.5 font-bold">
            {formatCurrency(currentEvo?.gastoVeteranos ?? 0)}
          </span>
        </div>

        {/* Señal de Alerta */}
        <div className={`p-4 rounded-xl border shadow-2xs space-y-1 ${
          currentEvo?.alertaMercadoCerrado 
            ? 'bg-[#fef2f2] border-[#fecaca]' 
            : 'bg-[#ecfdf5] border-[#a7f3d0]'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider font-mono block flex items-center gap-1 text-slate-600">
            {currentEvo?.alertaMercadoCerrado ? (
              <ShieldAlert className="h-3.5 w-3.5 text-[#d97706]" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0d9373]" />
            )}
            Nivel de Rotación
          </span>
          <span className={`text-base font-black block line-clamp-1 ${
            currentEvo?.alertaMercadoCerrado ? 'text-[#92400e]' : 'text-[#065f46]'
          }`}>
            {currentEvo?.alertaMercadoCerrado ? 'Baja Renovación' : 'Rotación Sostenida'}
          </span>
          <span className="text-[10px] text-slate-600 block line-clamp-2 leading-tight pt-0.5">
            {currentEvo?.alertaMercadoCerrado 
              ? 'La proporción de nuevos adjudicatarios cae por debajo del 50% con mayor peso de veteranos.' 
              : 'Existe incorporación continua de nuevos contratistas en el ejercicio.'}
          </span>
        </div>
      </div>

      {/* Callout de Diagnóstico Explicativo */}
      {currentEvo?.alertaMercadoCerrado && (
        <div className="p-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3 text-xs text-[#92400e]">
          <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <strong className="block font-bold">Baja Renovación de Proveedores (Señal Descriptiva):</strong>
            <p className="leading-relaxed">
              En este ejercicio, los proveedores con contratos en ejercicios anteriores concentran la mayor parte de las adjudicaciones.
            </p>
            <p className="leading-relaxed text-[#78350f] text-[11px] bg-white/60 p-2 rounded-lg border border-[#fde68a]">
              <strong>Aviso metodológico:</strong> Este indicador describe un patrón de concentración y no demuestra por sí solo falta de competencia, favoritismo, dependencia económica o irregularidad. Los criterios aplicados (rotación &lt; 50% y peso de veteranas &gt; 75%) constituyen un <strong>umbral analítico propio utilizado por LicitAlcázar</strong> y no un umbral establecido por la legislación. Corresponde al investigador comprobar si los pliegos contienen requisitos de solvencia desproporcionados o si la división en lotes permitiría una mayor concurrencia de PYMEs.
            </p>
          </div>
        </div>
      )}

      {/* Navegación por pestañas */}
      <div className="space-y-4">
        <div className="flex p-1 bg-[#f1f5f9] rounded-xl self-start overflow-x-auto">
          <button
            onClick={() => setActiveTab('evolucion')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'evolucion'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Evolución y Concentración Anual
          </button>
          <button
            onClick={() => setActiveTab('veteranas')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'veteranas'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Empresas Incombustibles ({veteranas.length})
          </button>
          <button
            onClick={() => setActiveTab('debutantes')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              activeTab === 'debutantes'
                ? 'bg-white text-[#0f172a] shadow-xs'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Nuevos Entrantes por Año
          </button>
        </div>

        {/* Tab 1: Evolución Anual (Gráfico de barras compuestas + Tabla) */}
        {activeTab === 'evolucion' && (
          <div className="space-y-5">
            {/* Gráfico de Barras Compuestas Nuevos vs Veteranos */}
            <div className="p-4 rounded-xl bg-white border border-[#e2e8f0] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider font-mono text-[11px]">
                  Rotación de Proveedores (2018–2026)
                </span>
                <div className="flex items-center gap-4 text-[11px] font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#10b981]" />
                    <span className="text-slate-600">Nuevos Entrantes</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#64748b]" />
                    <span className="text-slate-600">Veteranos Recurrentes</span>
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {evolucion.map((item) => {
                  const pctNuevosWidth = (item.nuevosEntrantes / maxTotalActivos) * 100;
                  const pctVeteranosWidth = (item.veteranos / maxTotalActivos) * 100;
                  const isCurrentYear = item.year === (anoSeleccionado || currentEvo?.year);

                  return (
                    <div key={item.year} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${isCurrentYear ? 'text-[#0d9373]' : 'text-slate-700'}`}>
                            {item.year}
                          </span>
                          {item.alertaMercadoCerrado && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#fffbeb] text-[#92400e] border border-[#fde68a]">
                              Baja renovación ({item.pctRenovacion}%)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-[#059669] font-semibold">{item.nuevosEntrantes} nuevos</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-600">{item.veteranos} veteranos</span>
                          <span className="text-slate-400 font-normal">({item.totalActivos} tot.)</span>
                        </div>
                      </div>

                      {/* Stacked bar */}
                      <div className="h-3 w-full bg-[#f1f5f9] rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${pctNuevosWidth}%` }}
                          title={`Nuevos: ${item.nuevosEntrantes} (${item.pctRenovacion}%)`}
                          className="h-full bg-[#10b981] hover:bg-[#059669] transition-all"
                        />
                        <div
                          style={{ width: `${pctVeteranosWidth}%` }}
                          title={`Veteranos: ${item.veteranos} (${formatPercent(100 - item.pctRenovacion, 1)})`}
                          className="h-full bg-[#64748b] hover:bg-[#475569] transition-all"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabla Completa de Evolución */}
            <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                    <th className="py-2.5 px-3">Año</th>
                    <th className="py-2.5 px-3 text-right">Activos</th>
                    <th className="py-2.5 px-3 text-right text-[#065f46]">Nuevos</th>
                    <th className="py-2.5 px-3 text-right text-[#334155]">Veteranos</th>
                    <th className="py-2.5 px-3 text-right text-[#0d9373]">% Rotación</th>
                    <th className="py-2.5 px-3 text-right">Gasto Total</th>
                    <th className="py-2.5 px-3 text-right text-[#1e293b]">% Gasto Veteranas</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {evolucion.map((row) => (
                    <tr key={row.year} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {row.year}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {row.totalActivos}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#059669]">
                        {row.nuevosEntrantes}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-600">
                        {row.veteranos}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0d9373]">
                        {formatPercent(row.pctRenovacion, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {formatCurrency(row.gastoTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1e293b]">
                        {formatPercent(row.pctGastoVeteranos, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.alertaMercadoCerrado ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#fffbeb] text-[#92400e] border border-[#fde68a]">
                            Baja rotación
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#ecfdf5] text-[#065f46]">
                            Rotación normal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Empresas Incombustibles (Veteranas) */}
        {activeTab === 'veteranas' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-600 pb-1">
              Empresas con mayor continuidad histórica en Alcázar de San Juan (activas en 5 o más ejercicios anuales):
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                    <th className="py-2.5 px-3">Empresa Adjudicataria</th>
                    <th className="py-2.5 px-3 text-center">Ejercicios Activos</th>
                    <th className="py-2.5 px-3 text-center">Periodo</th>
                    <th className="py-2.5 px-3 text-right">Contratos</th>
                    <th className="py-2.5 px-3 text-right">Volumen Total</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] bg-white">
                  {veteranas.map((vet, idx) => (
                    <tr key={vet.empresaId} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-slate-400">
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-slate-800 block line-clamp-1">
                              {vet.nombre}
                            </span>
                            {vet.cif && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                CIF: {vet.cif}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs inline-flex items-center gap-1 ${
                          vet.totalEjercicios >= 8
                            ? 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]'
                            : 'bg-[#f1f5f9] text-slate-700'
                        }`}>
                          <Award className="h-3 w-3 text-[#0d9373]" />
                          {vet.totalEjercicios} años
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                        {vet.primerAno} – {vet.ultimoAno}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatNumber(vet.totalContratos)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0d9373]">
                        {formatCurrency(vet.totalVolumen)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/empresas/${encodeURIComponent(vet.empresaId || vet.cif || vet.nombre)}`}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-[#0d9373] transition-colors font-medium text-[11px]"
                        >
                          <span>Ficha</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Debutantes por Año */}
        {activeTab === 'debutantes' && (
          <div className="space-y-4">
            {/* Selector de ejercicio para explorar debutantes */}
            <div className="flex flex-wrap items-center gap-2 bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-2">
                <Calendar className="h-3.5 w-3.5 text-[#0d9373]" />
                Ver primer contrato adjudicado en:
              </span>
              <div className="flex flex-wrap gap-1">
                {evolucion.map((e) => (
                  <button
                    key={e.year}
                    onClick={() => setSelectedYear(e.year)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                      selectedYear === e.year
                        ? 'bg-[#1e293b] text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e2e8f0]'
                    }`}
                  >
                    {e.year} ({e.nuevosEntrantes})
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de debutantes */}
            <div className="space-y-2.5">
              <div className="text-xs text-slate-600 pb-1">
                Empresas que consiguieron su primer contrato histórico en <strong>{selectedYear}</strong>:
              </div>

              {nuevosEntrantes.filter((d) => d.year === selectedYear).length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
                  Selecciona otro ejercicio en los botones superiores para inspeccionar debutantes de ese año.
                </div>
              ) : (
                nuevosEntrantes
                  .filter((d) => d.year === selectedYear)
                  .map((debut, idx) => (
                    <Link
                      key={`${debut.licitacionId}-${idx}`}
                      href={`/licitaciones/${encodeURIComponent(getPlacspId(debut.licitacionId) || debut.case_number)}`}
                      className="group p-3.5 rounded-xl bg-white hover:bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#0d9373] text-xs flex items-center justify-between gap-3 transition-all shadow-2xs block"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-black text-slate-900 group-hover:text-[#0d9373] transition-colors">
                            {debut.empresaNombre}
                          </span>
                          {debut.cif && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({debut.cif})
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                            Primer Contrato
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-1">
                          {debut.object_description}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                          <span>Exp: {debut.case_number}</span>
                          <span>•</span>
                          <span>{debut.procedimiento}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="font-mono font-bold text-xs text-[#0d9373] block">
                            {formatCurrency(debut.amount)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {debut.fechaAdjudicacion ? debut.fechaAdjudicacion.slice(0, 10) : `${debut.year}`}
                          </span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0d9373] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
