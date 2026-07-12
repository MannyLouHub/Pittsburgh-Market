const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateArv } = require('../shared/arv-model.js');

function nearlyEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !== ${expected}`);
}

function base(overrides = {}) {
  return {
    purchasePrice: 175000,
    units: 2,
    stabilizedRentMonthly: 2250,
    stabilizedVacancyPct: 8,
    otherIncomeMonthly: 50,
    insuranceMonthly: 125,
    repairsPct: 10,
    otherExpenseMode: 'pct',
    otherExpenseInput: 0,
    capexReserveMode: 'pct',
    capexReserveInput: 5,
    utilitiesMonthly: 0,
    managementPct: 10,
    exitCapRatePct: 8,
    taxMethod: 'manual',
    currentAssessedValue: 87500,
    manualStabilizedTaxAnnual: 3800,
    clr: 0.5014,
    mills: 43.5382,
    ...overrides
  };
}

test('manual stabilized tax ARV is identical when only purchase price changes', () => {
  const values = [150000, 175000, 200000].map((purchasePrice) =>
    calculateArv(base({ purchasePrice })).finalArv
  );

  assert.equal(values[0], values[1]);
  assert.equal(values[1], values[2]);
});

test('current assessed tax ARV is identical when only purchase price changes', () => {
  const values = [150000, 175000, 200000].map((purchasePrice) =>
    calculateArv(base({ purchasePrice, taxMethod: 'current', currentAssessedValue: 87500 })).finalArv
  );

  assert.equal(values[0], values[1]);
  assert.equal(values[1], values[2]);
});

test('post-sale reassessed tax documents the purchase-price-only tax effect', () => {
  const values = [150000, 175000, 200000].map((purchasePrice) =>
    calculateArv(base({ purchasePrice, taxMethod: 'reassessed' }))
  );

  assert.ok(values[0].finalArv > values[1].finalArv);
  assert.ok(values[1].finalArv > values[2].finalArv);

  const expectedChangePer25k =
    -((25000 * base().clr * (base().mills / 1000)) / (base().exitCapRatePct / 100));
  nearlyEqual(values[1].priceLinkedTaxImpactPer25k, expectedChangePer25k);
  nearlyEqual(values[1].finalArv - values[0].finalArv, expectedChangePer25k);
  nearlyEqual(values[2].finalArv - values[1].finalArv, expectedChangePer25k);
});

test('higher stabilized NOI increases ARV', () => {
  const lower = calculateArv(base({ stabilizedRentMonthly: 2100 })).finalArv;
  const higher = calculateArv(base({ stabilizedRentMonthly: 2400 })).finalArv;

  assert.ok(higher > lower);
});

test('higher exit cap rate decreases ARV', () => {
  const lowerCap = calculateArv(base({ exitCapRatePct: 7 })).finalArv;
  const higherCap = calculateArv(base({ exitCapRatePct: 9 })).finalArv;

  assert.ok(higherCap < lowerCap);
});

test('operating expense percentage is calculated from EGI before debt service', () => {
  const valuation = calculateArv(base());

  nearlyEqual(
    valuation.operatingExpensePct,
    valuation.operatingExpensesAnnual / valuation.effectiveGrossIncomeAnnual * 100
  );
});

test('financing and rehab-financing terms do not change ARV', () => {
  const normal = calculateArv(base({
    loanAmount: 140000,
    downPaymentPct: 20,
    interestRatePct: 7.25,
    rehabFinanced: false,
    rehabLoanAmount: 0
  })).finalArv;

  const changedFinancing = calculateArv(base({
    loanAmount: 100000,
    downPaymentPct: 35,
    interestRatePct: 10.5,
    rehabFinanced: true,
    rehabLoanAmount: 25000,
    rehabInterestOnly: true
  })).finalArv;

  assert.equal(changedFinancing, normal);
});

test('manual ARV or asset-value override supersedes the automatic income value', () => {
  const automatic = calculateArv(base());
  const manual = calculateArv(base({ manualValue: 120000 }));

  assert.equal(manual.finalArv, 120000);
  assert.equal(manual.usesManualValue, true);
  assert.equal(manual.incomeArv, automatic.incomeArv);
});
