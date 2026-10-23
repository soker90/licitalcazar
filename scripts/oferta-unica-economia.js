function getOfertaUnicaEconomicAssessment(importeAdjudicacion, naturalezaEconomica, awardAmountType = 'total') {
  const imp = Number(importeAdjudicacion || 0);
  const importeComparable = awardAmountType == null || awardAmountType === 'total';
  if (!importeComparable) {
    return {
      superaUmbralGasto: false,
      severidad: 'MEDIA',
      scoreEscala: 3.2,
      factorEconomico: 'Importe de adjudicación no comparable; no aporta peso económico a esta señal',
      factorEconomicoScore: 0,
    };
  }
  const esGasto = naturalezaEconomica === 'gasto';
  const superaUmbralGasto = esGasto && imp >= 100000;

  return {
    superaUmbralGasto,
    severidad: superaUmbralGasto ? 'ALTA' : 'MEDIA',
    scoreEscala: esGasto
      ? (superaUmbralGasto
        ? Math.min(7.5, Math.round((5.3 + (imp / 400000)) * 10) / 10)
        : Math.min(4.8, Math.round((3.2 + (imp / 100000) * 1.2) * 10) / 10))
      : 3.2,
    factorEconomico: superaUmbralGasto
      ? 'Alto volumen económico (>100.000 € de gasto público)'
      : esGasto
        ? 'Importe de gasto estándar de licitación'
        : 'Importe de ingreso/canon; no aporta peso económico a esta señal',
    factorEconomicoScore: superaUmbralGasto ? 20 : esGasto ? 10 : 0,
  };
}

module.exports = {
  getOfertaUnicaEconomicAssessment,
};

