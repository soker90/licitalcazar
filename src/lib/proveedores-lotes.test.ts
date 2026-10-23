import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/db.ts'), 'utf8');

describe('métricas y búsqueda de proveedores lot-aware', () => {
  it('mantiene las métricas de expediente sobre contracts y separa totalEmpresas', () => {
    const statsStart = source.indexOf('export function getStats');
    const totalsStart = source.indexOf('const totals = db.prepare', statsStart);
    const totalEmpresasStart = source.indexOf('const totalEmpresasRow = db.prepare', totalsStart);
    const totals = source.slice(totalsStart, totalEmpresasStart);

    expect(totals).toContain('FROM contracts l');
    expect(totals).not.toContain('FROM ${UNIFIED_CONTRACT_SOURCE} l');
    expect(totals).not.toContain('total_empresas');

    const totalEmpresasRow = source.slice(
      totalEmpresasStart,
      source.indexOf('// Calculo de ahorro medio', totalEmpresasStart),
    );
    expect(totalEmpresasRow).toContain('FROM ${corporateContractSource} l');
    expect(totalEmpresasRow).toContain('total_empresas');
  });

  it('incluye adjudicatarios secundarios de lot_awards en las relaciones sin atribuirles el importe del expediente', () => {
    const start = source.indexOf('const lotEntries:');
    const end = source.indexOf('  const organismoPlacspId', start);
    const relaciones = source.slice(start, end);

    expect(relaciones).toContain('Array.isArray(lote.adjudicaciones)');
    expect(relaciones).toContain('FROM lot_awards award');
    expect(relaciones).toContain('OR EXISTS (');
    expect(relaciones).toContain('WHEN ${relHeaderWhere}');
    expect(relaciones).toContain('ELSE NULL');
  });

  it('busca adjudicatarios de lotes en searchQuick sin cambiar la unidad a lote', () => {
    const start = source.indexOf('export function searchQuick');
    const end = source.indexOf('export function getEvolucionAnualStats', start);
    const search = source.slice(start, end);
    const contractsQuery = search.slice(
      search.indexOf('const contracts = db.prepare'),
      search.indexOf('// 2. Empresas'),
    );

    expect(contractsQuery).toContain('FROM contracts');
    expect(contractsQuery).toContain('awardee LIKE ?');
    expect(contractsQuery).toContain('awardee_nif LIKE ?');
    expect(contractsQuery).toContain('FROM contract_lots lot');
    expect(contractsQuery).toContain('lot.contract_id = contracts.id');
    expect(contractsQuery).toContain('lot.awardee LIKE ?');
    expect(contractsQuery).toContain('lot.awardee_nif LIKE ?');
    expect(contractsQuery).toContain('LIMIT 5');
  });

  it('busca empresas desde la fuente unificada para incluir adjudicatarios de lotes', () => {
    const start = source.indexOf('// 2. Empresas (máximo 4)');
    const end = source.indexOf('// 3. Organismos', start);
    const empresas = source.slice(start, end);

    expect(empresas).toContain('FROM ${companySearchSource} l');
    expect(empresas).not.toContain('FROM contracts l');
  });

  it('usa la fuente unificada en el desglose de menores/mayores del detalle de empresa', () => {
    const start = source.indexOf('// Desglose de Menores vs Mayores (consolidado)');
    const end = source.indexOf('// Subvenciones y ayudas públicas oficiales', start);
    const desglose = source.slice(start, end);

    expect(desglose).toContain('FROM ${corporateContractSource} l');
    expect(desglose).not.toContain('FROM contracts l');
  });

  it('calcula los grupos empresariales desde la fuente corporativa lot-aware de contratos y lotes', () => {
    const start = source.indexOf('export function getGruposEmpresarialesList');
    const end = source.indexOf('export interface EmpresaListItem', start);
    const grupos = source.slice(start, end);

    expect(grupos).toContain('FROM ${corporateContractSource} l');
    expect(grupos).not.toContain('FROM contracts l');
  });

  it('calcula empresas distintas por año desde la fuente unificada', () => {
    const start = source.indexOf('// 5. Proveedores distintos por año');
    const end = source.indexOf('// Consolidación final', start);
    const proveedores = source.slice(start, end);

    expect(proveedores).toContain('FROM ${companySearchSource} l');
    const fnStart = source.indexOf('export function getEvolucionAnualStats');
    const fnHeader = source.slice(fnStart, start);
    expect(fnHeader).toContain('const companySearchSource = getCorporateContractSource(db);');
    expect(proveedores).not.toContain('FROM contracts l');
  });

  it('usa la fuente corporativa lot-aware en el detalle de empresa', () => {
    const start = source.indexOf('export function getEmpresaDetail');
    const end = source.indexOf('export function ', start + 20);
    const detail = source.slice(start, end);

    expect(detail).toContain('const corporateContractSource = getCorporateContractSource(db);');
    expect(detail.split('FROM ${corporateContractSource}').length - 1).toBe(4);
    expect(detail).not.toContain('FROM ${UNIFIED_CONTRACT_SOURCE}');
  });
});
