import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOverpayment,
  calculatePropertyTax,
  compareMortgageDeals,
  estimateAffordability,
  calculateFirstHomeCash,
  calculateRemortgageBreakEven,
} from '../mortgage/phase2-calculators.js';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);

test('calculates the time and interest saved by a lump sum and monthly overpayment', () => {
  const result = calculateOverpayment({
    balance: 200000,
    annualRate: 4,
    yearsRemaining: 25,
    lumpSum: 10000,
    monthlyOverpayment: 200,
  });
  close(result.contractualPayment, 1055.67);
  assert.equal(result.baselineMonths, 300);
  assert.equal(result.overpaymentMonths, 211);
  assert.equal(result.monthsSaved, 89);
  close(result.interestSaved, 41839.10, 0.02);
});

test('rejects an overpayment lump sum above the mortgage balance', () => {
  assert.throws(() => calculateOverpayment({
    balance:100000, annualRate:4, yearsRemaining:20, lumpSum:100001, monthlyOverpayment:0,
  }), /lump sum/i);
});

test('matches the official England and Northern Ireland SDLT examples and surcharges', () => {
  assert.equal(calculatePropertyTax({price:295000, jurisdiction:'england-ni'}).tax, 4750);
  assert.equal(calculatePropertyTax({price:500000, jurisdiction:'england-ni', buyerType:'first-time'}).tax, 10000);
  assert.equal(calculatePropertyTax({price:295000, jurisdiction:'england-ni', buyerType:'additional'}).tax, 19500);
  assert.equal(calculatePropertyTax({price:295000, jurisdiction:'england-ni', nonUkResident:true}).tax, 10650);
});

test('calculates Scottish LBTT, first-time buyer relief and the 8% ADS', () => {
  assert.equal(calculatePropertyTax({price:350000, jurisdiction:'scotland'}).tax, 8350);
  assert.equal(calculatePropertyTax({price:350000, jurisdiction:'scotland', buyerType:'first-time'}).tax, 7750);
  assert.equal(calculatePropertyTax({price:350000, jurisdiction:'scotland', buyerType:'additional'}).tax, 36350);
});

test('matches Welsh main and official higher-rate LTT examples', () => {
  assert.equal(calculatePropertyTax({price:280000, jurisdiction:'wales'}).tax, 3300);
  assert.equal(calculatePropertyTax({price:260000, jurisdiction:'wales', buyerType:'additional'}).tax, 15950);
  assert.equal(calculatePropertyTax({price:280000, jurisdiction:'wales', buyerType:'first-time'}).tax, 3300);
});

test('does not apply additional-property rates below the £40,000 threshold', () => {
  assert.equal(calculatePropertyTax({price:39999, jurisdiction:'england-ni', buyerType:'additional'}).tax, 0);
  assert.equal(calculatePropertyTax({price:39999, jurisdiction:'scotland', buyerType:'additional'}).tax, 0);
  assert.equal(calculatePropertyTax({price:39999, jurisdiction:'wales', buyerType:'additional'}).tax, 0);
});

test('compares mortgage deals by fees, interest and balance remaining', () => {
  const result = compareMortgageDeals({
    loanAmount:250000, termYears:25, comparisonYears:2,
    dealA:{rate:4, productFee:999, addFeeToLoan:true, otherFees:0, cashback:0},
    dealB:{rate:4.3, productFee:0, addFeeToLoan:false, otherFees:0, cashback:0},
  });
  close(result.dealA.monthlyPayment, 1324.87);
  close(result.dealA.trueCost, 20618.60);
  close(result.dealB.trueCost, 21027.27);
  assert.equal(result.cheaperDeal, 'A');
  close(result.saving, 408.67);
});

test('estimates an income-multiple range and rate stress scenario without presenting lender approval', () => {
  const result = estimateAffordability({
    grossIncome:80000, deposit:40000, monthlyCommitments:500,
    termYears:25, illustrativeRate:4.5,
  });
  assert.deepEqual(result.borrowingRange, {low:320000, high:360000, stretch:400000});
  assert.deepEqual(result.purchasePriceRange, {low:360000, high:400000});
  close(result.paymentAtHighEstimate, 2001.00);
  close(result.stressPayment, 2660.37);
  close(result.stressOutgoingsShare, 47.41);
  assert.equal(result.isLenderDecision, false);
});

test('adds deposit, first-time buyer tax and transaction costs into total cash needed', () => {
  const result = calculateFirstHomeCash({
    propertyPrice:400000, deposit:40000, jurisdiction:'england-ni',
    conveyancing:2000, survey:600, mortgageFee:999, moving:1000, otherCosts:0,
  });
  assert.equal(result.propertyTax, 5000);
  assert.equal(result.nonDepositCosts, 9599);
  assert.equal(result.totalCashNeeded, 49599);
  assert.equal(result.mortgageAmount, 360000);
});

test('finds remortgage break-even using fees, interest and balance remaining', () => {
  const result = calculateRemortgageBreakEven({
    balance:200000, termYears:20, currentRate:6, newRate:4.5, comparisonYears:2,
    productFee:0, otherFees:2000, cashback:0, addFeeToLoan:false,
  });
  close(result.currentMonthlyPayment, 1432.86);
  close(result.newMonthlyPayment, 1265.30);
  close(result.monthlyPaymentDifference, 167.56);
  assert.equal(result.breakEvenMonths, 9);
  close(result.netSavingOverPeriod, 3928.45);
});
