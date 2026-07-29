import { calculateSalary, PAY_FREQUENCIES } from './calculator.js';

const form = document.getElementById('salary-form');
const results = document.getElementById('salary-results');
let currentResult;
let currentPeriod = 'monthly';

const money = (value, decimals = 0) => new Intl.NumberFormat('en-GB', {
  style:'currency', currency:'GBP', minimumFractionDigits:decimals, maximumFractionDigits:decimals,
}).format(Number(value) || 0);
const percent = value => `${(Number(value) || 0).toFixed(1)}%`;
const get = id => document.getElementById(id);

function readOptions() {
  return {
    salary:get('salary').value,
    bonus:get('bonus').value,
    region:get('region').value,
    taxCode:get('tax-code').value || '1257L',
    payFrequency:get('pay-frequency').value,
    studentLoanPlan:get('student-loan').value,
    postgraduateLoan:get('postgraduate-loan').checked,
    pensionAmount:get('pension-amount').value,
    pensionType:get('pension-type').value,
    pensionInput:get('pension-input').value,
    niCategory:get('no-ni').checked ? 'C' : 'A',
    weeklyHours:get('weekly-hours').value,
  };
}

function renderPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('[data-period]').forEach(button => {
    const active = button.dataset.period === period;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (!currentResult) return;
  const view = currentResult.views[period];
  const labels = {annual:'a year', monthly:'a month', weekly:'a week', daily:'a working day', hourly:'an hour'};
  get('take-home-value').textContent = money(view.takeHome, period === 'hourly' ? 2 : 0);
  get('take-home-period').textContent = labels[period];
  const decimals = period === 'hourly' ? 2 : 0;
  get('annual-tax').textContent = money(view.incomeTax, decimals);
  get('annual-ni').textContent = money(view.nationalInsurance, decimals);
  get('annual-other').textContent = money(view.studentLoan + view.postgraduateLoan + view.pensionFromPay, decimals);
  const rows = [
    ['Gross pay','gross',false], ['Income Tax','incomeTax',true], ['National Insurance','nationalInsurance',true],
    ['Student loan','studentLoan',true], ['Postgraduate loan','postgraduateLoan',true],
    ['Pension from pay','pensionFromPay',true], ['Take-home pay','takeHome',false],
  ];
  get('breakdown-body').innerHTML = rows
    .filter(([,key]) => !['studentLoan','postgraduateLoan','pensionFromPay'].includes(key) || currentResult.annual[key] > 0)
    .map(([label,key,deduction]) => `<tr class="${key === 'takeHome' ? 'total-row' : ''}"><th scope="row">${label}</th><td>${deduction ? '−' : ''}${money(view[key], decimals)}</td></tr>`).join('');
}

function renderPayday(result) {
  const panel = get('payday-panel');
  if (!result.paydays.bonus) { panel.hidden = true; return; }
  panel.hidden = false;
  const regular = result.paydays.regular;
  const bonus = result.paydays.bonus;
  get('payday-title').textContent = `${PAY_FREQUENCIES[result.frequency].label} payday comparison`;
  const row = (label, key, deduct = false) => `<tr><th scope="row">${label}</th><td>${deduct ? '−' : ''}${money(regular[key])}</td><td>${deduct ? '−' : ''}${money(bonus[key])}</td></tr>`;
  get('payday-body').innerHTML = [
    row('Gross pay','gross'), row('Income Tax','incomeTax',true), row('National Insurance','nationalInsurance',true),
    ...(result.annual.studentLoan ? [row('Student loan','studentLoan',true)] : []),
    ...(result.annual.postgraduateLoan ? [row('Postgraduate loan','postgraduateLoan',true)] : []),
    ...(result.annual.pensionFromPay ? [row('Pension from pay','pensionFromPay',true)] : []),
    row('Take-home pay','takeHome'),
  ].join('');
}

function render(result) {
  currentResult = result;
  const annual = result.annual;
  get('annual-gross').textContent = money(annual.gross);
  get('annual-tax').textContent = money(annual.incomeTax);
  get('annual-ni').textContent = money(annual.nationalInsurance);
  get('annual-other').textContent = money(annual.studentLoan + annual.postgraduateLoan + annual.pensionFromPay);
  get('effective-rate').textContent = percent(annual.gross ? annual.totalDeductions / annual.gross * 100 : 0);
  get('taxable-pay').textContent = money(annual.taxablePay);
  get('allowance').textContent = money(result.tax.personalAllowance);

  const pieces = [
    ['takehome', annual.takeHome], ['tax', annual.incomeTax], ['ni', annual.nationalInsurance],
    ['other', annual.studentLoan + annual.postgraduateLoan + annual.pensionFromPay],
  ];
  pieces.forEach(([name,value]) => get(`bar-${name}`).style.width = `${annual.gross ? value / annual.gross * 100 : 0}%`);

  get('tax-bands').innerHTML = result.tax.breakdown.length
    ? result.tax.breakdown.map(band => `<li><span><b>${Math.round(band.rate*100)}%</b> ${band.label}</span><span>${money(band.amount)} taxed · ${money(band.tax)} tax</span></li>`).join('')
    : '<li><span>No Income Tax calculated for this code.</span></li>';

  const warnings = [...result.warnings];
  if (result.annual.gross > 0 && result.annual.gross < 12570) warnings.push('Income below the standard Personal Allowance can still have deductions in unusual tax-code or payroll situations.');
  get('result-warnings').innerHTML = warnings.map(item => `<li>${item}</li>`).join('');
  get('warning-panel').hidden = warnings.length === 0;

  renderPayday(result);
  renderPeriod(currentPeriod);
  results.classList.add('ready');
  get('result-status').textContent = `Estimate calculated for ${money(annual.gross)} gross pay in tax year 2026/27.`;
}

function calculate(event) {
  if (event) event.preventDefault();
  const salary = Number(get('salary').value);
  const error = get('salary-error');
  if (!Number.isFinite(salary) || salary <= 0) {
    error.hidden = false;
    get('salary').focus();
    return;
  }
  error.hidden = true;
  render(calculateSalary(readOptions()));
  if (window.goatcounter?.count) window.goatcounter.count({path:'calc-salary', title:'Salary calculation', event:true});
}

form.addEventListener('submit', calculate);
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => renderPeriod(button.dataset.period)));
get('pension-type').addEventListener('change', event => {
  get('pension-fields').hidden = event.target.value === 'none';
});
get('region').addEventListener('change', event => {
  const code = get('tax-code');
  if (event.target.value === 'scotland' && code.value.toUpperCase() === '1257L') code.value = 'S1257L';
  if (event.target.value === 'rUK' && code.value.toUpperCase() === 'S1257L') code.value = '1257L';
});
form.addEventListener('reset', () => setTimeout(() => {
  get('pension-fields').hidden = true;
  currentPeriod = 'monthly';
  calculate();
}, 0));

calculate();
