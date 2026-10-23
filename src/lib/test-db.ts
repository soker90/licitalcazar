import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../../scripts/init-db.js';

const TYPES = ['Servicios', 'Suministros', 'Obras', 'Concesión de servicios'];
const PROCEDURES = ['Abierto', 'Abierto simplificado', 'Contrato menor', 'Negociado sin publicidad'];
const STATUSES = ['Publicada', 'Adjudicada', 'Formalizada', 'Resuelta', 'Desierta'];
const SCOPES = ['Directa Municipal', 'Indirecta (Mancomunidad)'];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)];
}

export function createGeneratedTestDb(seed = 20260924, count = 100): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  initDb(db);

  const random = rng(seed);
  const authorities = [
    ['generated-authority-1', 'Generated Authority 1', 'Directa Municipal'],
    ['generated-authority-2', 'Generated Authority 2', 'Indirecta (Mancomunidad)'],
  ] as const;
  const insertAuthority = db.prepare(
    'INSERT INTO contracting_authorities (id, name, scope, active) VALUES (?, ?, ?, 1)',
  );
  for (const authority of authorities) insertAuthority.run(...authority);

  const insert = db.prepare(`
    INSERT INTO contracts (
      id, contracting_authority_id, placsp_id, case_number, object_description,
      contracting_authority_name, contracting_authority_nif, contracting_authority_dir3,
      contracting_authority_city, department, contract_type, contract_type_code,
      procedure, procedure_code, procedure_source, economic_nature, status,
      amount_excl_vat, amount_incl_vat, estimated_value, awarded_amount,
      awarded_amount_incl_vat, awardee, awardee_nif, offer_count, is_sme,
      primary_cpv, location, duration, duration_unit, urgency, publication_date,
      award_date, formalization_date, source_url, dataset, year, scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < count; i++) {
    const id = `generated-${seed}-${i + 1}`;
    const year = 2018 + Math.floor(random() * 9);
    const amount = Math.round((500 + random() * 250000) * 100) / 100;
    const awarded = Math.round(amount * (0.55 + random() * 0.4) * 100) / 100;
    const type = pick(random, TYPES);
    const status = pick(random, STATUSES);
    const awardee = `Empresa Generada ${i + 1}`;
    const authorityId = i % 2 === 0 ? 'generated-authority-1' : 'generated-authority-2';

    insert.run(
      id, authorityId, `PLACSP-GEN-${i + 1}`, `GEN/${year}/${i + 1}`,
      `${type} generado ${i + 1}`, authorityId === 'generated-authority-1' ? 'Generated Authority 1' : 'Generated Authority 2',
      'P0000000A', null, 'Generated City', null, type, null,
      pick(random, PROCEDURES), null, 'generated-test', 'gasto', status,
      amount, Math.round(amount * 1.21 * 100) / 100, Math.round(amount * 1.15 * 100) / 100,
      awarded, Math.round(awarded * 1.21 * 100) / 100, awardee, `B${String(10000000 + i).slice(0, 8)}`,
      Math.floor(random() * 12) + 1, random() > 0.5 ? 1 : 0, '00000000',
      'Generated City', String(Math.floor(random() * 24) + 1), 'months', null,
      `${year}-${String(Math.floor(random() * 12) + 1).padStart(2, '0')}-15`,
      status === 'Adjudicada' || status === 'Formalizada' ? `${year}-12-01` : null,
      status === 'Formalizada' ? `${year}-12-15` : null,
      `https://example.test/contracts/${id}`, 'generated-test', year, pick(random, SCOPES)
    );
  }

  return db;
}
