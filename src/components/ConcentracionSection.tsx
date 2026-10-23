'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ConcentracionStats } from '@/lib/db';
import { formatCompactCurrency, formatNumber } from '@/lib/format';
import { 
  Scale, 
  TrendingUp, 
  PieChart, 
  Building2, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Info
} from 'lucide-react';

interface ConcentracionSectionProps {
  data: ConcentracionStats;
  year?: string | number | null;
  scope?: string | null;
  ano?: string | number | null;
  ambito?: string | null;
}

export default function ConcentracionSection({
  data,
  year,
  scope,
  ano,
  ambito,
}: ConcentracionSectionProps) {
  const effectiveYear = year ?? ano;
  const effectiveScope = scope ?? ambito;
  const [activeTab, setActiveTab] = useState<'tipo' | 'organismo' | 'evolucion'>('tipo');

  const { global, porTipo, porOrganismo, evolucion } = data;

  const getBadgeForNivel = (nivel: 'competitivo' | 'moderado' | 'concentrado') => {
    switch (nivel) {
      case 'competitivo':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ecfdf5] border border-[#d1fae5] text-[#0d9373]">
            <CheckCircle2 className="h-3 w-3 text-[#00d4a4]" />
            Mercado Competitivo (&lt;1.500)
          </span>
        );
      case 'moderado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fffbeb] border border-[#fef3c7] text-[#b45309]">
            <AlertCircle className="h-3 w-3 text-[#f59e0b]" />
            Concentración Moderada (1.500–2.500)
          </span>
        );
      case 'concentrado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef2f2] border border-[#fee2e2] text-[#dc2626]">
            <AlertTriangle className="h-3 w-3 text-[#ef4444]" />
            Alta Concentración (&gt;2.500)
          </span>
        );
    }
  };

  // Porcentaje relativo en la escala visual HHI (0 a 4000)
  const hhiGaugePct = Math.min(100, Math.max(0, (global.hhi / 4000) * 100));

  return (
    <div id="concentracion" className="mint-card p-6 sm:p-8 space-y-7">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
              <Scale className="h-4 w-4" />
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] tracking-tight">
              Concentración de Adjudicaciones y Distribución de Proveedores
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#64748b] mt-1">
            Evaluación de la distribución del gasto adjudicado según el Índice Herfindahl-Hirschman (HHI) y ratios de cuota (CR5 y CR1).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {effectiveScope && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
              {effectiveScope === 'directa' ? 'Directa Municipal' : effectiveScope === 'mancomunidad' ? 'Mancomunidad' : effectiveScope}
            </span>
          )}
          {effectiveYear && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              Año {effectiveYear}
            </span>
          )}
          <Link
            href="/metodologia#hhi"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f8fafb] hover:bg-[#ecfdf5] text-slate-700 hover:text-[#0d9373] border border-[#e2e8f0] text-xs font-semibold transition-all"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#0d9373]" />
            <span>Criterio CNMC / HHI</span>
          </Link>
        </div>
      </div>

      {/* Advertencia Metodológica HHI */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
        <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-800">Criterio de interpretación técnica:</strong> Un indicador de concentración no demuestra por sí solo falta de competencia, favoritismo, dependencia económica o irregularidad. Los índices HHI y ratios CR5 miden la concentración matemática del volumen adjudicado, y pueden responder a la estructura natural del sector (energía, telecomunicaciones, tratamiento especializado de residuos) o señalar la oportunidad de revisar barreras de entrada, solvencias o división en lotes.
        </div>
      </div>

      {/* 4 KPIs Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: HHI Global */}
        <div className="p-5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Índice HHI Global
              </span>
              <span className="text-xs font-mono font-bold text-slate-700">
                Escala 0–10.000
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
                {global.hhi.toLocaleString('es-ES')}
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                · n={global.totalEmpresas} emp.
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-[#e2e8f0]">
            {/* Termómetro visual */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 flex">
                <div className="w-[37.5%] bg-[#10b981]" title="Competitivo (<1500)" />
                <div className="w-[25%] bg-[#f59e0b]" title="Moderado (1500-2500)" />
                <div className="w-[37.5%] bg-[#ef4444]" title="Concentrado (>2500)" />
              </div>
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-black rounded-full shadow-xs"
                style={{ left: `calc(${hhiGaugePct}% - 3px)` }}
              />
            </div>
            <div className="pt-0.5">
              {getBadgeForNivel(global.level)}
            </div>
          </div>
        </div>

        {/* KPI 2: Cuota Top 5 (CR5) */}
        <div className="p-5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Cuota Top 5 (CR5)
              </span>
              <span className="p-1.5 rounded-lg bg-[#eff6ff] text-[#2563eb]">
                <PieChart className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
              {global.cr5}%
            </div>
          </div>

          <div className="pt-2 border-t border-[#e2e8f0] text-[11px] text-slate-500">
            Las 5 mayores empresas absorben el {global.cr5}% del presupuesto adjudicado.
          </div>
        </div>

        {/* KPI 3: Contratista Principal (CR1) */}
        <div className="p-5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Empresa Líder (CR1)
              </span>
              <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373]">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
              {global.cr1}%
            </div>
          </div>

          <div className="pt-2 border-t border-[#e2e8f0] text-[11px] text-slate-700 truncate" title={global.top5Empresas[0]?.nombre}>
            <span className="text-slate-400">1º:</span> <strong>{global.top5Empresas[0]?.nombre || 'Sin datos'}</strong>
          </div>
        </div>

        {/* KPI 4: Base de Proveedores */}
        <div className="p-5 rounded-xl bg-[#f8fafb] border border-[#e2e8f0] flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Empresas Adjudicatarias
              </span>
              <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-slate-600">
                <Users className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="text-3xl font-extrabold font-mono text-[#0a0a0a]">
              {formatNumber(global.totalEmpresas)}
            </div>
          </div>

          <div className="pt-2 border-t border-[#e2e8f0] text-[11px] text-slate-500">
            {formatCompactCurrency(global.totalVolumen)} distribuidos entre contratistas canónicos.
          </div>
        </div>
      </div>

      {/* Top 5 Empresas con Cuota de Mercado */}
      {global.top5Empresas.length > 0 && (
        <div className="p-5 rounded-xl border border-[#e2e8f0] bg-white space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 pb-1">
            <span className="font-bold text-[#1e293b] uppercase tracking-wider font-mono">
              Top 5 Adjudicatarios y Cuota de Mercado ({effectiveYear ? `Ejercicio ${effectiveYear}` : 'Consolidado Histórico'})
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              Suma CR5: <strong>{global.cr5}%</strong>
            </span>
          </div>

          <div className="space-y-2.5">
            {global.top5Empresas.map((emp, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-mono font-bold text-[#0d9373] text-[11px]">
                      #{idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800 truncate" title={emp.nombre}>
                      {emp.nombre}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                    <span className="text-slate-500">{formatCompactCurrency(emp.volumen)}</span>
                    <span className="font-bold text-slate-900 min-w-[45px] text-right">{emp.sharePct}%</span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#0d9373] h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, emp.sharePct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pestañas de Desglose: Tipo, Organismo, Evolución */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 border-b border-[#e2e8f0] pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tipo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              activeTab === 'tipo'
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] shadow-xs'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0] hover:bg-slate-100'
            }`}
          >
            Por Tipo de Contrato ({porTipo.length})
          </button>

          <button
            onClick={() => setActiveTab('organismo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              activeTab === 'organismo'
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] shadow-xs'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0] hover:bg-slate-100'
            }`}
          >
            Por Organismo ({porOrganismo.length})
          </button>

          <button
            onClick={() => setActiveTab('evolucion')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              activeTab === 'evolucion'
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] shadow-xs'
                : 'bg-[#f8fafb] text-slate-600 border-[#e2e8f0] hover:bg-slate-100'
            }`}
          >
            Evolución Anual HHI ({evolucion.length} ejercicios)
          </button>
        </div>

        {/* Contenido Pestaña 1: Por Tipo */}
        {activeTab === 'tipo' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-500 font-mono text-[11px] uppercase">
                  <th className="p-3.5 font-semibold">Tipo de Contrato</th>
                  <th className="p-3.5 font-semibold text-right">Volumen</th>
                  <th className="p-3.5 font-semibold text-right">Empresas</th>
                  <th className="p-3.5 font-semibold text-right">Índice HHI</th>
                  <th className="p-3.5 font-semibold text-center">Nivel</th>
                  <th className="p-3.5 font-semibold text-right">CR5</th>
                  <th className="p-3.5 font-semibold text-right">CR1</th>
                  <th className="p-3.5 font-semibold">Empresa Predominante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] bg-white">
                {porTipo.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-bold text-slate-800">
                      {item.nombre}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                      {formatCompactCurrency(item.volumen)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-slate-600">
                      {item.numEmpresas}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                      {item.hhi.toLocaleString('es-ES')}
                    </td>
                    <td className="p-3.5 text-center">
                      {getBadgeForNivel(item.level)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                      {item.cr5}%
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                      {item.cr1}%
                    </td>
                    <td className="p-3.5 text-slate-700 max-w-[220px] truncate" title={item.topEmpresa}>
                      <span className="font-medium text-slate-900">{item.topEmpresa}</span>
                      {item.topEmpresaVolumen > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {formatCompactCurrency(item.topEmpresaVolumen)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Contenido Pestaña 2: Por Organismo */}
        {activeTab === 'organismo' && (
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-500 font-mono text-[11px] uppercase">
                  <th className="p-3.5 font-semibold">Organismo Contratante</th>
                  <th className="p-3.5 font-semibold text-right">Volumen</th>
                  <th className="p-3.5 font-semibold text-right">Empresas</th>
                  <th className="p-3.5 font-semibold text-right">Índice HHI</th>
                  <th className="p-3.5 font-semibold text-center">Nivel</th>
                  <th className="p-3.5 font-semibold text-right">CR5</th>
                  <th className="p-3.5 font-semibold text-right">CR1</th>
                  <th className="p-3.5 font-semibold">Contratista Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] bg-white">
                {porOrganismo.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 font-bold text-slate-800 max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-[#0d9373] shrink-0" />
                        <span className="truncate" title={item.nombre}>{item.nombre}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                      {formatCompactCurrency(item.volumen)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-slate-600">
                      {item.numEmpresas}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                      {item.hhi.toLocaleString('es-ES')}
                    </td>
                    <td className="p-3.5 text-center">
                      {getBadgeForNivel(item.level)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                      {item.cr5}%
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                      {item.cr1}%
                    </td>
                    <td className="p-3.5 text-slate-700 max-w-[220px] truncate" title={item.topEmpresa}>
                      <span className="font-medium text-slate-900">{item.topEmpresa}</span>
                      {item.topEmpresaVolumen > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {formatCompactCurrency(item.topEmpresaVolumen)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Contenido Pestaña 3: Evolución Anual */}
        {activeTab === 'evolucion' && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f8fafb] border-b border-[#e2e8f0] text-slate-500 font-mono text-[11px] uppercase">
                    <th className="p-3.5 font-semibold">Año</th>
                    <th className="p-3.5 font-semibold text-right">Volumen</th>
                    <th className="p-3.5 font-semibold text-right">Empresas</th>
                    <th className="p-3.5 font-semibold text-right">Índice HHI</th>
                    <th className="p-3.5 font-semibold text-center">Nivel</th>
                    <th className="p-3.5 font-semibold text-right">CR5 (% Top 5)</th>
                    <th className="p-3.5 font-semibold text-right">CR1 (% Top 1)</th>
                    <th className="p-3.5 font-semibold">Empresa Líder del Año</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] bg-white">
                  {evolucion.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-slate-900">
                        {item.year}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                        {formatCompactCurrency(item.volumen)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-600">
                        {item.numEmpresas}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                        {item.hhi.toLocaleString('es-ES')}
                      </td>
                      <td className="p-3.5 text-center">
                        {getBadgeForNivel(item.level)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                        {item.cr5}%
                      </td>
                      <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                        {item.cr1}%
                      </td>
                      <td className="p-3.5 text-slate-700 max-w-[220px] truncate" title={item.topEmpresa}>
                        <span className="font-medium text-slate-900">{item.topEmpresa}</span>
                        {item.topEmpresaVolumen > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {formatCompactCurrency(item.topEmpresaVolumen)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 italic">
              * Nota: La serie histórica arranca con la entrada en vigor de la LCSP (marzo 2018), que obligó a publicar todos los contratos en la PLACSP.
            </p>
          </div>
        )}
      </div>

      {/* Nota Metodológica Informativa */}
      <div className="rounded-xl bg-[#f8fafb] border border-[#e2e8f0] p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-[#0d9373] shrink-0 mt-0.5" />
        <div className="text-[11px] sm:text-xs text-slate-600 leading-relaxed space-y-1">
          <p>
            <strong>¿Qué indica el Índice Herfindahl-Hirschman (HHI)?</strong> Es el estándar de referencia utilizado por la Comisión Nacional de los Mercados y la Competencia (CNMC), la Comisión Europea y el Departamento de Justicia de EE.UU. para cuantificar la concentración de mercado. Se calcula sumando los cuadrados de las cuotas porcentuales de cada adjudicatario (HHI = Σ s_i²).
          </p>
          <p>
            Un valor inferior a <strong>1.500</strong> indica un mercado diversificado y con pluralidad de proveedores; entre <strong>1.500 y 2.500</strong> refleja concentración moderada; y por encima de <strong>2.500</strong> indica alta concentración de adjudicaciones en un número reducido de contratistas. Este indicador no demuestra por sí solo falta de competencia, favoritismo o irregularidad.{' '}
            <Link href="/metodologia#hhi" className="font-semibold text-[#0d9373] underline hover:text-[#00b48a]">
              Más información técnica en la metodología
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
