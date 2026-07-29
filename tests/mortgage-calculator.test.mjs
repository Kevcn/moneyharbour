import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyPayment,
  calculateMortgage,
  nextLtvTarget,
  buildRateScenarios,
  buildTermComparisons,
  validateMortgageInputs,
} from '../mortgage/calculator.js';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);

test('calculates the monthly repayment using standard amortisation', () => {
  close(calculateMonthlyPayment(315000, 4.5, 25), 1750.87230558);
});

test('handles a zero-interest repayment mortgage', () => {
  close(calculateMonthlyPayment(315000, 0, 25), 1050);
});

test('calculates an interest-only monthly payment without repaying capital', () => {
  close(calculateMonthlyPayment(315000, 4.5, 25, 'interest-only'), 1181.25);
});

test('returns the complete repayment mortgage result', () => {
  const result = calculateMortgage({propertyPrice:350000, deposit:35000, annualRate:4.5, years:25});
  assert.equal(result.loanAmount, 315000);
  close(result.ltv, 90);
  close(result.depositPercentage, 10);
  close(result.monthlyPayment, 1750.87);
  close(result.totalRepaid, 525261);
  close(result.totalInterest, 210261);
});

test('identifies the next lower common LTV band and extra deposit needed', () => {
  assert.deepEqual(nextLtvTarget(350000, 35000), {
    currentLtv: 90,
    targetLtv: 85,
    targetDeposit: 52500,
    extraDeposit: 17500,
  });
});

test('builds lower, selected and higher interest-rate scenarios', () => {
  const scenarios = buildRateScenarios(315000, 4.5, 25);
  assert.deepEqual(scenarios.map(item => item.rate), [3.5, 4.5, 5.5, 6.5]);
  close(scenarios[1].monthlyPayment, 1750.87);
  close(scenarios[2].monthlyPayment, 1934.38);
  close(scenarios[3].monthlyPayment, 2126.90);
});

test('compares common mortgage terms including the selected term', () => {
  const comparisons = buildTermComparisons(315000, 4.5, 25);
  assert.deepEqual(comparisons.map(item => item.years), [15, 20, 25, 30, 35]);
  close(comparisons.find(item => item.years === 20).monthlyPayment, 1992.85);
  close(comparisons.find(item => item.years === 30).monthlyPayment, 1596.06);
  assert.equal(comparisons.find(item => item.years === 25).selected, true);
});

test('rejects a deposit that is not below the property price', () => {
  const result = validateMortgageInputs({propertyPrice:350000, deposit:350000, annualRate:4.5, years:25, mortgageType:'repayment'});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('Deposit')));
});
