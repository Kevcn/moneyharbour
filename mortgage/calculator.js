const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateMonthlyPayment(principal, annualRate, years, mortgageType = 'repayment') {
  const loan = Number(principal);
  const months = Number(years) * 12;
  const monthlyRate = Number(annualRate) / 100 / 12;
  if (mortgageType === 'interest-only') return roundMoney(loan * monthlyRate);
  if (monthlyRate === 0) return roundMoney(loan / months);
  const growth = Math.pow(1 + monthlyRate, months);
  return roundMoney(loan * monthlyRate * growth / (growth - 1));
}

export function buildRateScenarios(principal, annualRate, years, mortgageType = 'repayment') {
  const selectedRate = Number(annualRate);
  return [Math.max(0, selectedRate - 1), selectedRate, selectedRate + 1, selectedRate + 2]
    .map(rate => ({
      rate: roundMoney(rate),
      monthlyPayment: calculateMonthlyPayment(principal, rate, years, mortgageType),
    }));
}

export function buildTermComparisons(principal, annualRate, selectedYears, mortgageType = 'repayment') {
  const selected = Number(selectedYears);
  const terms = [...new Set([15, 20, 25, 30, 35, selected])].sort((a, b) => a - b);
  return terms.map(years => {
    const monthlyPayment = calculateMonthlyPayment(principal, annualRate, years, mortgageType);
    const totalRepaid = roundMoney(monthlyPayment * years * 12 + (mortgageType === 'interest-only' ? Number(principal) : 0));
    return {
      years,
      selected: years === selected,
      monthlyPayment,
      totalInterest: roundMoney(totalRepaid - Number(principal)),
    };
  });
}

export function nextLtvTarget(propertyPrice, deposit) {
  const price = Number(propertyPrice);
  const cashDeposit = Number(deposit);
  const currentLtv = roundMoney((price - cashDeposit) / price * 100);
  const targetLtv = [95, 90, 85, 80, 75, 60].find(band => band < currentLtv);
  if (targetLtv === undefined) return null;
  const targetDeposit = roundMoney(price * (1 - targetLtv / 100));
  return {
    currentLtv,
    targetLtv,
    targetDeposit,
    extraDeposit: roundMoney(Math.max(0, targetDeposit - cashDeposit)),
  };
}

export function validateMortgageInputs(options = {}) {
  const price = Number(options.propertyPrice);
  const deposit = Number(options.deposit);
  const rate = Number(options.annualRate);
  const years = Number(options.years);
  const errors = [];
  if (!Number.isFinite(price) || price <= 0) errors.push('Enter a property price greater than £0.');
  if (!Number.isFinite(deposit) || deposit < 0) errors.push('Enter a deposit of £0 or more.');
  if (Number.isFinite(price) && Number.isFinite(deposit) && deposit >= price) errors.push('Deposit must be less than the property price.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 25) errors.push('Enter an interest rate between 0% and 25%.');
  if (!Number.isFinite(years) || years < 1 || years > 40) errors.push('Enter a mortgage term between 1 and 40 years.');
  if (!['repayment', 'interest-only'].includes(options.mortgageType || 'repayment')) errors.push('Choose repayment or interest-only.');
  return {valid: errors.length === 0, errors};
}

export function calculateMortgage(options = {}) {
  const propertyPrice = Number(options.propertyPrice);
  const deposit = Number(options.deposit);
  const annualRate = Number(options.annualRate);
  const years = Number(options.years);
  const mortgageType = options.mortgageType || 'repayment';
  const loanAmount = roundMoney(propertyPrice - deposit);
  const months = years * 12;
  const monthlyPayment = calculateMonthlyPayment(loanAmount, annualRate, years, mortgageType);
  const interestPayments = roundMoney(monthlyPayment * months);
  const totalRepaid = mortgageType === 'interest-only'
    ? roundMoney(interestPayments + loanAmount)
    : interestPayments;

  return {
    propertyPrice,
    deposit,
    loanAmount,
    annualRate,
    years,
    mortgageType,
    ltv: roundMoney(loanAmount / propertyPrice * 100),
    depositPercentage: roundMoney(deposit / propertyPrice * 100),
    monthlyPayment,
    totalRepaid,
    totalInterest: roundMoney(totalRepaid - loanAmount),
  };
}
