import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSalary,
  calculateIncomeTax,
  calculateNationalInsurance,
  calculateStudentLoan,
  parseTaxCode,
  TAX_YEAR,
} from '../salary-calculator/calculator.js';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);

const base = {
  salary: 50000,
  bonus: 0,
  region: 'rUK',
  taxCode: '1257L',
  payFrequency: 'monthly',
  studentLoanPlan: 'none',
  postgraduateLoan: false,
  pensionAmount: 0,
  pensionType: 'none',
  pensionInput: 'percent',
  niCategory: 'A',
  weeklyHours: 37.5,
};

test('publishes the 2026/27 tax year and official core thresholds', () => {
  assert.equal(TAX_YEAR.label, '2026/27');
  assert.equal(TAX_YEAR.personalAllowance, 12570);
  assert.equal(TAX_YEAR.ni.primary.monthly, 1048);
  assert.equal(TAX_YEAR.ni.upper.monthly, 4189);
  assert.equal(TAX_YEAR.studentLoans.plan1.annual, 26900);
  assert.equal(TAX_YEAR.studentLoans.plan2.annual, 29385);
  assert.equal(TAX_YEAR.studentLoans.plan4.annual, 33795);
  assert.equal(TAX_YEAR.studentLoans.plan5.annual, 25000);
});

test('parses standard, regional, special, K and emergency tax codes', () => {
  assert.deepEqual(parseTaxCode('1257L'), {normalized:'1257L', type:'allowance', allowance:12570, region:null, emergency:false});
  assert.equal(parseTaxCode('S1257L').region, 'scotland');
  assert.equal(parseTaxCode('C1257L').region, 'rUK');
  assert.equal(parseTaxCode('BR').flatRate, 0.20);
  assert.equal(parseTaxCode('SD1').flatRate, 0.42);
  assert.equal(parseTaxCode('NT').type, 'no-tax');
  assert.equal(parseTaxCode('K497').allowance, -4970);
  assert.equal(parseTaxCode('1257L M1').emergency, true);
});

test('calculates England/Wales/NI Income Tax at £50,000', () => {
  const result = calculateIncomeTax({income:50000, region:'rUK', taxCode:'1257L'});
  close(result.tax, 7486);
  close(result.personalAllowance, 12570);
});

test('tapers the standard Personal Allowance above £100,000', () => {
  close(calculateIncomeTax({income:110000, region:'rUK', taxCode:'1257L'}).personalAllowance, 7570);
  close(calculateIncomeTax({income:110000, region:'rUK', taxCode:'1257L'}).tax, 33432);
  close(calculateIncomeTax({income:125140, region:'rUK', taxCode:'1257L'}).personalAllowance, 0);
  close(calculateIncomeTax({income:125140, region:'rUK', taxCode:'1257L'}).tax, 42516);
});

test('matches the Scottish Government £31,136 comparison example', () => {
  const scot = calculateIncomeTax({income:31136, region:'scotland', taxCode:'S1257L'}).tax;
  const rest = calculateIncomeTax({income:31136, region:'rUK', taxCode:'1257L'}).tax;
  close(rest - scot, 23.57);
});

test('calculates employee Class 1 category A NI using pay-period thresholds', () => {
  const monthly = calculateNationalInsurance(50000/12, 'monthly', 'A');
  close(monthly, 249.493333);
  const exempt = calculateNationalInsurance(50000/12, 'monthly', 'C');
  close(exempt, 0);
});

test('matches HMRC monthly student-loan examples and rounds down to whole pounds', () => {
  assert.equal(calculateStudentLoan(2750, 'monthly', 'plan1'), 45);
  assert.equal(calculateStudentLoan(3000, 'monthly', 'plan4'), 16);
  assert.equal(calculateStudentLoan(2083, 'monthly', 'postgraduate'), 19);
});

test('models a one-off bonus in one payday for student-loan deductions', () => {
  const result = calculateSalary({...base, salary:24000, bonus:6000, studentLoanPlan:'plan5'});
  assert.equal(result.annual.studentLoan, 532);
  assert.equal(result.paydays.regular.studentLoan, 0);
  assert.equal(result.paydays.bonus.studentLoan, 532);
});

test('supports special flat-rate and no-tax tax codes', () => {
  close(calculateIncomeTax({income:50000, region:'rUK', taxCode:'BR'}).tax, 10000);
  close(calculateIncomeTax({income:50000, region:'rUK', taxCode:'D0'}).tax, 20000);
  close(calculateIncomeTax({income:50000, region:'rUK', taxCode:'D1'}).tax, 22500);
  close(calculateIncomeTax({income:50000, region:'rUK', taxCode:'NT'}).tax, 0);
  close(calculateIncomeTax({income:50000, region:'rUK', taxCode:'0T'}).tax, 12460);
});

test('discloses a fallback when a tax code is not recognised', () => {
  const result = calculateSalary({salary:50000, taxCode:'ABC'});
  assert.ok(result.warnings.some(warning => warning.includes('not recognised')));
  close(result.annual.incomeTax, 7486);
});

test('distinguishes net pay, salary sacrifice and relief-at-source pensions', () => {
  const netPay = calculateSalary({...base, pensionAmount:5, pensionType:'net-pay'});
  const sacrifice = calculateSalary({...base, pensionAmount:5, pensionType:'salary-sacrifice'});
  const ras = calculateSalary({...base, pensionAmount:5, pensionType:'relief-at-source'});
  close(netPay.annual.incomeTax, 6986);
  close(netPay.annual.nationalInsurance, 2993.88, 0.02);
  close(netPay.annual.takeHome, 37520.12, 0.02);
  close(sacrifice.annual.incomeTax, 6986);
  close(sacrifice.annual.nationalInsurance, 2793.96, 0.02);
  close(sacrifice.annual.takeHome, 37720.04, 0.02);
  close(ras.annual.incomeTax, 7486);
  close(ras.annual.pensionFromPay, 2000);
  close(ras.annual.takeHome, 37520.12, 0.02);
});

test('returns normalized annual and monthly result views', () => {
  const result = calculateSalary(base);
  close(result.annual.gross, 50000);
  close(result.annual.incomeTax, 7486);
  close(result.annual.nationalInsurance, 2993.88, 0.02);
  close(result.annual.takeHome, 39520.12, 0.02);
  close(result.views.monthly.takeHome, result.annual.takeHome/12);
  close(result.views.weekly.takeHome, result.annual.takeHome/52);
});
