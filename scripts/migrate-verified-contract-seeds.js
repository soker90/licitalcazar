#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { getContractIdentityKey } = require('./contract-identity');
const { classifyAwardAmountType } = require('./award-amount');

const DB_PATH = path.resolve(__dirname, '../data/licitaciones_alcazar.db');
const SEEDS_PATH = path.resolve(__dirname, '../data/verified-contract-seeds.json');

function loadSeeds() {
  if (!fs.existsSync(SEEDS_PATH)) return [];
  const seeds = JSON.parse(fs.readFileSync(SEEDS_PATH, 'utf8'));
  if (!Array.isArray(seeds)) throw new Error('data/verified-contract-seeds.json debe contener un array');
  return seeds;
}

function migrateVerifiedContractSeeds(db) {
  const seeds = loadSeeds();
  if (!seeds.length) return 0;

  const columns = [
    'id','placsp_id','contracting_authority_id','case_number','object_description','contracting_authority_name',
    'contracting_authority_nif','contracting_authority_dir3','contracting_authority_city','department',
    'contract_type','contract_type_code','procedure','procedure_code','procedure_source',
    'economic_nature','status','amount_excl_vat','amount_incl_vat','estimated_value',
    'awarded_amount','awarded_amount_incl_vat','award_amount_type','awardee','awardee_nif','offer_count',
    'is_sme','primary_cpv','cpvs','location','nuts','duration','duration_unit','eu_funding',
    'urgency','deadline_date','award_date','formalization_date','publication_date',
    'updated_at','source_url','dataset','year','scope','is_lotized','lot_count','lots_source'
  ];

  const seedFields = {
    amount_excl_vat: 'importe_sin_iva',
    awarded_amount: 'importe_adjudicacion',
    awardee: 'adjudicatario',
    awardee_nif: 'nif_adjudicatario',
    contract_type: 'tipo_contrato',
    contract_type_code: 'tipo_codigo',
    procedure: 'procedimiento',
    procedure_code: 'procedimiento_codigo',
    dataset: 'conjunto',

    case_number: 'expediente',
    object_description: 'objeto',
    department: 'dependencia',
    procedure_source: 'procedimiento_procedencia',
    economic_nature: 'naturaleza_economica',
    status: 'estado',
    amount_incl_vat: 'importe_con_iva',
    estimated_value: 'valor_estimado',
    awarded_amount_incl_vat: 'importe_adj_con_iva',
    offer_count: 'num_ofertas',
    is_sme: 'es_pyme',
    primary_cpv: 'cpv_principal',
    location: 'ubicacion',
    duration: 'duracion',
    duration_unit: 'duracion_unidad',
    eu_funding: 'financiacion_ue',
    urgency: 'urgencia',
    deadline_date: 'fecha_limite',
    award_date: 'fecha_adjudicacion',
    formalization_date: 'fecha_formalizacion',
    publication_date: 'fecha_publicacion',
    updated_at: 'fecha_actualizacion',
    source_url: 'url',
    is_lotized: 'lotizado',
    lot_count: 'num_lotes',
    lots_source: 'lotes_origen',
  };

  const placeholders = columns.map(() => '?').join(', ');
  const updateColumns = columns
    .filter(c => !['id','case_number','contracting_authority_id'].includes(c))
    .map((c) => {
      if (c === 'updated_at') {
        return `updated_at = CASE
          WHEN contracts.updated_at IS NULL THEN excluded.updated_at
          WHEN excluded.updated_at IS NULL THEN contracts.updated_at
          WHEN excluded.updated_at >= contracts.updated_at THEN excluded.updated_at
          ELSE contracts.updated_at
        END`;
      }
      return `${c} = CASE
        WHEN contracts.updated_at IS NULL OR excluded.updated_at IS NULL OR excluded.updated_at >= contracts.updated_at
          THEN excluded.${c}
        ELSE contracts.${c}
      END`;
    }).join(', ');

  const stmt = db.prepare(`
    INSERT INTO contracts (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updateColumns}
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const seed of seeds) {
      if (!seed.expediente || !seed.contracting_authority_id || !seed.placsp_id) {
        throw new Error('Seed de contrato verificado sin case_number, contracting_authority_id o placsp_id');
      }
      const internalId = getContractIdentityKey(seed.expediente, seed.contracting_authority_id);
      const awardAmountType = classifyAwardAmountType({
        awardedAmount: seed.importe_adjudicacion,
        budgetAmount: seed.importe_sin_iva,
        objectDescription: seed.objeto,
        lotCount: seed.num_lotes || 1,
      });
      const values = columns.map(column => {
        if (column === 'id') return internalId;
        if (column === 'award_amount_type') return awardAmountType;
        if (column === 'economic_nature') return seed.naturaleza_economica || seed.economic_nature || 'gasto';
        const seedField = seedFields[column] || column;
        return seed[seedField] ?? null;
      });
      stmt.run(...values);
      count++;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return count;
}

if (require.main === module) {
  const db = new DatabaseSync(DB_PATH);
  try {
    console.log(`Contratos verificados sembrados: ${migrateVerifiedContractSeeds(db)}`);
  } finally {
    db.close();
  }
}

module.exports = { migrateVerifiedContractSeeds, loadSeeds };
