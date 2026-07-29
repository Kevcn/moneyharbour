export const TAX_YEAR = Object.freeze({
  label: '2026/27',
  starts: '6 April 2026',
  ends: '5 April 2027',
  personalAllowance: 12570,
  allowanceTaperStarts: 100000,
  restOfUkBands: [
    {label:'Basic rate', width:37700, rate:0.20},
    {label:'Higher rate', width:87440, rate:0.40},
    {label:'Additional rate', width:Infinity, rate:0.45},
  ],
  scottishBands: [
    {label:'Starter rate', width:3967, rate:0.19},
    {label:'Basic rate', width:12989, rate:0.20},
    {label:'Intermediate rate', width:14136, rate:0.21},
    {label:'Higher rate', width:31338, rate:0.42},
    {label:'Advanced rate', width:62710, rate:0.45},
    {label:'Top rate', width:Infinity, rate:0.48},
  ],
  ni: {
    primary:{weekly:242, monthly:1048, annual:12570},
    upper:{weekly:967, monthly:4189, annual:50270},
    mainRate:0.08,
    upperRate:0.02,
  },
  studentLoans: {
    plan1:{label:'Plan 1', annual:26900, weekly:517.30, monthly:2241.66, rate:0.09},
    plan2:{label:'Plan 2', annual:29385, weekly:565.09, monthly:2448.75, rate:0.09},
    plan4:{label:'Plan 4', annual:33795, weekly:649.90, monthly:2816.25, rate:0.09},
    plan5:{label:'Plan 5', annual:25000, weekly:480.76, monthly:2083.33, rate:0.09},
    postgraduate:{label:'Postgraduate Loan', annual:21000, weekly:403.84, monthly:1750, rate:0.06},
  },
});

export const PAY_FREQUENCIES = Object.freeze({
  monthly:{label:'Monthly', periods:12, thresholdBasis:'monthly', multiplier:1},
  weekly:{label:'Weekly', periods:52, thresholdBasis:'weekly', multiplier:1},
  fortnightly:{label:'Every 2 weeks', periods:26, thresholdBasis:'weekly', multiplier:2},
  'four-weekly':{label:'Every 4 weeks', periods:13, thresholdBasis:'weekly', multiplier:4},
});

const roundMoney = n => Math.round((n + Number.EPSILON) * 100) / 100;
const cleanNumber = value => Math.max(0, Number(value) || 0);

export function parseTaxCode(value = '1257L') {
  let normalized = String(value || '1257L').toUpperCase().replace(/[–—-]/g, '').replace(/\s+/g, ' ').trim();
  const emergency = /(?:\s|^)(W1|M1|X|NONCUM)$/.test(normalized);
  normalized = normalized.replace(/\s?(W1|M1|X|NONCUM)$/, '').replace(/\s/g, '');

  const specialRates = {
    BR:0.20, CBR:0.20, SBR:0.20,
    D0:0.40, CD0:0.40, D1:0.45, CD1:0.45,
    SD0:0.21, SD1:0.42, SD2:0.45, SD3:0.48,
  };
  if (normalized === 'NT') return {normalized, type:'no-tax', region:null, emergency};
  if (Object.hasOwn(specialRates, normalized)) {
    return {normalized, type:'flat-rate', flatRate:specialRates[normalized], region:normalized.startsWith('S') ? 'scotland' : 'rUK', emergency};
  }

  let region = null;
  let body = normalized;
  if (body.startsWith('S')) { region = 'scotland'; body = body.slice(1); }
  else if (body.startsWith('C')) { region = 'rUK'; body = body.slice(1); }

  if (body === '0T') return {normalized, type:'allowance', allowance:0, region, emergency};
  const kMatch = body.match(/^K(\d+)$/);
  if (kMatch) return {normalized, type:'allowance', allowance:-Number(kMatch[1]) * 10, region, emergency};
  const allowanceMatch = body.match(/^(\d+)([LMNT])$/);
  if (allowanceMatch) return {normalized, type:'allowance', allowance:Number(allowanceMatch[1]) * 10, region, emergency};

  return {normalized:'1257L', type:'allowance', allowance:12570, region:null, emergency:false, invalidInput:true};
}

function taxFromBands(taxableIncome, bands) {
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;
  const breakdown = [];
  for (const band of bands) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, band.width);
    const bandTax = amount * band.rate;
    breakdown.push({label:band.label, rate:band.rate, amount:roundMoney(amount), tax:roundMoney(bandTax)});
    tax += bandTax;
    remaining -= amount;
  }
  return {tax:roundMoney(tax), breakdown};
}

