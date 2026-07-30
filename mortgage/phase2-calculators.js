const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

function progressiveTax(price, bands, surcharge = 0) {
  let lower = 0;
  let tax = 0;
  const breakdown = [];
  for (const band of bands) {
    if (price <= lower) break;
    const taxable = Math.min(price, band.upper) - lower;
    const rate = band.rate + surcharge;
    const amount = money(taxable * rate);
    breakdown.push({from:lower, to:band.upper, taxable:money(taxable), rate, amount});
    tax += amount;
    lower = band.upper;
  }
  return {tax:money(tax), breakdown};
}

export function calculatePropertyTax(options = {}) {
  const price = Number(options.price);
  const jurisdiction = options.jurisdiction || 'england-ni';
  const buyerType = options.buyerType || 'standard';
  const englandStandard = [
    {upper:125000, rate:0}, {upper:250000, rate:0.02}, {upper:925000, rate:0.05},
    {upper:1500000, rate:0.10}, {upper:Infinity, rate:0.12},
  ];
  const englandFirstTime = [{upper:300000, rate:0}, {upper:500000, rate:0.05}];
  const scotlandStandard = [
    {upper:145000, rate:0}, {upper:250000, rate:0.02}, {upper:325000, rate:0.05},
    {upper:750000, rate:0.10}, {upper:Infinity, rate:0.12},
  ];
  const scotlandFirstTime = [
    {upper:175000, rate:0}, {upper:250000, rate:0.02}, {upper:325000, rate:0.05},
    {upper:750000, rate:0.10}, {upper:Infinity, rate:0.12},
  ];
  const walesMain = [
    {upper:225000, rate:0}, {upper:400000, rate:0.06}, {upper:750000, rate:0.075},
    {upper:1500000, rate:0.10}, {upper:Infinity, rate:0.12},
  ];
  const walesHigher = [
    {upper:180000, rate:0.05}, {upper:250000, rate:0.085}, {upper:400000, rate:0.10},
    {upper:750000, rate:0.125}, {upper:1500000, rate:0.15}, {upper:Infinity, rate:0.17},
  ];

  let bands;
  let surcharge = 0;
  let reliefApplied = false;
  const additionalRatesApplied = buyerType === 'additional' && price >= 40000;
  if (jurisdiction === 'england-ni') {
    reliefApplied = buyerType === 'first-time' && price <= 500000;
    bands = reliefApplied ? englandFirstTime : englandStandard;
    surcharge = (additionalRatesApplied ? 0.05 : 0) + (options.nonUkResident ? 0.02 : 0);
  } else if (jurisdiction === 'scotland') {
    reliefApplied = buyerType === 'first-time';
    bands = reliefApplied ? scotlandFirstTime : scotlandStandard;
    surcharge = additionalRatesApplied ? 0.08 : 0;
  } else if (jurisdiction === 'wales') {
    bands = additionalRatesApplied ? walesHigher : walesMain;
  } else {
    throw new RangeError('Unsupported property-tax jurisdiction.');
  }
  return {jurisdiction, buyerType, reliefApplied, additionalRatesApplied, ...progressiveTax(price, bands, surcharge)};
}

export function calculateFirstHomeCash(options = {}) {
  const propertyPrice = Number(options.propertyPrice);
  const deposit = Number(options.deposit);
  const propertyTax = calculatePropertyTax({
    price:propertyPrice,
    jurisdiction:options.jurisdiction,
    buyerType:'first-time',
    nonUkResident:Boolean(options.nonUkResident),
  }).tax;
  const costs = {
    conveyancing:money(Number(options.conveyancing) || 0),
    survey:money(Number(options.survey) || 0),
    mortgageFee:money(Number(options.mortgageFee) || 0),
    moving:money(Number(options.moving) || 0),
    otherCosts:money(Number(options.otherCosts) || 0),
  };
  const nonDepositCosts = money(propertyTax + Object.values(costs).reduce((sum, value) => sum + value, 0));
  return {
    propertyPrice,
    deposit:money(deposit),
    mortgageAmount:money(propertyPrice - deposit),
    propertyTax,
    costs,
    nonDepositCosts,
    totalCashNeeded:money(deposit + nonDepositCosts),
  };
}

function rawMonthlyPayment(principal, annualRate, years) {
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  const growth = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * growth / (growth - 1);
}

function projectDeal(originalLoan, termYears, comparisonMonths, deal = {}) {
  const productFee = Number(deal.productFee) || 0;
  const startingBalance = originalLoan + (deal.addFeeToLoan ? productFee : 0);
  const monthlyPaymentRaw = rawMonthlyPayment(startingBalance, Number(deal.rate), termYears);
  const monthlyRate = Number(deal.rate) / 100 / 12;
  let remainingBalance = startingBalance;
  let interestPaid = 0;
  let payments = 0;
  for (let month = 0; month < comparisonMonths && remainingBalance > 0.005; month += 1) {
    const interest = remainingBalance * monthlyRate;
    const payment = Math.min(monthlyPaymentRaw, remainingBalance + interest);
    interestPaid += interest;
    payments += payment;
    remainingBalance = Math.max(0, remainingBalance + interest - payment);
  }
  const upfrontFees = (deal.addFeeToLoan ? 0 : productFee) + (Number(deal.otherFees) || 0);
  const cashback = Number(deal.cashback) || 0;
  return {
    monthlyPayment:money(monthlyPaymentRaw),
    payments:money(payments),
    interestPaid:money(interestPaid),
    remainingBalance:money(remainingBalance),
    upfrontFees:money(upfrontFees),
    cashback:money(cashback),
    trueCost:money(payments + upfrontFees - cashback + remainingBalance - originalLoan),
  };
}

