const {
  eligibleAwardLotStatusSql,
  eligibleAwardResultStateSql,
  excludeAwardWhenLegacyLotTerminalSql,
  lotAwardsAmountCoverageSql,
  eligibleLegacyLotAwardAmountSql,
  allowParentAwardAmountFallbackSql,
} = require('../src/lib/lot-status.js');

function buildAwardedVolumeSql(contractAlias = 'contracts', hasLotAwardsTable = true, hasContractLotsTable = true, hasLotizedColumn = true) {
  const lotizedPredicate = hasLotizedColumn ? `${contractAlias}.is_lotized = 1` : '1 = 1';
  const structuredAwardBranch = hasLotAwardsTable && hasContractLotsTable
    ? `
      WHEN ${lotizedPredicate}
        AND ${lotAwardsAmountCoverageSql(contractAlias)}
        AND EXISTS (
          SELECT 1
          FROM lot_awards award
          WHERE award.contract_id = ${contractAlias}.id
            AND award.awarded_amount IS NOT NULL
            AND ${eligibleAwardResultStateSql('award')}
            AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
        )
      THEN (
        SELECT round(sum(award.awarded_amount), 2)
        FROM lot_awards award
        WHERE award.contract_id = ${contractAlias}.id
          AND award.awarded_amount IS NOT NULL
          AND ${eligibleAwardResultStateSql('award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('award')}
      )
    `
    : '';

  const legacyLotBranch = hasContractLotsTable
    ? `
      WHEN ${lotizedPredicate}
        AND EXISTS (
          SELECT 1
          FROM contract_lots lot
          WHERE lot.contract_id = ${contractAlias}.id
            AND lot.awarded_amount IS NOT NULL
            AND ${eligibleAwardLotStatusSql('lot')}
        )
      THEN (
        SELECT round(sum(lot.awarded_amount), 2)
        FROM contract_lots lot
        WHERE lot.contract_id = ${contractAlias}.id
          AND lot.awarded_amount IS NOT NULL
          AND ${eligibleLegacyLotAwardAmountSql('lot', hasLotAwardsTable)}
      )
    `
    : '';

  if (!structuredAwardBranch && !legacyLotBranch) {
    return `CASE
      WHEN ${allowParentAwardAmountFallbackSql(contractAlias, hasLotAwardsTable, hasContractLotsTable)}
      THEN coalesce(${contractAlias}.awarded_amount, 0)
      ELSE 0
    END`;
  }

  return `CASE
    ${structuredAwardBranch}
    ${legacyLotBranch}
    ELSE CASE
      WHEN ${allowParentAwardAmountFallbackSql(contractAlias, hasLotAwardsTable, hasContractLotsTable)}
      THEN coalesce(${contractAlias}.awarded_amount, 0)
      ELSE 0
    END
  END`;
}

function buildAwardAmountEligibilitySql(contractAlias = 'contracts') {
  return `(${contractAlias}.award_amount_type IS NULL OR ${contractAlias}.award_amount_type IN ('total', 'desconocido'))`;
}

module.exports = { buildAwardedVolumeSql, buildAwardAmountEligibilitySql };