export function calculateIncomeTax({income, region='rUK', taxCode='1257L'}) {
  const grossTaxableIncome = cleanNumber(income);
  const parsed = parseTaxCode(taxCode);
  const effectiveRegion = parsed.region || region;

  if (parsed.type === 'no-tax') {
    return {tax:0, personalAllowance:0, taxableIncome:0, breakdown:[], taxCode:parsed, region:effectiveRegion};
  }
  if (parsed.type === 'flat-rate') {
    return {
      tax:roundMoney(grossTaxableIncome * parsed.flatRate), personalAllowance:0,
      taxableIncome:grossTaxableIncome,
      breakdown:[{label:`${Math.round(parsed.flatRate*100)}% tax-code rate`, rate:parsed.flatRate, amount:grossTaxableIncome, tax:roundMoney(grossTaxableIncome*parsed.flatRate)}],
      taxCode:parsed, region:effectiveRegion,
    };
  }

  let allowance = parsed.allowance;
  const standardAllowanceCode = allowance === TAX_YEAR.personalAllowance && /1257L$/.test(parsed.normalized);
  if (standardAllowanceCode && grossTaxableIncome > TAX_YEAR.allowanceTaperStarts) {
    allowance = Math.max(0, allowance - (grossTaxableIncome - TAX_YEAR.allowanceTaperStarts) / 2);
  }
  const taxableIncome = Math.max(0, grossTaxableIncome - allowance);
  const bands = effectiveRegion === 'scotland' ? TAX_YEAR.scottishBands : TAX_YEAR.restOfUkBands;
  const bandResult = taxFromBands(taxableIncome, bands);
  const isKCode = allowance < 0;
  const tax = isKCode ? Math.min(bandResult.tax, grossTaxableIncome * 0.5) : bandResult.tax;
  return {
    tax:roundMoney(tax), personalAllowance:roundMoney(Math.max(0, allowance)),
    allowanceAdjustment:roundMoney(Math.min(0, allowance)), taxableIncome:roundMoney(taxableIncome),
    breakdown:bandResult.breakdown, taxCode:parsed, region:effectiveRegion,
  };
}

function periodThreshold(table, frequency) {
  const config = PAY_FREQUENCIES[frequency] || PAY_FREQUENCIES.monthly;
  return table[config.thresholdBasis] * config.multiplier;
}

export function calculateNationalInsurance(pay, frequency='monthly', category='A') {
  if (category === 'C') return 0;
  const earnings = cleanNumber(pay);
  const primary = periodThreshold(TAX_YEAR.ni.primary, frequency);
  const upper = periodThreshold(TAX_YEAR.ni.upper, frequency);
  const main = Math.max(0, Math.min(earnings, upper) - primary) * TAX_YEAR.ni.mainRate;
  const above = Math.max(0, earnings - upper) * TAX_YEAR.ni.upperRate;
  return roundMoney(main + above);
}

export function calculateStudentLoan(pay, frequency='monthly', plan='none') {
  if (!plan || plan === 'none' || !TAX_YEAR.studentLoans[plan]) return 0;
  const loan = TAX_YEAR.studentLoans[plan];
  const threshold = periodThreshold(loan, frequency);
  return Math.floor(Math.max(0, cleanNumber(pay) - threshold) * loan.rate);
}

function pensionContribution({gross, amount, input}) {
  if (!amount) return 0;
  return Math.min(gross, input === 'fixed' ? cleanNumber(amount) : gross * cleanNumber(amount) / 100);
}

function makeViews(annual, weeklyHours) {
  const divisors = {annual:1, monthly:12, 'four-weekly':13, fortnightly:26, weekly:52, daily:260, hourly:Math.max(1, cleanNumber(weeklyHours) || 37.5) * 52};
  return Object.fromEntries(Object.entries(divisors).map(([key, divisor]) => [key, Object.fromEntries(Object.entries(annual).filter(([,v]) => typeof v === 'number').map(([field, value]) => [field, roundMoney(value/divisor)]))]));
}

