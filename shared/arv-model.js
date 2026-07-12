(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PMHArv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function num(v, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function calculateArv(input) {
    const purchasePrice = num(input.purchasePrice);
    const units = Math.max(0, num(input.units));
    const rentMonthly = num(input.stabilizedRentMonthly);
    const otherIncomeMonthly = num(input.otherIncomeMonthly);
    const vacancyPct = num(input.stabilizedVacancyPct);
    const pmPct = num(input.managementPct);
    const repairsPct = num(input.repairsPct);
    const otherExpenseInput = num(input.otherExpenseInput);
    const otherExpenseMode = input.otherExpenseMode === 'monthly' ? 'monthly' : 'pct';
    const capexReserveInput = num(input.capexReserveInput);
    const capexReserveMode = input.capexReserveMode === 'unit' ? 'unit' : 'pct';
    const insuranceMonthly = num(input.insuranceMonthly);
    const utilitiesMonthly = num(input.utilitiesMonthly);
    const capRate = num(input.exitCapRatePct) / 100;
    const mills = num(input.mills);
    const clr = num(input.clr);
    const taxMethod = input.taxMethod || 'manual';
    const currentAssessedValue = num(input.currentAssessedValue);
    const manualTaxAnnual = num(input.manualStabilizedTaxAnnual);
    const valuationMethod = input.valuationMethod || 'income';
    const comparableArv = num(input.comparableArv);

    const rentGsiAnnual = rentMonthly * 12;
    const vacancyDeductionAnnual = rentGsiAnnual * vacancyPct / 100;
    const otherIncomeAnnual = otherIncomeMonthly * 12;
    const effectiveGrossIncomeAnnual = rentGsiAnnual - vacancyDeductionAnnual + otherIncomeAnnual;

    let propertyTaxAnnual = 0;
    let taxLabel = 'Manual stabilized tax input';
    if (taxMethod === 'current') {
      propertyTaxAnnual = currentAssessedValue * (mills / 1000);
      taxLabel = 'Current assessed taxes';
    } else if (taxMethod === 'reassessed') {
      propertyTaxAnnual = purchasePrice * clr * (mills / 1000);
      taxLabel = 'Estimated post-sale reassessed taxes';
    } else {
      propertyTaxAnnual = manualTaxAnnual;
    }

    const managementAnnual = effectiveGrossIncomeAnnual * pmPct / 100;
    const insuranceAnnual = insuranceMonthly * 12;
    const repairsAnnual = rentGsiAnnual * repairsPct / 100;
    const otherExpenseAnnual = otherExpenseMode === 'pct'
      ? rentGsiAnnual * otherExpenseInput / 100
      : otherExpenseInput * 12;
    const capexReserveAnnual = capexReserveMode === 'pct'
      ? (rentGsiAnnual + otherIncomeAnnual) * capexReserveInput / 100
      : units * capexReserveInput;
    const utilitiesAnnual = utilitiesMonthly * 12;

    const operatingExpensesAnnual =
      propertyTaxAnnual +
      insuranceAnnual +
      managementAnnual +
      repairsAnnual +
      otherExpenseAnnual +
      capexReserveAnnual +
      utilitiesAnnual;

    const stabilizedNoiAnnual = effectiveGrossIncomeAnnual - operatingExpensesAnnual;
    const incomeArv = capRate > 0 ? Math.max(0, stabilizedNoiAnnual / capRate) : 0;

    let finalArv = incomeArv;
    if (valuationMethod === 'comps') {
      finalArv = comparableArv;
    } else if (valuationMethod === 'conservative') {
      finalArv = comparableArv > 0 ? Math.min(incomeArv, comparableArv) : incomeArv;
    }

    const reassessedTaxAnnual = purchasePrice * clr * (mills / 1000);
    const priceLinkedTaxArvImpact = (taxMethod === 'reassessed' && capRate > 0)
      ? -(reassessedTaxAnnual / capRate)
      : 0;
    const priceLinkedTaxImpactPer25k = (taxMethod === 'reassessed' && capRate > 0)
      ? -((25000 * clr * (mills / 1000)) / capRate)
      : 0;

    return {
      valuationMethod: valuationMethod,
      taxMethod: taxMethod,
      taxLabel: taxLabel,
      rentGsiAnnual: rentGsiAnnual,
      vacancyDeductionAnnual: vacancyDeductionAnnual,
      otherIncomeAnnual: otherIncomeAnnual,
      effectiveGrossIncomeAnnual: effectiveGrossIncomeAnnual,
      expenses: {
        propertyTaxAnnual: propertyTaxAnnual,
        insuranceAnnual: insuranceAnnual,
        managementAnnual: managementAnnual,
        repairsAnnual: repairsAnnual,
        otherExpenseAnnual: otherExpenseAnnual,
        capexReserveAnnual: capexReserveAnnual,
        utilitiesAnnual: utilitiesAnnual
      },
      operatingExpensesAnnual: operatingExpensesAnnual,
      stabilizedNoiAnnual: stabilizedNoiAnnual,
      exitCapRate: capRate,
      incomeArv: incomeArv,
      comparableArv: comparableArv,
      finalArv: Math.max(0, finalArv),
      priceLinkedTaxArvImpact: priceLinkedTaxArvImpact,
      priceLinkedTaxImpactPer25k: priceLinkedTaxImpactPer25k
    };
  }

  return { calculateArv: calculateArv };
});
