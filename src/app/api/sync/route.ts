import { eligibleAwardLotStatusSql, eligibleAwardResultStateSql, excludeAwardWhenLegacyLotTerminalSql, lotAwardsAmountCoverageSql, eligibleLegacyLotAwardAmountSql, allowParentAwardAmountFallbackSql } from '../../../lib/lot-status.js';
import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

function getSyncStats() {
  const db = getDb();
  const hasLotAwardsTable = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lot_awards' UNION SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'lot_awards' LIMIT 1"
  ).get());

  // lot_awards may be partial. Only use it for an expediente when it covers
  // every legacy lot that has a comparable awarded amount.
  const lotAwardsAmountCovered = hasLotAwardsTable
    ? lotAwardsAmountCoverageSql('contracts')
    : '0';

  const stats = db.prepare(`
    SELECT count(*) as total, 
           min(publication_date) as primera, 
           max(publication_date) as ultima,
           sum(CASE
             WHEN award_amount_type IS NULL OR award_amount_type IN ('total', 'desconocido')
             THEN CASE
               WHEN ${lotAwardsAmountCovered}
                 AND EXISTS (
                   SELECT 1
                   FROM lot_awards la
                   WHERE la.contract_id = contracts.id
                     AND la.awarded_amount IS NOT NULL
                     AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
                 )
               THEN (
                 SELECT round(sum(la.awarded_amount), 2)
                 FROM lot_awards la
                 WHERE la.contract_id = contracts.id
                   AND la.awarded_amount IS NOT NULL
                   AND ${eligibleAwardResultStateSql('la')}
                AND ${excludeAwardWhenLegacyLotTerminalSql('la')}
               )
               WHEN EXISTS (
                 SELECT 1
                 FROM contract_lots lot
                 WHERE lot.contract_id = contracts.id
                   AND lot.awarded_amount IS NOT NULL
                   AND ${eligibleAwardLotStatusSql('lot')}
               )
               THEN (
                 SELECT round(sum(lot.awarded_amount), 2)
                 FROM contract_lots lot
                 WHERE lot.contract_id = contracts.id
                   AND lot.awarded_amount IS NOT NULL
                   AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
               )
               ELSE CASE WHEN ${allowParentAwardAmountFallbackSql('contracts', hasLotAwardsTable)} THEN coalesce(awarded_amount, 0) ELSE 0 END
             END
             ELSE 0
           END) as volumen
    FROM contracts
  `).get() as any;

  const porOrgano = db.prepare(`
    SELECT o.placsp_id, o.name, o.name as nombre, count(*) as count, max(l.publication_date) as max_date
    FROM contracts l
    JOIN contracting_authorities o ON o.id = l.contracting_authority_id
    GROUP BY o.id
    ORDER BY count DESC
  `).all();

  return {
    totalContratos: stats.total,
    primeraPublicacion: stats.primera,
    ultimaActualizacion: stats.ultima,
    volumenTotalEuros: stats.volumen,
    volumenTotalMillones: Number((stats.volumen / 1e6).toFixed(2)),
    desglosePorOrgano: porOrgano,
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const data = getSyncStats();
    return NextResponse.json({
      success: true,
      fuenteOficial: 'Plataforma de Contratación del Sector Público (PLACSP)',
      ...data,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'La sincronización con PLACSP no está disponible mediante este endpoint. La ingesta debe ejecutarse mediante el proceso de sincronización del proyecto.',
    },
    { status: 501 },
  );
}