export function calculateSalary(options = {}) {
  const salary = cleanNumber(options.salary);
  const bonus = cleanNumber(options.bonus);
  const gross = salary + bonus;
  const frequency = PAY_FREQUENCIES[options.payFrequency] ? options.payFrequency : 'monthly';
  const periods = PAY_FREQUENCIES[frequency].periods;
  const pensionType = options.pensionType || 'none';
  const pensionGross = pensionType === 'none' ? 0 : pensionContribution({gross, amount:options.pensionAmount, input:options.pensionInput || 'percent'});
  const regularGross = salary / periods;
  const pensionRatio = gross > 0 ? pensionGross / gross : 0;
  const regularPensionGross = regularGross * pensionRatio;
  const bonusPayPensionGross = (regularGross + bonus) * pensionRatio;
  const pensionCashFactor = pensionType === 'relief-at-source' ? 0.8 : 1;
  const pensionFromPay = pensionGross * pensionCashFactor;

  const taxReducingPension = ['salary-sacrifice','net-pay'].includes(pensionType) ? pensionGross : 0;
  const niReducingPension = pensionType === 'salary-sacrifice' ? pensionGross : 0;
  const annualTaxablePay = Math.max(0, gross - taxReducingPension);
  const annualNiPay = Math.max(0, gross - niReducingPension);
  const taxResult = calculateIncomeTax({income:annualTaxablePay, region:options.region || 'rUK', taxCode:options.taxCode || '1257L'});

  const regularNiPay = Math.max(0, regularGross - (pensionType === 'salary-sacrifice' ? regularPensionGross : 0));
  const bonusNiPay = Math.max(0, regularGross + bonus - (pensionType === 'salary-sacrifice' ? bonusPayPensionGross : 0));
  const regularNI = calculateNationalInsurance(regularNiPay, frequency, options.niCategory || 'A');
  const bonusNI = calculateNationalInsurance(bonusNiPay, frequency, options.niCategory || 'A');
  const nationalInsurance = roundMoney(regularNI * (periods - (bonus > 0 ? 1 : 0)) + (bonus > 0 ? bonusNI : 0));

  const plan = options.studentLoanPlan || 'none';
  const regularLoan = calculateStudentLoan(regularNiPay, frequency, plan);
  const bonusLoan = calculateStudentLoan(bonusNiPay, frequency, plan);
  const regularPg = options.postgraduateLoan ? calculateStudentLoan(regularNiPay, frequency, 'postgraduate') : 0;
  const bonusPg = options.postgraduateLoan ? calculateStudentLoan(bonusNiPay, frequency, 'postgraduate') : 0;
  const studentLoan = regularLoan * (periods - (bonus > 0 ? 1 : 0)) + (bonus > 0 ? bonusLoan : 0);
  const postgraduateLoan = regularPg * (periods - (bonus > 0 ? 1 : 0)) + (bonus > 0 ? bonusPg : 0);

  const basePensionGross = regularPensionGross * periods;
  const baseTaxablePay = Math.max(0, salary - (['salary-sacrifice','net-pay'].includes(pensionType) ? basePensionGross : 0));
  const baseTax = calculateIncomeTax({income:baseTaxablePay, region:options.region || 'rUK', taxCode:options.taxCode || '1257L'}).tax;
  const regularTax = baseTax / periods;
  const bonusTax = bonus > 0 ? regularTax + Math.max(0, taxResult.tax - baseTax) : regularTax;
  const regularPensionFromPay = regularPensionGross * pensionCashFactor;
  const bonusPensionFromPay = bonusPayPensionGross * pensionCashFactor;

  const annual = {
    gross:roundMoney(gross), taxablePay:roundMoney(annualTaxablePay), niPay:roundMoney(annualNiPay),
    incomeTax:taxResult.tax, nationalInsurance, studentLoan, postgraduateLoan,
    pensionGross:roundMoney(pensionGross), pensionFromPay:roundMoney(pensionFromPay),
  };
  annual.totalDeductions = roundMoney(annual.incomeTax + annual.nationalInsurance + annual.studentLoan + annual.postgraduateLoan + annual.pensionFromPay);
  annual.takeHome = roundMoney(annual.gross - annual.totalDeductions);

  const payday = (pay, pension, tax, ni, loan, pg) => ({
    gross:roundMoney(pay), pensionFromPay:roundMoney(pension), incomeTax:roundMoney(tax),
    nationalInsurance:roundMoney(ni), studentLoan:loan, postgraduateLoan:pg,
    takeHome:roundMoney(pay - pension - tax - ni - loan - pg),
  });

  const warnings = [];
  if (taxResult.taxCode.invalidInput) warnings.push('The tax code was not recognised, so 1257L was used.');
  if (taxResult.taxCode.emergency) warnings.push('Emergency W1/M1/X codes are estimated on an annual cumulative basis; a real payslip may differ.');
  if (pensionType === 'relief-at-source') warnings.push('Relief at source shows the 20% provider top-up. Any extra higher-rate relief you claim separately is not added to take-home pay.');
  if (bonus > 0) warnings.push('The bonus is placed in one payday because National Insurance and student-loan deductions are calculated per pay period.');

  return {
    taxYear:TAX_YEAR.label, region:taxResult.region, frequency, periods,
    annual, views:makeViews(annual, options.weeklyHours),
    paydays:{
      regular:payday(regularGross, regularPensionFromPay, regularTax, regularNI, regularLoan, regularPg),
      bonus:bonus > 0 ? payday(regularGross + bonus, bonusPensionFromPay, bonusTax, bonusNI, bonusLoan, bonusPg) : null,
    },
    tax:taxResult,
    pension:{type:pensionType, gross:roundMoney(pensionGross), fromPay:roundMoney(pensionFromPay), providerRelief:roundMoney(pensionGross - pensionFromPay)},
    warnings,
  };
}
