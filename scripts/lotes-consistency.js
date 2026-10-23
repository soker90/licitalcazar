/**
 * Pure consistency checks for structured procurement lots.
 *
 * These checks are intentionally non-destructive: a mismatch can indicate
 * incomplete source data, a non-standard parent total, or a parsing error.
 */

const { isEligibleAwardLotStatus } = require('../src/lib/lot-status');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function validateLotConsistency(parent, lots, tolerance = 0.02) {
  const issues = [];
  const rows = Array.isArray(lots) ? lots : [];

  if (!rows.length) return { ok: true, issues };

  const lotState = (lot) => String(lot.estadoLote || lot.estado_lote || lot.lot_status || '').trim().toLowerCase();
  const hasAwardAmount = (lot) =>
    lot.importeAdjudicacion != null && Number.isFinite(Number(lot.importeAdjudicacion));
  const isDesertedLot = (lot) => {
    const state = lotState(lot);
    return state.includes('desiert') || state.includes('desert');
  };
  const isAnnulledLot = (lot) => {
    const state = lotState(lot);
    return ['anulad', 'annul', 'cancelad', 'cancel'].some((pattern) => state.includes(pattern));
  };
  const isNoAwardLot = (lot) => !isEligibleAwardLotStatus(lotState(lot));
  const awardedLots = rows.filter((lot) => hasAwardAmount(lot) && !isNoAwardLot(lot));

  const desertedWithAward = rows.filter((lot) =>
    isDesertedLot(lot) && hasAwardAmount(lot)
  );

  if (desertedWithAward.length > 0) {
    issues.push({
      code: 'DESERTED_LOT_HAS_AWARD',
      count: desertedWithAward.length,
      lots: desertedWithAward.map((lot) => String(lot.numeroLote ?? lot.numero_lote ?? '')),
    });
  }

  const annulledWithAward = rows.filter((lot) =>
    isAnnulledLot(lot) && hasAwardAmount(lot)
  );

  if (annulledWithAward.length > 0) {
    issues.push({
      code: 'ANNULLED_LOT_HAS_AWARD',
      count: annulledWithAward.length,
      lots: annulledWithAward.map((lot) => String(lot.numeroLote ?? lot.numero_lote ?? '')),
    });
  }

  const otherNoAwardLotsWithAward = rows.filter((lot) =>
    hasAwardAmount(lot) &&
    isNoAwardLot(lot) &&
    !isDesertedLot(lot) &&
    !isAnnulledLot(lot)
  );

  if (otherNoAwardLotsWithAward.length > 0) {
    issues.push({
      code: 'NO_AWARD_LOT_HAS_AWARD',
      count: otherNoAwardLotsWithAward.length,
      lots: otherNoAwardLotsWithAward.map((lot) => String(lot.numeroLote ?? lot.numero_lote ?? lot.lot_number ?? '')),
    });
  }

  const parentAward = parent?.importe_adjudicacion == null
    ? Number.NaN
    : Number(parent.importe_adjudicacion);
  if (Number.isFinite(parentAward) && parentAward >= 0 && awardedLots.length > 0) {
    const lotAward = roundMoney(
      awardedLots.reduce((sum, lot) => sum + Number(lot.importeAdjudicacion), 0)
    );
    if (Math.abs(roundMoney(parentAward) - lotAward) > tolerance) {
      issues.push({
        code: 'PARENT_AWARD_MISMATCH',
        parentAward: roundMoney(parentAward),
        lotsAward: lotAward,
      });
    }
  }

  // Only compare parent PBL when every lot has a structured PBL.
  const lotsWithPbl = rows.filter((lot) =>
    lot.presupuestoSinIva != null && Number.isFinite(Number(lot.presupuestoSinIva))
  );
  const parentPbl = parent?.importe_sin_iva == null
    ? Number.NaN
    : Number(parent.importe_sin_iva);
  if (
    Number.isFinite(parentPbl) &&
    parentPbl >= 0 &&
    lotsWithPbl.length === rows.length &&
    rows.length > 0
  ) {
    const lotPbl = roundMoney(
      lotsWithPbl.reduce((sum, lot) => sum + Number(lot.presupuestoSinIva), 0)
    );
    if (Math.abs(roundMoney(parentPbl) - lotPbl) > tolerance) {
      issues.push({
        code: 'PARENT_PBL_MISMATCH',
        parentPbl: roundMoney(parentPbl),
        lotsPbl: lotPbl,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

module.exports = { validateLotConsistency, roundMoney };
