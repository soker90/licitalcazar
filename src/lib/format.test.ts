import { describe, it, expect } from 'vitest';
import { 
  formatCurrency, 
  formatNumber, 
  formatDecimal, 
  formatPercent, 
  formatDate, 
  formatCompactCurrency,
  formatNif,
  formatUrgencia 
} from './format';

describe('Format utilities', () => {
  describe('formatCurrency', () => {
    it('formatea importes de 4 dígitos con punto separador de miles y coma decimal', () => {
      const formatted = formatCurrency(6611.54);
      // Debe contener "6.611,54" y el símbolo "€"
      expect(formatted).toMatch(/6\.611,54\s*€/);
    });

    it('formatea importes de 5 dígitos enteros con separador de miles', () => {
      const formatted = formatCurrency(14960);
      expect(formatted).toMatch(/14\.960\s*€/);
    });

    it('devuelve guion para valores nulos o indefinidos', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency(NaN)).toBe('—');
    });
  });

  describe('formatNumber', () => {
    it('aplica agrupación de millares para números de 4 dígitos', () => {
      expect(formatNumber(6611)).toBe('6.611');
      expect(formatNumber(14960)).toBe('14.960');
    });

    it('maneja valores nulos devolviendo 0', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
      expect(formatNumber(NaN)).toBe('0');
    });
  });

  describe('formatPercent', () => {
    it('formatea porcentajes con coma decimal española y sufijo %', () => {
      expect(formatPercent(12.3, 1)).toBe('12,3%');
      expect(formatPercent(64, 1)).toBe('64,0%');
      expect(formatPercent(0, 1)).toBe('0,0%');
    });

    it('maneja valores vacíos', () => {
      expect(formatPercent(null)).toBe('0%');
    });
  });

  describe('formatDecimal', () => {
    it('formatea decimales con coma española y separador de miles', () => {
      expect(formatDecimal(3.2, 1)).toBe('3,2');
      expect(formatDecimal(1250.5, 1)).toBe('1.250,5');
    });
  });

  describe('formatCompactCurrency', () => {
    it('formatea millones con coma española', () => {
      const val = formatCompactCurrency(1500000);
      expect(val).toBe('1,5 M€');
    });

    it('formatea miles con k€', () => {
      const val = formatCompactCurrency(25000);
      expect(val).toBe('25 k€');
    });
  });

  describe('formatDate', () => {
    it('formatea fechas al estándar en español', () => {
      expect(formatDate('2025-05-15')).toContain('2025');
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
    });
  });

  describe('formatUrgencia', () => {
    it('traduce los códigos CODICE de tramitación a etiquetas legibles', () => {
      expect(formatUrgencia('1')).toBe('Ordinaria');
      expect(formatUrgencia('2')).toBe('Urgente');
      expect(formatUrgencia('3')).toBe('Emergencia');
    });

    it('conserva códigos desconocidos y usa Ordinaria si falta el dato', () => {
      expect(formatUrgencia('99')).toBe('99');
      expect(formatUrgencia(null)).toBe('Ordinaria');
      expect(formatUrgencia('')).toBe('Ordinaria');
    });
  });

  describe('formatNif', () => {
    it('normaliza a mayúsculas sin espacios para personas jurídicas (CIF)', () => {
      expect(formatNif(' b12345678 ')).toBe('B12345678');
      expect(formatNif('a82003815')).toBe('A82003815');
      expect(formatNif(null)).toBe('');
    });

    it('enmascara DNI de personas físicas mostrando únicamente cuatro dígitos conforme a DA 7ª LOPDGDD', () => {
      // DNI de 8 dígitos + letra
      const masked = formatNif('05678912A');
      expect(masked).toBe('***6789**');
      expect(masked).not.toContain('05678912A');
    });

    it('enmascara NIE de personas físicas mostrando cuatro dígitos', () => {
      // NIE que empieza por X, Y o Z
      const maskedNie = formatNif('X1234567B');
      expect(maskedNie).toBe('***2345**');
      expect(maskedNie).not.toContain('X1234567B');
    });

    it('respeta DNI que ya vengan previamente enmascarados desde PLACSP', () => {
      expect(formatNif('***4567**')).toBe('***4567**');
      expect(formatNif('***123*')).toBe('***123*');
    });
  });
});
