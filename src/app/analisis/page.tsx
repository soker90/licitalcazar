import Link from 'next/link';
import { Suspense } from 'react';
import { getStats } from '@/lib/db';
import { formatCurrency, formatNumber, formatCompactCurrency, formatNif } from '@/lib/format';
import { getOpaqueEmpresaId } from '@/lib/corporate';
import { HorizontalBarList } from '@/components/Charts';
import YearSelector from '@/components/YearSelector';
import AmbitoSelector from '@/components/AmbitoSelector';
import ConcentracionSection from '@/components/ConcentracionSection';
import FlujoSection from '@/components/FlujoSection';
import ContratosVivosSection from '@/components/ContratosVivosSection';
import DistribucionTiempos from '@/components/DistribucionTiempos';
import EvolucionTemporalSection from '@/components/EvolucionTemporalSection';
import RenovacionMercadoSection from '@/components/RenovacionMercadoSection';
import CalendarioElectoralSection from '@/components/CalendarioElectoralSection';
import { LotesSection } from '@/components/LotesSection';
import { BajaTemerariaSection } from '@/components/BajaTemerariaSection';
import { ModificadosSection } from '@/components/ModificadosSection';
import { DuracionEfectivaSection } from '@/components/DuracionEfectivaSection';
import { EmpresasLocalesSection } from '@/components/EmpresasLocalesSection';
import AnalisisTableOfContents from '@/components/AnalisisTableOfContents';
import CsvExportButton from '@/components/CsvExportButton';
import { 
  BarChart3, 
  TrendingDown, 
  Clock, 
  ShieldAlert, 
  UserX, 
  AlertCircle,
  Layers,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AnalisisPage({ searchParams }: { searchParams: Promise<{ ano?: string; ambito?: string }> }) {
  const { ano, ambito } = await searchParams;
  const rawAmbito = ambito || 'directa';
  const ambitoEfectivo = rawAmbito === 'todos' ? undefined : rawAmbito;
  // Por defecto, el ejercicio en curso (mismo patrón que el directorio de empresas);
  // el selector de años puede volver a 'todos' explícitamente (?ano=todos).
  const anoRaw = ano ?? String(new Date().getFullYear());
  const anoEfectivo = anoRaw === 'todos' ? undefined : anoRaw;
  const stats = getStats(anoEfectivo, ambitoEfectivo);
  const { concurrencia, menoresRecurrentes, tiempos, fraccionamiento, fraccionamientoTotal } = stats;
  const fraccionamientoRecurrenteAnual = fraccionamiento.filter((f) => f.patronContinuidad === 'recurrente_anual').length;
  const fraccionamientoRecurrenteMenores = fraccionamiento.filter((f) => f.patronContinuidad === 'recurrente_menores').length;
  const fraccionamientoPatronConcentracion = fraccionamiento.filter((f) => f.patronContinuidad === 'patron_concentracion').length;
  const fraccionamientoPosible = fraccionamiento.filter((f) => f.patronContinuidad === 'posible_fraccionamiento').length;

  // Contratos menores vs competitivos
  const menoresList = stats.porProcedimiento.filter((p) => p.procedimiento.toLowerCase().includes('menor'));
  const menorContratos = menoresList.reduce((acc, p) => acc + (p.contratos || 0), 0);
  const menorVolumen = menoresList.reduce((acc, p) => acc + (p.volumen || 0), 0);
  const menorContratosPct = stats.totalLicitaciones > 0 ? Math.round((menorContratos / stats.totalLicitaciones) * 100) : 0;
  const menorVolumenPct = stats.totalImporte > 0 ? ((menorVolumen / stats.totalImporte) * 100).toFixed(1).replace('.', ',') : '0';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-10 bg-[#ffffff]">
      {/* Header */}
      <div className="border-b border-[#e2e8f0] pb-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
            <BarChart3 className="h-4 w-4" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">
            Análisis e Inteligencia de Contratación Municipal
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">
          Auditoría basada al 100% en los registros oficiales de la Plataforma de Contratación del Sector Público (PLACSP)
          {anoEfectivo && <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#ecfdf5] text-[#0d9373] font-bold border border-[#d1fae5] text-[11px]">Ejercicio {anoEfectivo}</span>}
          {stats.ambitoSeleccionado && <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] font-bold border border-[#bfdbfe] text-[11px]">{stats.ambitoSeleccionado}</span>}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <Suspense fallback={null}>
            <YearSelector currentYear={anoRaw} />
          </Suspense>

          <Link
            href="/metodologia#comsermancha"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-[#e2e8f0] hover:border-[#d1fae5] text-xs font-semibold transition-all self-start sm:self-auto"
          >
            <span>Criterio Comsermancha y Metodología</span>
            <ChevronRight className="h-3.5 w-3.5 text-[#0d9373]" />
          </Link>
        </div>

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

        {/* Metadatos metodológicos del análisis */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><strong>Ámbito:</strong> {stats.ambitoSeleccionado || 'Directa Municipal'}</span>
            <span><strong>Periodo:</strong> {anoEfectivo ? `Ejercicio ${anoEfectivo}` : 'Serie histórica (2018–2026)'}</span>
            <span><strong>Población total:</strong> {formatNumber(stats.totalLicitaciones)} contratos ({formatCompactCurrency(stats.totalImporte)})</span>
            <span><strong>Competitivos:</strong> n = {concurrencia.totalEvaluadas}</span>
            <span><strong>Menores:</strong> n = {concurrencia.menoresAdjudicacionDirecta?.total || menorContratos}</span>
          </div>
          <span className="text-[11px] text-slate-400">Fuente: PLACSP (Ley 9/2017)</span>
        </div>
      </div>

      <AnalisisTableOfContents />

      {/* 4 KPIs Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Concurrencia / Licitador Único */}
        <div className="mint-card p-6 border-l-4 border-l-[#f59e0b]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Oferta Única (Competitivos)</span>
            <div className="p-2 rounded-lg bg-[#fffbeb] border border-[#fef3c7] text-[#d97706]">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
            {concurrencia.pctUnaOferta}%
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {formatNumber(concurrencia.unaOferta)} de {formatNumber(concurrencia.totalEvaluadas)} licitaciones competitivas tuvieron un solo licitador (menores excluidos)
          </p>
        </div>

        {/* Radar de Menores */}
        <div className="mint-card p-6 border-l-4 border-l-[#0891b2]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Contratación Menor</span>
            <div className="p-2 rounded-lg bg-[#ecfeff] border border-[#cffafe] text-[#0891b2]">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
            {menorContratosPct}%
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {formatNumber(menorContratos)} contratos menores ({formatCompactCurrency(menorVolumen)}, {menorVolumenPct}% del presupuesto total)
          </p>
        </div>

        {/* Tiempos de Resolución */}
        <div className="mint-card p-6 border-l-4 border-l-[#2563eb]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Tiempo de Resolución</span>
            <div className="p-2 rounded-lg bg-[#eff6ff] border border-[#dbeafe] text-[#2563eb]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#0a0a0a] flex items-baseline gap-2 flex-wrap">
            <span>{tiempos.medianaDiasResolucion}</span>
            <span className="text-lg font-normal text-slate-500">días</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
              Mediana (P50)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            Media: <strong className="text-slate-700">{tiempos.mediaDiasResolucion} d</strong> • P90: <strong className="text-slate-700">{tiempos.percentiles?.p90 || 75} d</strong> ({tiempos.totalEvaluados} contratos)
          </p>
        </div>

        {/* Baja Media s/Precio Máximo */}
        <div className="mint-card p-6 border-l-4 border-l-[#00d4a4]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0d9373] font-mono">Baja Media s/Máximo</span>
            <div className="p-2 rounded-lg bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
            -{stats.ahorroMedioPct}%
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Descuento medio ofertado sobre el precio máximo fijado en los pliegos (PBL)
          </p>
        </div>
      </div>

      {/* SECCIÓN 1: RADAR DE CONTRATOS MENORES RECURRENTES */}
      <div id="menores-recurrentes" className="mint-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] tracking-tight">
                Radar de Contratos Menores Recurrentes
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#64748b] mt-1">
              Detección de proveedores con adjudicación directa continuada y proximidad del VEC a los umbrales del art. 118 LCSP (15.000€ servicios/suministros y 40.000€ obras)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f8fafb] border border-[#e2e8f0] text-xs font-mono text-slate-600">
              <span>{menoresRecurrentes.length} proveedores recurrentes</span>
            </div>
            <CsvExportButton
              filename={`menores_recurrentes_alcazar_${new Date().toISOString().slice(0, 10)}.csv`}
              headers={['Empresa', 'NIF', 'Tipo Predominante', 'Contratos Menores', 'Volumen Acumulado (€)', 'Mayor VEC (€)', 'Umbral Legal (€)', 'Años']}
              rows={menoresRecurrentes.map((item) => [
                item.adjudicatario,
                formatNif(item.nif),
                item.tipoPredominante,
                item.totalMenores,
                item.volumenTotal,
                item.maxVec,
                item.umbralLegal,
                (item.anos || []).join('; '),
              ])}
              label="CSV"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white hover:bg-[#f8fafb] border border-[#e2e8f0] hover:border-[#cbd5e1] text-[11px] font-semibold text-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-slate-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-3">Empresa Proveedora</th>
                <th className="py-3 px-3">Tipo Predominante</th>
                <th className="py-3 px-3 text-right">Contratos Menores</th>
                <th className="py-3 px-3 text-right">Volumen Acumulado</th>
                <th className="py-3 px-3 text-right">Mayor VEC disponible</th>
                <th className="py-3 px-3 text-center">Años de Contratación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f7]">
              {menoresRecurrentes.map((item, idx) => (
                <tr key={idx} className="hover:bg-[#f8fafb] transition-colors">
                  <td className="py-3.5 px-3">
                    <Link
                      href={`/empresas/${encodeURIComponent(getOpaqueEmpresaId(item.nif, item.adjudicatario))}`}
                      className="font-bold text-[#1e293b] hover:text-[#0d9373] transition-colors block"
                    >
                      {item.adjudicatario}
                    </Link>
                    {item.nif && (
                      <span className="font-mono text-[10px] text-slate-400">NIF: {formatNif(item.nif)}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f8fafb] border border-[#e2e8f0] text-slate-700">
                      {item.tipoPredominante}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800">
                    {item.totalMenores}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-bold text-[#0a0a0a]">
                    {formatCurrency(item.volumenTotal)}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <div className="font-mono font-bold text-slate-800">
                      {item.maxVec === null ? '—' : formatCurrency(item.maxVec)}
                    </div>
                    {item.alertaUmbral && item.diferenciaUmbral !== null && item.umbralLegal !== null ? (
                      item.diferenciaUmbral >= 0 ? (
                        <span 
                          className="inline-flex items-center gap-1 text-[10px] text-[#b45309] font-medium bg-[#fffbeb] border border-[#fef3c7] px-2 py-0.5 rounded-full mt-0.5"
                          title={`Mayor contrato clasificado como ${item.tipoMaxContrato || item.tipoPredominante}`}
                        >
                          A {formatCurrency(item.diferenciaUmbral)} del límite ({formatCurrency(item.umbralLegal)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#991b1b] font-medium bg-[#fef2f2] border border-[#fecaca] px-2 py-0.5 rounded-full mt-0.5">
                          Supera límite en {formatCurrency(Math.abs(item.diferenciaUmbral))}
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Límite: {item.umbralLegal === null ? '—' : formatCurrency(item.umbralLegal)} ({item.tipoMaxContrato || item.tipoPredominante})
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {(() => {
                      const anos = item.anos || [];
                      if (anos.length === 0) {
                        return <span className="text-[10px] text-slate-400 font-mono">-</span>;
                      }
                      if (anos.length <= 3) {
                        return (
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {anos.map((a, aIdx) => (
                              <span key={aIdx} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white border border-[#e2e8f0] text-slate-600">
                                {a}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      const first = anos[0];
                      const last = anos[anos.length - 1];
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono bg-white hover:bg-[#f8fafb] border border-[#e2e8f0] text-slate-700 font-semibold cursor-help transition-colors"
                          title={`Años con contratos menores (${anos.length} ejercicios): ${anos.join(', ')}`}
                        >
                          <span>{first}–{last}</span>
                          <span className="text-slate-400 font-normal">({anos.length} a.)</span>
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN 2: DETECCIÓN DE FRACCIONAMIENTO (INDICADOR 5) */}
      <div id="fraccionamiento" className="mint-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#fff7ed] text-[#c2410c] border border-[#ffedd5]">
                <Layers className="h-4 w-4" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] tracking-tight">
                Acumulación de Contratos Menores y Posibles Coincidencias
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#64748b] mt-1">
              Se ha detectado una acumulación de contratos menores con elementos coincidentes durante el periodo analizado. La coincidencia temporal, la similitud del objeto, la repetición del proveedor o la suma de importes son parámetros de priorización analítica. No permiten concluir por sí solos que exista fraccionamiento indebido. La valoración exige examinar la unidad funcional, la previsibilidad de la necesidad, la planificación, la homogeneidad de las prestaciones y el expediente completo.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f8fafb] border border-[#e2e8f0] text-xs font-mono text-slate-600">
              <span>{fraccionamientoTotal} casos · {anoEfectivo ? `ejercicio ${anoEfectivo}` : 'todos los años'}</span>
            </div>
            <CsvExportButton
              filename={`fraccionamiento_alcazar_${new Date().toISOString().slice(0, 10)}.csv`}
              headers={['Empresa', 'NIF', 'Organismo', 'Categoría', 'Suma (€)', 'Umbral (€)', 'Exceso (%)', 'Severidad', 'Patrón', 'Contratos', 'Periodo Inicio', 'Periodo Fin']}
              rows={fraccionamiento.map((caso) => [
                caso.grupoNombre || caso.adjudicatario,
                formatNif(caso.nif),
                caso.organo,
                caso.bucketUmbral === 'obras' ? 'Obras' : 'Serv./Sumin.',
                caso.suma,
                caso.umbral,
                caso.excesoPct,
                caso.severidad,
                ({
                  recurrente_anual: '🟢 Recurrente periódico',
                  recurrente_menores: '🟡 Recurrente menores',
                  patron_concentracion: '🟠 Patrón que merece revisión',
                  posible_fraccionamiento: '🔴 Posible fraccionamiento',
                } as Record<string, string>)[caso.patronContinuidad || ''] || '',
                caso.numContratos,
                caso.fechaInicio,
                caso.fechaFin,
              ])}
              label="CSV"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white hover:bg-[#f8fafb] border border-[#e2e8f0] hover:border-[#cbd5e1] text-[11px] font-semibold text-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* KPIs de fraccionamiento y continuidad: 4 niveles explícitos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="p-3.5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] text-center space-y-1">
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider font-mono block">Casos Evaluados</span>
            <div className="text-2xl font-bold font-mono text-[#0a0a0a]">{fraccionamientoTotal}</div>
            <span className="text-[10px] text-slate-400 block">acumulación en ventana 365d</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#ecfdf5] border border-[#d1fae5] text-center space-y-1">
            <span className="text-[10px] font-semibold text-[#065f46] uppercase tracking-wider font-mono block">🟢 Recurrente Periódico</span>
            <div className="text-2xl font-bold font-mono text-[#065f46]">{fraccionamientoRecurrenteAnual}</div>
            <span className="text-[10px] text-slate-500 block">renovación anual ordinaria</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#fffbeb] border border-[#fef3c7] text-center space-y-1">
            <span className="text-[10px] font-semibold text-[#b45309] uppercase tracking-wider font-mono block">🟡 Recurrente Menores</span>
            <div className="text-2xl font-bold font-mono text-[#b45309]">{fraccionamientoRecurrenteMenores}</div>
            <span className="text-[10px] text-slate-500 block">criterio OIReScon</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#fff7ed] border border-[#fed7aa] text-center space-y-1">
            <span className="text-[10px] font-semibold text-[#c2410c] uppercase tracking-wider font-mono block">🟠 Patrón en Revisión</span>
            <div className="text-2xl font-bold font-mono text-[#c2410c]">{fraccionamientoPatronConcentracion}</div>
            <span className="text-[10px] text-slate-500 block">heterogéneo o eventos</span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#fef2f2] border border-[#fee2e2] text-center space-y-1">
            <span className="text-[10px] font-semibold text-[#b91c1c] uppercase tracking-wider font-mono block">🔴 Posible Fraccionamiento</span>
            <div className="text-2xl font-bold font-mono text-[#b91c1c]">{fraccionamientoPosible}</div>
            <span className="text-[10px] text-slate-500 block">ventana corta + alta similitud</span>
          </div>
        </div>

        {/* Listado de casos */}
        <div className="space-y-2">
          {fraccionamiento.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">No se han detectado casos de fraccionamiento con la metodología actual.</p>
          )}
          {fraccionamiento.map((caso, idx) => {
            const empresaId = caso.canonicalId || getOpaqueEmpresaId(caso.nif, caso.adjudicatario);
            const badgeSeveridad =
              caso.severidad === 'alta'
                ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fee2e2]'
                : caso.severidad === 'media'
                ? 'bg-[#fffbeb] text-[#b45309] border-[#fef3c7]'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0]';
            return (
              <details key={idx} className="group rounded-xl border border-[#e2e8f0] bg-white hover:bg-[#f8fafb] transition-colors">
                <summary className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 cursor-pointer list-none text-xs">
                  <span className="flex-1 min-w-[180px]">
                    {/* TODO(#23): enlazar a /licitaciones?empresa={id}&organismo={organo}&desde={fechaInicio}&hasta={fechaFin} cuando el explorador soporte esos parámetros. */}
                    {empresaId ? (
                      <Link
                        href={`/empresas/${encodeURIComponent(empresaId)}`}
                        className="font-bold text-[#1e293b] hover:text-[#0d9373] transition-colors"
                      >
                        {caso.grupoNombre || caso.adjudicatario}
                      </Link>
                    ) : (
                      <span className="font-bold text-[#1e293b]">{caso.grupoNombre || caso.adjudicatario}</span>
                    )}
                    {caso.grupoNombre && caso.viaGrupo && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#eff6ff] text-[#1d4ed8] border border-[#dbeafe]">vía grupo</span>
                    )}
                    {caso.nif && <span className="block font-mono text-[10px] text-slate-400">NIF: {formatNif(caso.nif)}</span>}
                  </span>
                  <span className="text-slate-500 min-w-[140px] line-clamp-1">{caso.organo}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f8fafb] border border-[#e2e8f0] text-slate-700">
                    {caso.bucketUmbral === 'obras' ? 'Obras' : 'Serv./Sumin.'}
                  </span>
                  <span className="font-mono font-bold text-[#0a0a0a] min-w-[90px] text-right">{formatCurrency(caso.suma)}</span>
                  <span className={`font-mono font-bold min-w-[64px] text-right ${caso.excesoPct >= 20 ? 'text-[#b91c1c]' : 'text-[#b45309]'}`}>
                    +{caso.excesoPct}%
                  </span>
                  {caso.patronContinuidad === 'recurrente_anual' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
                      🟢 Recurrente Periódico
                    </span>
                  )}
                  {caso.patronContinuidad === 'recurrente_menores' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                      🟡 Recurrente Menores
                    </span>
                  )}
                  {caso.patronContinuidad === 'patron_concentracion' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fff7ed] text-[#c2410c] border border-[#ffedd5]">
                      🟠 Patrón en Revisión
                    </span>
                  )}
                  {caso.patronContinuidad === 'posible_fraccionamiento' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fef2f2] text-[#b91c1c] border border-[#fee2e2]">
                      🔴 Posible Fraccionamiento
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeSeveridad}`}>{caso.severidad}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-[#f1f5f7] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-[11px]">
                  {caso.justificacionPatron && (
                    <div className="col-span-2 sm:col-span-4 lg:col-span-6 p-2.5 rounded-lg bg-[#f8fafb] border border-[#e2e8f0] text-[11px] text-slate-700 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold text-slate-900">Análisis de Continuidad:</strong> {caso.justificacionPatron}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Umbral (sin IVA)</span>
                    <span className="font-mono font-bold text-slate-700">{formatCurrency(caso.umbral)}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Contratos</span>
                    <span className="font-mono font-bold text-slate-700">{caso.numContratos}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Ventanas 365d</span>
                    <span className="font-mono font-bold text-slate-700">{caso.numVentanas}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Periodo</span>
                    <span className="font-mono font-bold text-slate-700">{caso.fechaInicio} → {caso.fechaFin}</span>
                    <span className="block text-[9px] text-slate-400 font-mono">{caso.spanDias} días</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Similitud objetos</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 bg-[#f1f5f7] rounded-full h-1.5 overflow-hidden">
                        <div className="bg-[#0d9373] h-full rounded-full" style={{ width: `${Math.round(caso.similitudObjetos * 100)}%` }} />
                      </div>
                      <span className="font-mono font-bold text-slate-700">{Math.round(caso.similitudObjetos * 100)}%</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-mono uppercase">Sin importe</span>
                    <span className="font-mono font-bold text-slate-700">{caso.contratosSinImporte}</span>
                    {caso.preRDL2020 && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-[#b45309] font-medium bg-[#fffbeb] border border-[#fef3c7] px-1.5 py-0.5 rounded-full">
                        <CalendarClock className="h-3 w-3" /> pre-RDL 3/2020
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-4 lg:col-span-6">
                    <span className="block text-slate-400 font-mono uppercase mb-1">Objetos de la ventana principal</span>
                    <ul className="space-y-1">
                      {caso.objetos.map((obj, oIdx) => (
                        <li key={oIdx} className="text-slate-600 leading-snug flex gap-1.5">
                          <span className="text-slate-300 font-mono shrink-0">{String(oIdx + 1).padStart(2, '0')}</span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>

        {/* Nota metodológica */}
        <div className="rounded-xl bg-[#f8fafb] border border-[#e2e8f0] p-4 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-[#b45309] shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
            <strong>Este resultado es un indicador analítico para el análisis y consulta ciudadana, no una infracción probada.</strong> Desde el RDL 3/2020 (febrero de 2020) la acumulación de contratos menores por sí sola no está prohibida; lo que prohíbe el art. 99.2 LCSP es fraccionar un mismo objeto de forma indebida para eludir los procedimientos de publicidad y concurrencia. Importes en base imponible (sin IVA). La ventana es deslizante de 365 días —no año natural— y agrupa por identidad corporativa canónica, organismo y tipo de contrato (obras / no-obras). Las UTE se atribuyen como adjudicatario propio y los grupos empresariales se evalúan también de forma agregada (casos «vía grupo»). La similitud de objetos (Jaccard sobre texto normalizado, reforzada con CPV) es una heurística de lectura cuantitativa, no una prueba concluyente ni una resolución jurídica. Los contratos sin importe de adjudicación publicado se excluyen de la suma y se contabilizan aparte.
          </p>
        </div>
      </div>

      {/* SECCIÓN 3: CONCENTRACIÓN DE MERCADO (HHI Y CR5) */}
      <ConcentracionSection data={stats.concentracion} ano={anoEfectivo} ambito={ambito} />

      {/* SECCIÓN 4: CONCURRENCIA, OFERTA ÚNICA Y COMPETENCIA */}
      <div className="space-y-6">
        <div className="mint-card p-6 sm:p-7 space-y-6">
          <div className="border-b border-[#e2e8f0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-[#1e293b] text-base flex items-center gap-2">
                <UserX className="h-5 w-5 text-[#f59e0b]" />
                <span>Concurrencia de Ofertas en Procedimientos Competitivos</span>
              </h3>
              <p className="text-xs text-[#64748b] mt-1">
                Evaluación de la competencia efectiva en licitaciones públicas (Abiertos, Abiertos Simplificados y Negociados con publicidad).
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#fffbeb] border border-[#fef3c7] text-xs text-[#b45309] max-w-md">
              <span className="font-bold block">Ámbito de aplicación del indicador:</span>
              <span>Calculado exclusivamente sobre procedimientos competitivos (n={concurrencia.totalEvaluadas} contratos evaluados). Los contratos menores (adjudicación directa sin concurrencia exigida por ley) quedan formalmente excluidos de esta tasa.</span>
            </div>
          </div>

          {/* Desglose por número de licitadores en procedimientos competitivos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Distribución en Concursos Competitivos (n={concurrencia.totalEvaluadas})
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Media: <strong>{concurrencia.mediaOfertas}</strong> ofertas / licitación
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#fef2f2] border border-[#fee2e2]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#b91c1c]">1 Oferta (Único)</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#b91c1c] border border-[#fecaca]">
                    {concurrencia.distribucionOfertas?.pctUna ?? concurrencia.pctUnaOferta}%
                  </span>
                </div>
                <span className="text-xl font-extrabold font-mono text-slate-900 block mt-1">
                  {formatNumber(concurrencia.distribucionOfertas?.una ?? concurrencia.unaOferta)}
                </span>
                <span className="text-[10px] text-slate-500">Sin concurrencia de ofertas</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#fffbeb] border border-[#fef3c7]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#b45309]">2 Ofertas</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#b45309] border border-[#fde68a]">
                    {concurrencia.distribucionOfertas?.pctDos ?? 0}%
                  </span>
                </div>
                <span className="text-xl font-extrabold font-mono text-slate-900 block mt-1">
                  {formatNumber(concurrencia.distribucionOfertas?.dos ?? 0)}
                </span>
                <span className="text-[10px] text-slate-500">Concurrencia mínima</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#eff6ff] border border-[#dbeafe]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2563eb]">3 a 5 Ofertas</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#2563eb] border border-[#bfdbfe]">
                    {concurrencia.distribucionOfertas?.pctTresACinco ?? 0}%
                  </span>
                </div>
                <span className="text-xl font-extrabold font-mono text-slate-900 block mt-1">
                  {formatNumber(concurrencia.distribucionOfertas?.tresACinco ?? 0)}
                </span>
                <span className="text-[10px] text-slate-500">Competencia moderada</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#ecfdf5] border border-[#d1fae5]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#065f46]">&gt; 5 Ofertas</span>
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#065f46] border border-[#a7f3d0]">
                    {concurrencia.distribucionOfertas?.pctMasDeCinco ?? 0}%
                  </span>
                </div>
                <span className="text-xl font-extrabold font-mono text-slate-900 block mt-1">
                  {formatNumber(concurrencia.distribucionOfertas?.masDeCinco ?? 0)}
                </span>
                <span className="text-[10px] text-slate-500">Alta competencia</span>
              </div>
            </div>
          </div>

          {/* Bloque diferenciado: Régimen de Contrato Menor (Adjudicación Directa) */}
          {concurrencia.menoresAdjudicacionDirecta && (
            <div className="p-4 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 uppercase font-mono">
                    Adjudicación Directa en Contratos Menores (Régimen Art. 118 LCSP)
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    n = {concurrencia.menoresAdjudicacionDirecta.total} contratos
                  </span>
                </div>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  El contrato menor permite la adjudicación directa discrecional por razón de la cuantía (hasta 40.000 € en obras y 15.000 € en servicios/suministros) sin exigencia legal de licitación pública previa ni cotejo competitivo de propuestas.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="font-mono text-base font-extrabold text-slate-900">
                    {concurrencia.menoresAdjudicacionDirecta.unaOferta} de {concurrencia.menoresAdjudicacionDirecta.total}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {concurrencia.menoresAdjudicacionDirecta.pctUnaOferta}% con propuesta única
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparativa por Tipo y por Procedimiento Competitivo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-[#f1f5f7]">
            {/* Por Tipo */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
                Licitador Único por Tipo de Objeto (Competitivos)
              </h4>
              <div className="space-y-3">
                {concurrencia.porTipo.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{item.tipo}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400 text-[11px]">{item.unaOferta} de {item.total}</span>
                        <span className="font-bold text-[#b45309]">{item.pctLicitadorUnico}% único</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#f1f5f7] rounded-full h-2 overflow-hidden flex">
                      <div 
                        className="bg-[#f59e0b] h-full rounded-full transition-all"
                        style={{ width: `${item.pctLicitadorUnico}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Por Procedimiento */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
                Licitador Único por Procedimiento Competitivo
              </h4>
              <div className="space-y-3">
                {concurrencia.porProcedimiento.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 truncate max-w-[200px]" title={item.procedimiento}>
                        {item.procedimiento}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400 text-[11px]">{item.unaOferta} de {item.total}</span>
                        <span className="font-bold text-[#b45309]">{item.pctLicitadorUnico}% único</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#f1f5f7] rounded-full h-2 overflow-hidden flex">
                      <div 
                        className="bg-[#f59e0b] h-full rounded-full transition-all"
                        style={{ width: `${item.pctLicitadorUnico}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Panel Tiempos de Resolución y Distribución */}
        <DistribucionTiempos tiempos={tiempos} />
      </div>

      {/* SECCIÓN 6: ESTADO DEL FLUJO, DESIERTAS Y RE-ADJUDICACIONES */}
      <FlujoSection data={stats.flujo} ano={anoEfectivo} ambito={ambito} />

      {/* SECCIÓN 7: CONTRATOS VIVOS Y PRÓXIMOS VENCIMIENTOS */}
      <ContratosVivosSection data={stats.contratosVivos} ambito={ambito} />

      {/* SECCIÓN 8: EVOLUCIÓN TEMPORAL DE INDICADORES CLAVE */}
      <EvolucionTemporalSection data={stats.evolucionAnual} />

      {/* SECCIÓN 9: RENOVACIÓN DE PROVEEDORES: NUEVAS VS. VETERANAS */}
      <RenovacionMercadoSection data={stats.renovacionMercado} ano={anoEfectivo} />

      {/* SECCIÓN 10: ADJUDICACIONES VS. CALENDARIO ELECTORAL */}
      <CalendarioElectoralSection data={stats.calendarioElectoral} />

      {/* SECCIÓN 11: DIVISIÓN EN LOTES Y ACCESO DE PYMES (ART. 99 LCSP) */}
      <LotesSection data={stats.lotes} />

      {/* SECCIÓN 12: BAJAS ACUSADAS Y DESCUENTOS SIGNIFICATIVOS (ART. 149 LCSP) */}
      <BajaTemerariaSection data={stats.bajasTemerarias} />

      {/* SECCIÓN 13: RANKING DE MODIFICADOS Y SOBRECOSTES (ART. 204 Y 205 LCSP) */}
      <ModificadosSection data={stats.modificados} />

      {/* SECCIÓN 14: DURACIÓN REGISTRADA VS. PREVISTA (ART. 29 Y 195 LCSP) */}
      <DuracionEfectivaSection data={stats.duracionEfectiva} />

      {/* SECCIÓN 15: EMPRESAS LOCALES VS. EXTERNAS: IMPACTO TERRITORIAL DEL GASTO */}
      <EmpresasLocalesSection data={stats.empresasLocales} />

      {/* Grid: Procedimientos y Tipología */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HorizontalBarList
          title="Procedimientos de Contratación"
          filterType="procedimiento"
          items={stats.porProcedimiento.map((p) => ({ label: p.procedimiento, count: p.contratos, volumen: p.volumen }))}
          total={stats.totalImporte}
        />

        <HorizontalBarList
          title="Reparto por Tipo de Objeto"
          filterType="tipo"
          items={stats.porTipo.map((t) => ({ label: t.tipo, count: t.contratos, volumen: t.volumen }))}
          total={stats.totalImporte}
        />
      </div>

      {/* Cuadros explicativos de metodología (Mintlify Callout style) */}
      <div className="mint-card p-6 sm:p-8 space-y-4 bg-[#f8fafb]">
        <h3 className="font-bold text-[#1e293b] text-base flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[#0d9373]" />
          <span>Garantía de Metodología y Neutralidad de Datos</span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-4xl">
          Toda la información mostrada en esta plataforma se extrae de manera directa e inalterable desde los volcados de datos abiertos de la <strong>Plataforma de Contratación del Sector Público (PLACSP)</strong> del Ministerio de Hacienda. Los cálculos de proximidad a los límites de contratación menor se realizan conforme a los umbrales fijados en el artículo 118 de la Ley 9/2017 (LCSP) con fines estrictamente informativos y de transparencia ciudadana.
        </p>
      </div>
    </div>
  );
}
