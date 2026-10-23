import { describe, expect, it } from 'vitest';
import { CANDIDATE_SQL, downloadText, findEvidence } from './classify-award-amount-documents.js';

describe('classify-award-amount-documents candidate selection', () => {
  it('does not use an extreme reduction as a prerequisite for document review', () => {
    expect(CANDIDATE_SQL).not.toContain('awarded_amount / amount_excl_vat');
    expect(CANDIDATE_SQL).toContain("d.document_type IN ('PLIEGO', 'RESOLUCION', 'INFORME_TECNICO')");
    expect(CANDIDATE_SQL).toContain("c.award_amount_type = 'desconocido'");
  });

  it('recognizes explicit euro-per-hour notation without whitespace', () => {
    expect(findEvidence('La tarifa ofertada es de 42 €/hora, impuestos excluidos.')).toContain('42 €/hora');
    expect(findEvidence('El importe total anual es de 42.000 euros/año.')).toBeNull();
  });
});

describe('classify-award-amount-documents TLS', () => {
  it('does not disable TLS certificate verification when downloading PDFs', () => {
    const calls = [];
    const result = downloadText('https://example.test/document.pdf', 'tls-test', (command, args) => {
      calls.push({ command, args });
      throw new Error('forced curl failure');
    });

    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('curl');
    expect(calls[0].args).not.toContain('-k');
    expect(calls[0].args).toContain('--fail');
    expect(calls[0].args).toContain('https://example.test/document.pdf');
  });
});
