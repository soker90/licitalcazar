'use strict';

const TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS = Object.freeze([
  'desiert',
  'desert',
  'anulad',
  'annul',
  'cancel',
  'renunci',
  'renounc',
  'desestimad',
  'rechaz',
  'reject',
  'desist',
  'retir',
  'withdraw',
]);

const DEFINITIVE_NO_AWARD_RESULT_STATE_PATTERNS = Object.freeze([
  'desiert',
  'desert',
  'anulad',
  'annul',
  'cancel',
  'renunci',
  'renounc',
  'withdrawn',
  'withdraw',
]);

function isEligibleAwardLotStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return !TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function eligibleAwardLotStatusSql(alias = '') {
  const column = alias ? `${alias}.lot_status` : 'lot_status';
  return `(${TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS
    .map((pattern) => `lower(coalesce(${column}, '')) NOT LIKE '%${pattern}%'`)
    .join(' AND ')})`;
}

function isEligibleAwardResultState(resultState) {
  const normalized = String(resultState ?? '').trim().toLowerCase();
  return normalized !== 'best_rated_tenderer' &&
    !normalized.includes('mejor valorado') &&
    !TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isTerminalNoAwardResultState(resultState) {
  const normalized = String(resultState ?? '').trim().toLowerCase();
  const otherTerminalPatterns = DEFINITIVE_NO_AWARD_RESULT_STATE_PATTERNS
    .filter((pattern) => pattern !== 'desiert' && pattern !== 'desert');
  if (otherTerminalPatterns.some((pattern) => normalized.includes(pattern))) return true;
  const isDeserted = normalized.includes('desiert') || normalized.includes('desert');
  return isDeserted && !normalized.includes('provisional');
}

function terminalNoAwardResultStateSql(alias = '') {
  const column = alias ? `${alias}.result_state` : 'result_state';
  const normalized = `lower(coalesce(${column}, ''))`;
  const otherTerminalPatterns = DEFINITIVE_NO_AWARD_RESULT_STATE_PATTERNS
    .filter((pattern) => pattern !== 'desiert' && pattern !== 'desert')
    .map((pattern) => `${normalized} LIKE '%${pattern}%'`)
    .join(' OR ');
  const nonProvisionalDesertion = `((${normalized} LIKE '%desiert%' OR ${normalized} LIKE '%desert%') AND ${normalized} NOT LIKE '%provisional%')`;
  return `(${otherTerminalPatterns} OR ${nonProvisionalDesertion})`;
}

function eligibleAwardResultStateSql(alias = '') {
  const column = alias ? `${alias}.result_state` : 'result_state';
  return `(upper(coalesce(${column}, '')) <> 'BEST_RATED_TENDERER'
    AND lower(coalesce(${column}, '')) NOT LIKE '%mejor valorado%'
    AND ${TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS
      .map((pattern) => `lower(coalesce(${column}, '')) NOT LIKE '%${pattern}%'`)
      .join(' AND ')})`;
}

function excludeAwardWhenLegacyLotTerminalSql(awardAlias) {
  return `NOT EXISTS (
    SELECT 1
    FROM contract_lots legacy_lot
    WHERE legacy_lot.contract_id = ${awardAlias}.contract_id
      AND legacy_lot.lot_number = ${awardAlias}.lot_number
      AND NOT ${eligibleAwardLotStatusSql('legacy_lot')}
  )`;
}

function lotAwardsAmountCoverageSql(contractAlias, lotAlias = 'lot', awardAlias = 'award', nullAwardAlias = 'award_null', amountColumn = 'awarded_amount') {
  return `(
    NOT EXISTS (
      SELECT 1
      FROM contract_lots ${lotAlias}
      WHERE ${lotAlias}.contract_id = ${contractAlias}.id
        AND ${eligibleAwardLotStatusSql(lotAlias)}
        AND NOT EXISTS (
          SELECT 1
          FROM lot_awards terminal_award
          WHERE terminal_award.contract_id = ${lotAlias}.contract_id
            AND terminal_award.lot_number = ${lotAlias}.lot_number
            AND ${terminalNoAwardResultStateSql('terminal_award')}
        )
        AND (
          NOT EXISTS (
            SELECT 1
            FROM lot_awards ${awardAlias}
            WHERE ${awardAlias}.contract_id = ${lotAlias}.contract_id
              AND ${awardAlias}.lot_number = ${lotAlias}.lot_number
              AND ${awardAlias}.${amountColumn} IS NOT NULL
              AND ${eligibleAwardResultStateSql(awardAlias)}
              AND ${excludeAwardWhenLegacyLotTerminalSql(awardAlias)}
          )
          OR EXISTS (
            SELECT 1
            FROM lot_awards ${nullAwardAlias}
            WHERE ${nullAwardAlias}.contract_id = ${lotAlias}.contract_id
              AND ${nullAwardAlias}.lot_number = ${lotAlias}.lot_number
              AND ${nullAwardAlias}.${amountColumn} IS NULL
              AND ${eligibleAwardResultStateSql(nullAwardAlias)}
              AND ${excludeAwardWhenLegacyLotTerminalSql(nullAwardAlias)}
              AND NOT EXISTS (
                SELECT 1
                FROM lot_awards terminal_award
                WHERE terminal_award.contract_id = ${nullAwardAlias}.contract_id
                  AND terminal_award.lot_number = ${nullAwardAlias}.lot_number
                  AND ${terminalNoAwardResultStateSql('terminal_award')}
              )
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM lot_awards ${nullAwardAlias}
      WHERE ${nullAwardAlias}.contract_id = ${contractAlias}.id
        AND ${nullAwardAlias}.${amountColumn} IS NULL
        AND ${eligibleAwardResultStateSql(nullAwardAlias)}
        AND ${excludeAwardWhenLegacyLotTerminalSql(nullAwardAlias)}
        AND NOT EXISTS (
          SELECT 1
          FROM lot_awards terminal_award
          WHERE terminal_award.contract_id = ${nullAwardAlias}.contract_id
            AND terminal_award.lot_number = ${nullAwardAlias}.lot_number
            AND ${terminalNoAwardResultStateSql('terminal_award')}
        )
    )
  )`;
}
function excludeLegacyLotWhenStructuredTerminalResultSql(legacyLotAlias, resultAlias = 'terminal_award') {
  return `NOT EXISTS (
    SELECT 1
    FROM lot_awards ${resultAlias}
    WHERE ${resultAlias}.contract_id = ${legacyLotAlias}.contract_id
      AND ${resultAlias}.lot_number = ${legacyLotAlias}.lot_number
      AND ${terminalNoAwardResultStateSql(resultAlias)}
  )`;
}

function eligibleLegacyLotAwardAmountSql(alias = 'lot', hasLotAwardsTable = true) {
  const lotStatusPredicate = eligibleAwardLotStatusSql(alias);
  if (!hasLotAwardsTable) return lotStatusPredicate;
  return `(${lotStatusPredicate} AND ${excludeLegacyLotWhenStructuredTerminalResultSql(alias)})`;
}

function allowParentAwardAmountFallbackSql(
  contractAlias = 'contracts',
  hasLotAwardsTable = true,
  hasContractLotsTable = true,
  resultAlias = 'terminal_award',
) {
  const predicates = [];
  if (hasLotAwardsTable) {
    predicates.push(`NOT EXISTS (
      SELECT 1
      FROM lot_awards ${resultAlias}
      WHERE ${resultAlias}.contract_id = ${contractAlias}.id
        AND ${terminalNoAwardResultStateSql(resultAlias)}
    )`);
  }
  if (hasLotAwardsTable && hasContractLotsTable) {
    predicates.push(`(
      NOT EXISTS (
        SELECT 1
        FROM lot_awards partial_award
        WHERE partial_award.contract_id = ${contractAlias}.id
          AND ${eligibleAwardResultStateSql('partial_award')}
          AND ${excludeAwardWhenLegacyLotTerminalSql('partial_award')}
      )
      OR ${lotAwardsAmountCoverageSql(contractAlias, 'coverage_lot', 'coverage_award', 'coverage_null_award')}
    )`);
  }
  if (hasContractLotsTable) {
    predicates.push(`NOT EXISTS (
      SELECT 1
      FROM contract_lots legacy_lot
      WHERE legacy_lot.contract_id = ${contractAlias}.id
        AND NOT ${eligibleAwardLotStatusSql('legacy_lot')}
    )`);
  }
  return predicates.length ? `(${predicates.join(' AND ')})` : '1';
}

function allowLegacyLotAwardFallbackSql(legacyLotAlias, awardAlias = 'award') {
  return `NOT EXISTS (
    SELECT 1
    FROM lot_awards ${awardAlias}
    WHERE ${awardAlias}.contract_id = ${legacyLotAlias}.contract_id
      AND ${awardAlias}.lot_number = ${legacyLotAlias}.lot_number
      AND (
        (
          ${awardAlias}.awardee IS NOT NULL
          AND trim(coalesce(${awardAlias}.awardee, '')) <> ''
          AND ${eligibleAwardResultStateSql(awardAlias)}
        )
        OR ${terminalNoAwardResultStateSql(awardAlias)}
      )
  )`;
}

module.exports = {
  TERMINAL_NO_AWARD_LOT_STATUS_PATTERNS,
  isEligibleAwardLotStatus,
  eligibleAwardLotStatusSql,
  isEligibleAwardResultState,
  eligibleAwardResultStateSql,
  isTerminalNoAwardResultState,
  terminalNoAwardResultStateSql,
  excludeAwardWhenLegacyLotTerminalSql,
  lotAwardsAmountCoverageSql,
  excludeLegacyLotWhenStructuredTerminalResultSql,
  eligibleLegacyLotAwardAmountSql,
  allowParentAwardAmountFallbackSql,
  allowLegacyLotAwardFallbackSql,
};
