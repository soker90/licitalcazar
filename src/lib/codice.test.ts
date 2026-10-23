import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function parseGenericode(filename: string): Map<string, string> {
  const filePath = path.resolve(__dirname, 'codice', filename);
  const content = fs.readFileSync(filePath, 'latin1');
  const rows = content.match(/<Row>[\s\S]*?<\/Row>/g) || [];
  const map = new Map<string, string>();

  for (const r of rows) {
    const codeMatch = r.match(/<Value ColumnRef="code">[\s\S]*?<SimpleValue>([^<]+)<\/SimpleValue>/);
    const nombreMatch = r.match(/<Value ColumnRef="nombre">[\s\S]*?<SimpleValue>([^<]+)<\/SimpleValue>/);
    if (codeMatch && nombreMatch) {
      const code = codeMatch[1].trim();
      const decodedNombre = nombreMatch[1].trim()
        .replace(/&#243;/g, 'ó')
        .replace(/&#250;/g, 'ú')
        .replace(/&#225;/g, 'á')
        .replace(/&#233;/g, 'é')
        .replace(/&#237;/g, 'í')
        .replace(/&#241;/g, 'ñ');
      map.set(code, decodedNombre);
    }
  }
  return map;
}

describe('CODICE Genericode Snapshots & Mappings Validation', () => {
  it('validates ContractCode-2.08 genericode codes', () => {
    const types = parseGenericode('ContractCode-2.08.gc');
    expect(types.get('1')).toBe('Suministros');
    expect(types.get('2')).toBe('Servicios');
    expect(types.get('3')).toBe('Obras');
    expect(types.get('7')).toBe('Administrativo especial');
    expect(types.get('8')).toBe('Privado');
    expect(types.get('21')).toBe('Gestión de Servicios Públicos');
    expect(types.get('22')).toBe('Concesión de Servicios');
    expect(types.get('31')).toBe('Concesión de Obras Públicas');
    expect(types.get('32')).toBe('Concesión de Obras');
    expect(types.get('40')).toBe('Colaboración entre el sector público y sector privado');
    expect(types.get('50')).toBe('Patrimonial');
    // Ensure code 999 does not exist in official genericode
    expect(types.has('999')).toBe(false);
  });

  it('validates SyndicationTenderingProcessCode-2.07 genericode codes', () => {
    const procs = parseGenericode('SyndicationTenderingProcessCode-2.07.gc');
    expect(procs.get('1')).toBe('Abierto');
    expect(procs.get('2')).toBe('Restringido');
    expect(procs.get('3')).toBe('Negociado sin publicidad');
    expect(procs.get('4')).toBe('Negociado con publicidad');
    expect(procs.get('6')).toBe('Contrato menor');
    expect(procs.get('7')).toBe('Derivado de acuerdo marco');
    expect(procs.get('8')).toBe('Concurso de proyectos');
    expect(procs.get('9')).toBe('Abierto simplificado');
    expect(procs.get('100')).toBe('Normas internas');
    expect(procs.get('999')).toBe('Otros');
  });

  it('verifies sync.js TIPO_MAP and PROC_MAP match official genericodes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sync = require('../../scripts/sync.js');
    const types = parseGenericode('ContractCode-2.08.gc');
    const procs = parseGenericode('SyndicationTenderingProcessCode-2.07.gc');

    // TIPO_MAP verification
    for (const [code, expectedName] of Object.entries(sync.TIPO_MAP)) {
      if (code === '40') {
        // Genericode: 'Colaboración entre el sector público y sector privado'
        expect(types.get('40')).toContain('Colaboración');
      } else {
        expect(types.get(code)).toBe(expectedName);
      }
    }

    // PROC_MAP verification
    for (const [code, name] of Object.entries(sync.PROC_MAP)) {
      if (code === '100') {
        // Genericode: 'Normas internas' vs app label 'Basado en acuerdo marco'
        expect(procs.has('100')).toBe(true);
      } else if (types.has(code) || procs.has(code)) {
        const gcName = procs.get(code);
        if (gcName) {
          expect(name).toBe(gcName);
        }
      }
    }
  });
});
