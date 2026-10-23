import Link from 'next/link';
import { getContractingAuthorities } from '@/lib/db';
import { formatCompactCurrency, formatNumber } from '@/lib/format';
import CsvExportButton from '@/components/CsvExportButton';
import { ArrowRight, Landmark, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OrganismosPage() {
  const contractingAuthorities = getContractingAuthorities();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-[#ffffff]">
      {/* Header */}
      <div className="border-b border-[#e2e8f0] pb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#ecfdf5] text-[#0d9373] border border-[#d1fae5]">
              <Landmark className="h-4 w-4" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">
              Organismos y Entidades Públicas de Alcázar
            </h1>
          </div>
          <div className="self-start sm:self-auto">
            <CsvExportButton
              filename={`organismos_alcazar_${new Date().toISOString().slice(0, 10)}.csv`}
              headers={['Organismo', 'Ámbito', 'Licitaciones', 'Proveedores Distintos', 'Gasto Adjudicado (€)', 'Ingresos / Cánones (€)', 'Volumen Total (€)', 'Último Contrato']}
              rows={contractingAuthorities.map((org: any) => [
                org.name,
                org.scope,
                org.total_contratos,
                org.total_adjudicatarios,
                org.gasto_adjudicado,
                org.ingresos_adjudicados,
                org.volumen_total,
                org.ultimo_contrato,
              ])}
            />
          </div>
        </div>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">
          Directorio oficial de entidades y organismos de contratación dependientes directa o indirectamente del Ayuntamiento de Alcázar de San Juan
        </p>

        {/* Nota Metodológica Ámbitos y Cobertura */}
        <div className="p-4 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] flex items-start gap-3">
          <Info className="h-4 w-4 text-[#2563eb] shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed space-y-1">
            <p>
              <strong className="text-[#1e293b]">Distinción de ámbito institucional:</strong> Los organismos con <em>Control Directo Municipal</em> (Ayuntamiento, Aguas de Alcázar, Patronato de Cultura, IMD) corresponden en exclusiva a Alcázar de San Juan. La <strong>Mancomunidad COMSERMANCHA</strong> gestiona los residuos de <strong>21 municipios asociados</strong>, por lo que su presupuesto no constituye gasto municipal directo.
            </p>
            <p className="text-slate-600">
              <strong className="text-slate-800">Cobertura temporal histórica (2018–2019):</strong> Los datos provienen de los canales oficiales de PLACSP tras la entrada en vigor de la Ley 9/2017 (LCSP). El menor registro en 2018-2019 se debe a la incorporación escalonada de perfiles instrumentales (como Aguas de Alcázar en 2022) y la integración gradual de los contratos menores telemáticos.{' '}
              <Link href="/metodologia#cobertura-temporal" className="font-semibold text-[#2563eb] underline hover:text-blue-800">
                Ver detalle en metodología
              </Link>.
            </p>
          </div>
        </div>
      </div>

      {/* Resumen de Totales y Reconciliación de Ámbitos */}
      {(() => {
        const directaOrganismos = contractingAuthorities.filter((org: any) => org.scope === 'Directa Municipal');
        const directaCount = directaOrganismos.reduce((acc: number, o: any) => acc + (o.total_contratos || 0), 0);
        const directaGasto = directaOrganismos.reduce((acc: number, o: any) => acc + (o.gasto_adjudicado || 0), 0);
        const directaIngresos = directaOrganismos.reduce((acc: number, o: any) => acc + (o.ingresos_adjudicados || 0), 0);

        const comser = contractingAuthorities.find((org: any) => org.name.includes('COMSERMANCHA'));
        const comserCount = comser ? comser.total_contratos : 0;
        const comserGasto = comser ? comser.gasto_adjudicado : 0;
        const comserIngresos = comser ? comser.ingresos_adjudicados : 0;

        const totalCount = directaCount + comserCount;
        const totalGasto = directaGasto + comserGasto;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="mint-card p-4 border-l-4 border-l-[#0d9373] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Directa Municipal ({directaOrganismos.length} entidades)
              </span>
              <div className="text-xl font-extrabold font-mono text-slate-900">
                {formatNumber(directaCount)} licitaciones · {formatCompactCurrency(directaGasto)}
              </div>
              <p className="text-[11px] text-slate-500">
                Gasto adjudicado propio municipal {directaIngresos > 0 ? `(+${formatCompactCurrency(directaIngresos)} ingresos)` : ''}
              </p>
            </div>

            <div className="mint-card p-4 border-l-4 border-l-[#2563eb] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Mancomunidad COMSERMANCHA
              </span>
              <div className="text-xl font-extrabold font-mono text-slate-900">
                {formatNumber(comserCount)} licitaciones · {formatCompactCurrency(comserGasto)}
              </div>
              <p className="text-[11px] text-slate-500">
                Gasto mancomunado (21 municipios) {comserIngresos > 0 ? `(+${formatCompactCurrency(comserIngresos)} venta reciclaje)` : ''}
              </p>
            </div>

            <div className="mint-card p-4 border-l-4 border-l-slate-700 space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Gasto Público Consolidado
              </span>
              <div className="text-xl font-extrabold font-mono text-slate-900">
                {formatNumber(totalCount)} expedientes · {formatCompactCurrency(totalGasto)}
              </div>
              <p className="text-[11px] text-slate-500">
                Total adjudicado formalizado en Alcázar (2018–2026)
              </p>
            </div>
          </div>
        );
      })()}

      {/* Grid of Organisms */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {contractingAuthorities.map((org: any) => {
          const isDirect = org.scope === 'Directa Municipal';
          const placspBadge = org.name.includes('Aguas')
            ? 'En PLACSP desde marzo 2022'
            : org.name.includes('Cultura')
            ? 'Menores sistemáticos desde 2021'
            : org.name.includes('COMSERMANCHA')
            ? 'En PLACSP desde sept 2018'
            : org.name.includes('Deportes')
            ? 'Contratación centralizada'
            : 'En PLACSP desde abril 2018';

          return (
            <Link
              key={org.id}
              href={`/organismos/${encodeURIComponent(org.placsp_id || org.id)}`}
              className="group mint-card p-6 hover:border-[#cbd5e1] transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${
                    isDirect 
                      ? 'bg-[#ecfdf5] text-[#0d9373] border-[#d1fae5]' 
                      : 'bg-[#eff6ff] text-[#2563eb] border-[#dbeafe]'
                  }`}>
                    {isDirect ? 'Control Directo Municipal' : 'Mancomunidad (21 municipios)'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    {placspBadge}
                  </span>
                </div>

                <h2 className="font-bold text-[#1e293b] text-base group-hover:text-[#0d9373] transition-colors line-clamp-2 leading-snug">
                  {org.name}
                </h2>

                <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-[#f8fafb] border border-[#e2e8f0]">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider block">Licitaciones</span>
                    <span className="font-extrabold font-mono text-slate-800 text-sm mt-0.5 block">{formatNumber(org.total_contratos)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#f8fafb] border border-[#e2e8f0]">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider block">Proveedores</span>
                    <span className="font-extrabold font-mono text-slate-800 text-sm mt-0.5 block">{formatNumber(org.total_adjudicatarios)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-[#e2e8f0] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Gasto Adjudicado</span>
                  <span className="font-bold font-mono text-[#0a0a0a] text-base sm:text-lg">
                    {formatCompactCurrency(org.gasto_adjudicado)}
                  </span>
                  {org.ingresos_adjudicados > 0 && (
                    <span className="block text-[10px] font-mono text-emerald-700 font-semibold">
                      +{formatCompactCurrency(org.ingresos_adjudicados)} ingresos
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-[#0d9373] group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Ver perfil <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
