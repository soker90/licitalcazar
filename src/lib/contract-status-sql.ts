import {
  eligibleAwardLotStatusSql,
  eligibleAwardResultStateSql,
  excludeAwardWhenLegacyLotTerminalSql,
  excludeLegacyLotWhenStructuredTerminalResultSql,
} from './lot-status.js';

const DESERTED_CONTRACT_STATUS_PATTERNS = Object.freeze([
  'desiert',
  'desert',
]);

const CANCELED_CONTRACT_STATUS_PATTERNS = Object.freeze([
  'anulad',
  'annul',
  'cancel',
  'renuncia',
  'renounc',
  'desist',
  'desestimad',
  'withdraw',
]);

function statusPatternsSql(alias: string, patterns: readonly string[]): string {
  const column = alias ? `${alias}.status` : 'status';
  return `(${patterns
    .map((pattern) => `lower(coalesce(${column}, '')) LIKE '%${pattern}%'`)
    .join(' OR ')})`;
}

export function desertedContractStatusSql(alias = 'contracts'): string {
  return statusPatternsSql(alias, DESERTED_CONTRACT_STATUS_PATTERNS);
}

export function canceledContractStatusSql(alias = 'contracts'): string {
  return statusPatternsSql(alias, CANCELED_CONTRACT_STATUS_PATTERNS);
}

export function inCourseContractStatusSql(alias = 'contracts'): string {
  const column = alias ? `${alias}.status` : 'status';
  const normalized = `lower(trim(coalesce(${column}, '')))`;
  return `(
    ${normalized} LIKE 'publicad%'
    OR ${normalized} LIKE 'published%'
    OR ${normalized} LIKE 'publish%'
    OR ${normalized} LIKE 'en evaluaci%'
    OR ${normalized} LIKE 'en evaluacion%'
    OR ${normalized} LIKE 'under evaluation%'
    OR ${normalized} LIKE 'in evaluation%'
  )`;
}

export function explicitlyAwardedContractStatusSql(alias = 'contracts'): string {
  const column = alias ? `${alias}.status` : 'status';
  const normalized = `lower(trim(coalesce(${column}, '')))`;
  return `(${normalized} LIKE 'adjudicad%' OR ${normalized} LIKE 'formaliz%' OR ${normalized} LIKE 'awarded%')`;
}


export function resolvedContractStatusSql(alias = 'contracts'): string {
  const column = alias ? `${alias}.status` : 'status';
  const normalized = `lower(trim(coalesce(${column}, '')))`;
  return `(${normalized} = 'resuelta' OR ${normalized} LIKE 'resuelta %' OR ${normalized} = 'resolved' OR ${normalized} LIKE 'resolved %')`;
}

type ResolvedUnawardedOptions = {
  hasLotAwardsTable?: boolean;
  hasContractLotsTable?: boolean;
};

export function resolvedUnawardedContractSql(
  alias = 'contracts',
  options: ResolvedUnawardedOptions = {},
): string {
  const offerCount = alias ? `${alias}.offer_count` : 'offer_count';
  const awardee = alias ? `${alias}.awardee` : 'awardee';
  const contractId = alias ? `${alias}.id` : 'id';
  const hasLotAwardsTable = options.hasLotAwardsTable ?? true;
  const hasContractLotsTable = options.hasContractLotsTable ?? true;
  const validAwardPredicates: string[] = [];

  if (hasLotAwardsTable) {
    const legacyLotGuard = hasContractLotsTable
      ? `AND ${excludeAwardWhenLegacyLotTerminalSql('award')}`
      : '';
    validAwardPredicates.push(`NOT EXISTS (
      SELECT 1
      FROM lot_awards award
      WHERE award.contract_id = ${contractId}
        AND ${eligibleAwardResultStateSql('award')}
        ${legacyLotGuard}
        AND (
          trim(coalesce(award.awardee, '')) <> ''
          OR award.awarded_amount IS NOT NULL
        )
    )`);
  }

  if (hasContractLotsTable) {
    const structuredResultGuard = hasLotAwardsTable
      ? `AND ${excludeLegacyLotWhenStructuredTerminalResultSql('lot')}`
      : '';
    validAwardPredicates.push(`NOT EXISTS (
      SELECT 1
      FROM contract_lots lot
      WHERE lot.contract_id = ${contractId}
        AND ${eligibleAwardLotStatusSql('lot')}
        ${structuredResultGuard}
        AND lot.awarded_amount IS NOT NULL
    )`);
  }

  const noStructuredAwards = validAwardPredicates.length
    ? ` AND ${validAwardPredicates.join(' AND ')}`
    : '';
  return `(${resolvedContractStatusSql(alias)}
    AND (${offerCount} = 0 OR ${awardee} IS NULL OR trim(${awardee}) = '')
    ${noStructuredAwards})`;
}

export function terminalContractStatusSql(
  alias = 'contracts',
  options: ResolvedUnawardedOptions = {},
): string {
  return `(${desertedContractStatusSql(alias)} OR ${canceledContractStatusSql(alias)} OR ${resolvedUnawardedContractSql(alias, options)})`;
}

export function flowContractStatusSql(
  alias = 'contracts',
  options: ResolvedUnawardedOptions = {},
): string {
  const awardee = alias ? `${alias}.awardee` : 'awardee';
  return `CASE
    WHEN ${canceledContractStatusSql(alias)} THEN 'anulada'
    WHEN ${desertedContractStatusSql(alias)}
      OR ${resolvedUnawardedContractSql(alias, options)}
    THEN 'desierta'
    WHEN ${explicitlyAwardedContractStatusSql(alias)} THEN 'adjudicada'
    WHEN ${inCourseContractStatusSql(alias)} THEN 'en_curso'
    WHEN trim(coalesce(${awardee}, '')) <> '' THEN 'adjudicada'
    ELSE 'desierta'
  END`;
}