export function compareMortgageDeals(options = {}) {
  const loanAmount = Number(options.loanAmount);
  const termYears = Number(options.termYears);
  const comparisonMonths = Number(options.comparisonYears) * 12;
  const dealA = projectDeal(loanAmount, termYears, comparisonMonths, options.dealA);
  const dealB = projectDeal(loanAmount, termYears, comparisonMonths, options.dealB);
  const cheaperDeal = dealA.trueCost <= dealB.trueCost ? 'A' : 'B';
  return {
    comparisonMonths,
    dealA,
    dealB,
    cheaperDeal,
    saving:money(Math.abs(dealA.trueCost - dealB.trueCost)),
  };
}

export function calculateRemortgageBreakEven(options = {}) {
  const balance = Number(options.balance);
  const termYears = Number(options.termYears);
  const comparisonMonths = Number(options.comparisonYears) * 12;
  const currentDeal = {rate:Number(options.currentRate)};
  const newDeal = {
    rate:Number(options.newRate),
    productFee:Number(options.productFee) || 0,
    addFeeToLoan:Boolean(options.addFeeToLoan),
    otherFees:Number(options.otherFees) || 0,
    cashback:Number(options.cashback) || 0,
  };
  let breakEvenMonths = null;
  for (let month = 1; month <= comparisonMonths; month += 1) {
    const current = projectDeal(balance, termYears, month, currentDeal);
    const replacement = projectDeal(balance, termYears, month, newDeal);
    if (current.trueCost >= replacement.trueCost) {
      breakEvenMonths = month;
      break;
    }
  }
  const current = projectDeal(balance, termYears, comparisonMonths, currentDeal);
  const replacement = projectDeal(balance, termYears, comparisonMonths, newDeal);
  return {
    currentMonthlyPayment:current.monthlyPayment,
    newMonthlyPayment:replacement.monthlyPayment,
    monthlyPaymentDifference:money(current.monthlyPayment - replacement.monthlyPayment),
    currentTrueCost:current.trueCost,
    newTrueCost:replacement.trueCost,
    netSavingOverPeriod:money(current.trueCost - replacement.trueCost),
    breakEvenMonths,
    comparisonMonths,
  };
}

export function estimateAffordability(options = {}) {
  const grossIncome = Number(options.grossIncome);
  const deposit = Math.max(0, Number(options.deposit) || 0);
  const monthlyCommitments = Math.max(0, Number(options.monthlyCommitments) || 0);
  const termYears = Number(options.termYears);
  const illustrativeRate = Number(options.illustrativeRate);
  const borrowingRange = {
    low:money(grossIncome * 4),
    high:money(grossIncome * 4.5),
    stretch:money(grossIncome * 5),
  };
  const paymentAtHighEstimate = rawMonthlyPayment(borrowingRange.high, illustrativeRate, termYears);
  const stressRate = illustrativeRate + 3;
  const stressPayment = rawMonthlyPayment(borrowingRange.high, stressRate, termYears);
  return {
    borrowingRange,
    purchasePriceRange:{low:money(borrowingRange.low + deposit), high:money(borrowingRange.high + deposit)},
    paymentAtHighEstimate:money(paymentAtHighEstimate),
    stressRate:money(stressRate),
    stressPayment:money(stressPayment),
    stressOutgoingsShare:money((stressPayment + monthlyCommitments) / (grossIncome / 12) * 100),
    monthlyCommitments:money(monthlyCommitments),
    isLenderDecision:false,
  };
}

function simulateRepayment(principal, annualRate, monthlyPayment, monthlyOverpayment = 0) {
  const monthlyRate = annualRate / 100 / 12;
  let balance = principal;
  let interest = 0;
  let months = 0;
  while (balance > 0.005 && months < 1200) {
    const monthlyInterest = balance * monthlyRate;
    interest += monthlyInterest;
    balance = Math.max(0, balance + monthlyInterest - monthlyPayment - monthlyOverpayment);
    months += 1;
  }
  return {months, interest: money(interest)};
}

export function calculateOverpayment(options = {}) {
  const balance = Number(options.balance);
  const annualRate = Number(options.annualRate);
  const yearsRemaining = Number(options.yearsRemaining);
  const lumpSum = Math.max(0, Number(options.lumpSum) || 0);
  const monthlyOverpayment = Math.max(0, Number(options.monthlyOverpayment) || 0);
  if (lumpSum > balance) throw new RangeError('Lump sum cannot exceed the mortgage balance.');
  const contractualPaymentRaw = rawMonthlyPayment(balance, annualRate, yearsRemaining);
  const baseline = simulateRepayment(balance, annualRate, contractualPaymentRaw);
  const reducedBalance = Math.max(0, balance - lumpSum);
  const overpayment = simulateRepayment(reducedBalance, annualRate, contractualPaymentRaw, monthlyOverpayment);
  return {
    contractualPayment: money(contractualPaymentRaw),
    newMonthlyPayment: money(contractualPaymentRaw + monthlyOverpayment),
    baselineMonths: baseline.months,
    overpaymentMonths: overpayment.months,
    monthsSaved: Math.max(0, baseline.months - overpayment.months),
    baselineInterest: baseline.interest,
    overpaymentInterest: overpayment.interest,
    interestSaved: money(baseline.interest - overpayment.interest),
    balanceAfterLumpSum: money(reducedBalance),
  };
}
