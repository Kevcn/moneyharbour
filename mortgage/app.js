import {
  calculateMortgage,
  nextLtvTarget,
  buildRateScenarios,
  buildTermComparisons,
  validateMortgageInputs,
} from './calculator.js';

const form = document.getElementById('mortgage-form');
const priceInput = document.getElementById('property-price');
const depositInput = document.getElementById('deposit');
const depositPercentInput = document.getElementById('deposit-percent');
const errorBox = document.getElementById('mortgage-error');

const gbp = value => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(value);
const pct = value => `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

let syncingDeposit = false;

function syncDepositPercent() {
  if (syncingDeposit) return;
  syncingDeposit = true;
  const price = Number(priceInput.value);
  const deposit = Number(depositInput.value);
  depositPercentInput.value = price > 0 && deposit >= 0 ? (deposit / price * 100).toFixed(1) : '';
  syncingDeposit = false;
}

function syncDepositCash() {
  if (syncingDeposit) return;
  syncingDeposit = true;
  const price = Number(priceInput.value);
  const percentage = Number(depositPercentInput.value);
  depositInput.value = price > 0 && percentage >= 0 ? Math.round(price * percentage / 100) : '';
  syncingDeposit = false;
}

function readOptions() {
  return {
    propertyPrice: Number(priceInput.value),
    deposit: Number(depositInput.value),
    annualRate: Number(document.getElementById('interest-rate').value),
    years: Number(document.getElementById('mortgage-term').value),
    mortgageType: document.getElementById('mortgage-type').value,
  };
}

function renderRateScenarios(result) {
  const scenarios = buildRateScenarios(result.loanAmount, result.annualRate, result.years, result.mortgageType);
  document.getElementById('rate-scenarios').innerHTML = scenarios.map((item, index) => {
    const difference = item.monthlyPayment - result.monthlyPayment;
    const change = index === 1 ? 'Selected rate' : `${difference >= 0 ? '+' : '−'}${gbp(Math.abs(difference))}/mo`;
    return `<tr${index === 1 ? ' class="selected-row"' : ''}><th scope="row">${pct(item.rate)}</th><td>${gbp(item.monthlyPayment)}</td><td>${change}</td></tr>`;
  }).join('');
}

function renderTermComparisons(result) {
  const comparisons = buildTermComparisons(result.loanAmount, result.annualRate, result.years, result.mortgageType);
  document.getElementById('term-comparisons').innerHTML = comparisons.map(item =>
    `<tr${item.selected ? ' class="selected-row"' : ''}><th scope="row">${item.years} years${item.selected ? ' <span class="selected-label">Selected</span>' : ''}</th><td>${gbp(item.monthlyPayment)}</td><td>${gbp(item.totalInterest)}</td></tr>`
  ).join('');
}

function renderLtvGuidance(result) {
  const target = nextLtvTarget(result.propertyPrice, result.deposit);
  const band = document.getElementById('ltv-band-guidance');
  if (!target) {
    band.innerHTML = `<strong>Your LTV is already below the common 60% band.</strong><span>Further deposit still reduces the loan and interest, but may not unlock another commonly advertised LTV tier.</span>`;
    return;
  }
  band.innerHTML = `<strong>${gbp(target.extraDeposit)} more deposit would reach ${pct(target.targetLtv)} LTV.</strong><span>That would make your total deposit ${gbp(target.targetDeposit)}. LTV bands are common market reference points, but they do not guarantee a particular rate or approval.</span>`;
}

function render(options) {
  const validation = validateMortgageInputs(options);
  if (!validation.valid) {
    errorBox.textContent = validation.errors.join(' ');
    errorBox.hidden = false;
    return;
  }
  errorBox.hidden = true;
  const result = calculateMortgage(options);
  document.getElementById('monthly-payment').textContent = gbp(result.monthlyPayment);
  document.getElementById('payment-type-label').textContent = result.mortgageType === 'interest-only'
    ? 'estimated monthly interest payment'
    : 'estimated monthly repayment';
  document.getElementById('loan-amount').textContent = gbp(result.loanAmount);
  document.getElementById('ltv').textContent = pct(result.ltv);
  document.getElementById('total-interest').textContent = gbp(result.totalInterest);
  document.getElementById('total-repaid').textContent = gbp(result.totalRepaid);
  document.getElementById('capital-note').hidden = result.mortgageType !== 'interest-only';
  document.getElementById('result-status').textContent = `Estimated payment ${gbp(result.monthlyPayment)} a month, mortgage ${gbp(result.loanAmount)}, loan-to-value ${pct(result.ltv)}.`;
  renderRateScenarios(result);
  renderTermComparisons(result);
  renderLtvGuidance(result);
  document.getElementById('results-ready').hidden = false;
  document.getElementById('results-empty').hidden = true;
  if (window.goatcounter?.count) window.goatcounter.count({path:'calc-mortgage', title:'Mortgage calculation', event:true});
}

priceInput.addEventListener('input', syncDepositPercent);
depositInput.addEventListener('input', syncDepositPercent);
depositPercentInput.addEventListener('input', syncDepositCash);
form.addEventListener('submit', event => {
  event.preventDefault();
  render(readOptions());
});
form.addEventListener('reset', () => {
  window.setTimeout(() => {
    syncDepositPercent();
    render(readOptions());
  }, 0);
});

document.querySelectorAll('[data-track]').forEach(link => link.addEventListener('click', () => {
  if (window.goatcounter?.count) window.goatcounter.count({path:`mortgage-next-${link.dataset.track}`, title:`Mortgage next step: ${link.dataset.track}`, event:true});
}));

syncDepositPercent();
render(readOptions());
