import { modelRevenueScenario, type RevenueDay } from './prediction';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Deterministic what-if model. No predictive AI calls, inferred probabilities or hidden benchmarks. */
export function renderPredictionCalculator(container:HTMLElement,days:RevenueDay[],source:string){
  const complete=days.filter(day=>{
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    return day.date!==today;
  }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  container.innerHTML='<div class="prediction-head"><span class="section-index">SOREN / DECISION LAB</span><h3>Model a business decision.</h3><p>Explore what a revenue change could mean over a future period. These are <strong>user-defined scenarios</strong>, not statistically validated predictions.</p></div>'+
    '<div class="prediction-controls"><label>FORECAST HORIZON / DAYS<input type="number" id="predict-days" min="1" max="365" step="1" value="30"/></label>'+
    '<label>ASSUMED REVENUE CHANGE / %<input type="number" id="predict-change" min="-100" max="500" step="1" value="10"/></label>'+
    '<label>GROSS MARGIN / % (OPTIONAL)<input type="number" id="predict-margin" min="0" max="100" step="0.1" placeholder="Unknown"/></label></div>'+
    '<div class="prediction-results" aria-live="polite"></div>';
  const output=container.querySelector<HTMLElement>('.prediction-results')!;
  const update=()=>{
    if(!complete.length){output.innerHTML='<p class="prediction-note">Import real daily sales before modeling a scenario. Missing sales history is not a zero-sales baseline.</p>';return;}
    const horizon=Number(container.querySelector<HTMLInputElement>('#predict-days')!.value);
    const change=Number(container.querySelector<HTMLInputElement>('#predict-change')!.value);
    const marginField=container.querySelector<HTMLInputElement>('#predict-margin')!.value.trim();
    const margin=marginField===''?null:Number(marginField);
    const result=modelRevenueScenario({days:complete,horizonDays:horizon,changePercent:change,grossMarginPercent:margin});
    if(!result){output.innerHTML='<p class="prediction-note">Check the entered assumptions. The horizon must be 1–365 days, change −100% to +500%, and margin 0–100%.</p>';return;}
    output.innerHTML='<div class="prediction-grid"><div><span>RECORDED DAILY BASELINE</span><strong>'+money(result.baselinePerDay)+'</strong></div>'+
      '<div><span>UNCHANGED-BASELINE REVENUE</span><strong>'+money(result.baselineRevenue)+'</strong></div>'+
      '<div><span>SCENARIO REVENUE</span><strong>'+money(result.scenarioRevenue)+'</strong></div>'+
      '<div><span>SCENARIO DIFFERENCE</span><strong>'+money(result.revenueDifference)+'</strong></div></div>'+
      (result.scenarioGrossProfit===null?'':'<p class="prediction-margin">Modeled gross profit at your entered margin: <strong>'+money(result.scenarioGrossProfit)+'</strong> — before operating expenses.</p>')+
      '<p class="prediction-note">Based on '+result.recordedDays+' reported complete days from '+escape(result.startDate)+' to '+escape(result.endDate)+' ('+escape(source)+'). '+(result.calendarGaps?'There are '+result.calendarGaps+' unreported calendar dates; these are not assumed to be zero-sales days. ':'')+
      'Model: recorded average daily net sales × '+horizon+' future days × (1 + '+change+'% assumed change). The model assumes future reporting days resemble past reported days. It does not know future traffic, demand, closures, product mix or causal effects. No likelihood or confidence interval is implied.</p>';
  };
  container.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.addEventListener('input',update));
  update();
}
