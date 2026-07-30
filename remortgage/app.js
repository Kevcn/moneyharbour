import { calculateRemortgageBreakEven } from '/mortgage/phase2-calculators.js';

const gbp = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Math.abs(value));
const value = id => Number(document.getElementById(id).value || 0);
const calc = document.getElementById('calc');

calc.addEventListener('click',()=>{
  const options={
    balance:value('balance'), termYears:value('years'), currentRate:value('curRate'), newRate:value('newRate'),
    comparisonYears:value('comparisonYears'), productFee:value('productFee'), otherFees:value('otherFees'),
    cashback:value('cashback'), addFeeToLoan:document.getElementById('addFee').checked,
  };
  const error=document.getElementById('calcError');
  if(options.balance<1000||options.termYears<1||options.currentRate<=0||options.newRate<=0||options.comparisonYears<1){error.classList.add('show');return}
  error.classList.remove('show');
  const r=calculateRemortgageBreakEven(options);
  const monthlySaving=r.monthlyPaymentDifference;
  document.getElementById('resultLabel').textContent=monthlySaving>=0?'Estimated monthly payment reduction':'Estimated additional monthly payment';
  document.getElementById('monthly').textContent=`${monthlySaving<0?'−':''}${gbp(monthlySaving)}/mo`;
  document.getElementById('resultContext').textContent='payment difference before considering the balance repaid';
  document.getElementById('twoYear').textContent=`${r.netSavingOverPeriod<0?'−':''}${gbp(r.netSavingOverPeriod)}`;
  document.getElementById('fiveYear').textContent=r.breakEvenMonths===null?'Not within period':`${r.breakEvenMonths} months`;
  document.getElementById('curPay').textContent=gbp(r.currentMonthlyPayment);
  document.getElementById('newPay').textContent=gbp(r.newMonthlyPayment);
  document.getElementById('curPayBar').textContent=gbp(r.currentMonthlyPayment);
  document.getElementById('newPayBar').textContent=gbp(r.newMonthlyPayment);
  const max=Math.max(r.currentMonthlyPayment,r.newMonthlyPayment);
  document.getElementById('curBar').style.width=`${r.currentMonthlyPayment/max*100}%`;
  document.getElementById('newBar').style.width=`${r.newMonthlyPayment/max*100}%`;
  document.getElementById('rateField').value=`${options.currentRate}%`;
  document.getElementById('emptyResult').style.display='none';
  document.getElementById('results').classList.add('show');
  window.goatcounter?.count?.({path:'calc-remortgage',title:'Remortgage true-cost calculation',event:true});
});

document.querySelectorAll('.inputs-panel input').forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter')calc.click()}));
const form=document.getElementById('alertForm'),dest=['liyq1122','gmail.com'].join('@');
form.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(form);try{await fetch(`https://formsubmit.co/ajax/${dest}`,{method:'POST',headers:{Accept:'application/json'},body:data});document.getElementById('okMsg').style.display='block';form.querySelector('input[type=email]').value=''}catch(error){document.getElementById('okMsg').textContent='Something went wrong—please try again.';document.getElementById('okMsg').style.display='block'}});
