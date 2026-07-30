import {
  calculateOverpayment, calculatePropertyTax, compareMortgageDeals,
  estimateAffordability, calculateFirstHomeCash,
} from './phase2-calculators.js';

const tool = document.body.dataset.tool;
const form = document.querySelector('[data-calculator-form]');
const gbp = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(value);
const num = id => Number(document.getElementById(id)?.value || 0);
const checked = id => Boolean(document.getElementById(id)?.checked);
const text = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
const yearsMonths = months => {
  const years=Math.floor(months/12), remainder=months%12;
  return [years ? `${years} ${years===1?'year':'years'}`:'', remainder ? `${remainder} ${remainder===1?'month':'months'}`:''].filter(Boolean).join(' ') || '0 months';
};
const track = name => window.goatcounter?.count?.({path:`calc-${name}`,title:`${name} calculation`,event:true});

function renderOverpayment(){
  const balance=num('balance'), lumpSum=num('lump');
  const lumpInput=document.getElementById('lump');
  lumpInput.setCustomValidity(lumpSum>balance?'Lump sum cannot exceed the mortgage balance.':'');
  if(!lumpInput.checkValidity()){lumpInput.reportValidity();return}
  const r=calculateOverpayment({balance,annualRate:num('rate'),yearsRemaining:num('years'),lumpSum,monthlyOverpayment:num('monthly-extra')});
  text('primary',gbp(r.interestSaved)); text('primary-label','Estimated interest saved');
  text('secondary',yearsMonths(r.monthsSaved)); text('new-payment',gbp(r.newMonthlyPayment));
  text('original-term',yearsMonths(r.baselineMonths)); text('new-term',yearsMonths(r.overpaymentMonths));
}

const jurisdictionNames={'england-ni':'SDLT','scotland':'LBTT','wales':'LTT'};
function renderTax(){
  const jurisdiction=document.getElementById('jurisdiction').value;
  const r=calculatePropertyTax({price:num('price'),jurisdiction,buyerType:document.getElementById('buyer-type').value,nonUkResident:checked('non-resident')});
  text('primary',gbp(r.tax)); text('primary-label',`Estimated ${jurisdictionNames[jurisdiction]}`);
  text('effective-rate',`${(r.tax/num('price')*100).toFixed(2)}%`);
  text('relief',r.reliefApplied?'Applied':'Not applied');
  document.getElementById('tax-breakdown').innerHTML=r.breakdown.map(row=>`<tr><th scope="row">${gbp(row.from)}–${row.to===Infinity?'above':gbp(row.to)}</th><td>${(row.rate*100).toFixed(1)}%</td><td>${gbp(row.amount)}</td></tr>`).join('');
  document.getElementById('non-resident-wrap').hidden=jurisdiction!=='england-ni';
}

function readDeal(prefix){return {rate:num(`${prefix}-rate`),productFee:num(`${prefix}-fee`),addFeeToLoan:checked(`${prefix}-add-fee`),otherFees:num(`${prefix}-other`),cashback:num(`${prefix}-cashback`)}}
function renderDeals(){
  const r=compareMortgageDeals({loanAmount:num('loan'),termYears:num('term'),comparisonYears:num('period'),dealA:readDeal('a'),dealB:readDeal('b')});
  text('primary',`Deal ${r.cheaperDeal}`); text('primary-label','Lower true cost over the comparison period'); text('saving',gbp(r.saving));
  for(const [prefix,deal] of [['a',r.dealA],['b',r.dealB]]){text(`${prefix}-payment`,gbp(deal.monthlyPayment));text(`${prefix}-cost`,gbp(deal.trueCost));text(`${prefix}-interest`,gbp(deal.interestPaid));text(`${prefix}-balance`,gbp(deal.remainingBalance))}
}

function renderAffordability(){
  const r=estimateAffordability({grossIncome:num('income'),deposit:num('deposit'),monthlyCommitments:num('commitments'),termYears:num('term'),illustrativeRate:num('rate')});
  text('primary',`${gbp(r.borrowingRange.low)}–${gbp(r.borrowingRange.high)}`); text('primary-label','Illustrative borrowing range before lender checks');
  text('purchase-range',`${gbp(r.purchasePriceRange.low)}–${gbp(r.purchasePriceRange.high)}`); text('monthly-payment',gbp(r.paymentAtHighEstimate)); text('stress-payment',gbp(r.stressPayment)); text('stress-rate',`${r.stressRate}%`); text('outgoings-share',`${r.stressOutgoingsShare}%`); text('stretch',gbp(r.borrowingRange.stretch));
}

function renderCash(){
  const r=calculateFirstHomeCash({propertyPrice:num('price'),deposit:num('deposit'),jurisdiction:document.getElementById('jurisdiction').value,nonUkResident:checked('non-resident'),conveyancing:num('conveyancing'),survey:num('survey'),mortgageFee:num('mortgage-fee'),moving:num('moving'),otherCosts:num('other')});
  text('primary',gbp(r.totalCashNeeded)); text('primary-label','Estimated total cash needed'); text('mortgage',gbp(r.mortgageAmount)); text('tax',gbp(r.propertyTax)); text('non-deposit',gbp(r.nonDepositCosts)); text('deposit-result',gbp(r.deposit));
}

const renderers={overpayment:renderOverpayment,tax:renderTax,deals:renderDeals,affordability:renderAffordability,cash:renderCash};
form?.addEventListener('submit',event=>{event.preventDefault();if(!form.checkValidity()){form.reportValidity();return}renderers[tool]?.();track(tool)});
if(tool==='tax'||tool==='cash')document.getElementById('jurisdiction')?.addEventListener('change',()=>{document.getElementById('non-resident-wrap').hidden=document.getElementById('jurisdiction').value!=='england-ni'});
if(form){renderers[tool]?.()}
