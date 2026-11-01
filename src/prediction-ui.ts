import { modelRevenueScenario, type RevenueDay } from './prediction';
import { scenarioQuestion } from './scenario-question';
import { localReportingDate } from './reporting-weeks';
import { exportScenarioComparisons, type ScenarioComparison } from './scenario-export';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Deterministic what-if model. No predictive AI calls, inferred probabilities or hidden benchmarks. */
export function renderPredictionCalculator(container:HTMLElement,days:RevenueDay[],source:string,onAsk?:(draft:string)=>void){
  const comparisons:ScenarioComparison[]=[];
  let current:typeof comparisons[number]|null=null;
  const complete=days.filter(day=>{
    return day.date<localReportingDate();
  }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  container.innerHTML='<div class="prediction-head"><span class="section-index">SOREN / DECISION LAB</span><h3>Model a business decision.</h3><p>Explore what a revenue change could mean over a future period. These are <strong>user-defined scenarios</strong>, not statistically validated predictions.</p></div>'+
    '<div class="prediction-controls"><label>FORECAST HORIZON / DAYS<input type="number" id="predict-days" min="1" max="365" step="1" value="30"/></label>'+
    '<label>ASSUMED REVENUE CHANGE / %<input type="number" id="predict-change" min="-100" max="500" step="1" value="10"/></label>'+
    '<label>GROSS MARGIN / % (OPTIONAL)<input type="number" id="predict-margin" min="0" max="100" step="0.1" placeholder="Unknown"/></label></div>'+
    '<div class="prediction-results" aria-live="polite"></div>'+
    '<div class="scenario-actions"><label for="scenario-name">SCENARIO NAME<input id="scenario-name" maxlength="60" placeholder="For example: revised product mix"/></label><button type="button" class="reset-button" id="scenario-add" disabled>ADD TO COMPARISON</button>'+(onAsk?'<button type="button" class="reset-button" id="scenario-ask" disabled>ASK SOREN ABOUT THIS ↗</button>':'')+'</div>'+
    '<p class="prediction-note">Compare up to three assumptions side by side. Comparisons stay on this screen only; export them before leaving.</p>'+
    '<div class="scenario-comparisons" aria-live="polite"></div>';
  const output=container.querySelector<HTMLElement>('.prediction-results')!;
  const add=container.querySelector<HTMLButtonElement>('#scenario-add')!;
  const ask=container.querySelector<HTMLButtonElement>('#scenario-ask');
  ask?.addEventListener('click',()=>{
    if(!current||!onAsk)return;
    const name=container.querySelector<HTMLInputElement>('#scenario-name')!.value.trim();
    onAsk(scenarioQuestion({...current,name}));
  });
  const comparisonOutput=container.querySelector<HTMLElement>('.scenario-comparisons')!;
  const renderComparisons=()=>{
    add.disabled=!current||comparisons.length>=3;
    if(!comparisons.length){comparisonOutput.innerHTML='';return;}
    comparisonOutput.innerHTML='<h3>Compare your assumptions.</h3><button type="button" class="reset-button" id="scenario-export">EXPORT COMPARISON CSV ↓</button><div class="scenario-table-wrap"><table class="scenario-table"><caption>Each column uses the same recorded sales baseline. Different horizons cover different periods.</caption><thead><tr><th scope="col">MEASURE</th>'+
      comparisons.map((item,i)=>'<th scope="col">'+escape(item.name)+'<br/><button type="button" class="reset-button" data-remove-scenario="'+i+'" aria-label="Remove '+escape(item.name)+'">REMOVE</button></th>').join('')+'</tr></thead><tbody>'+
      [
        ['Future reporting days',comparisons.map(item=>String(item.horizon))],
        ['Assumed revenue change',comparisons.map(item=>item.change+'%')],
        ['Entered gross margin',comparisons.map(item=>item.margin===null?'Unknown':item.margin+'%')],
        ['Unchanged-baseline revenue',comparisons.map(item=>money(item.result.baselineRevenue))],
        ['Scenario revenue',comparisons.map(item=>money(item.result.scenarioRevenue))],
        ['Revenue difference',comparisons.map(item=>money(item.result.revenueDifference))],
        ['Modeled gross profit',comparisons.map(item=>item.result.scenarioGrossProfit===null?'Unknown':money(item.result.scenarioGrossProfit))]
      ].map(([label,values])=>'<tr><th scope="row">'+label+'</th>'+(values as string[]).map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div><p class="prediction-note">Gross profit is before operating expenses. These scenarios do not establish that a proposed decision will cause the entered revenue change.</p>';
    comparisonOutput.querySelector<HTMLButtonElement>('#scenario-export')!.addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([exportScenarioComparisons(comparisons,source)],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='soren-decision-lab.csv';
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    comparisonOutput.querySelectorAll<HTMLButtonElement>('[data-remove-scenario]').forEach(button=>button.addEventListener('click',()=>{
      comparisons.splice(Number(button.dataset.removeScenario),1);renderComparisons();
    }));
  };
  add.addEventListener('click',()=>{
    if(!current||comparisons.length>=3)return;
    const field=container.querySelector<HTMLInputElement>('#scenario-name')!;
    comparisons.push({...current,name:field.value.trim()||'Scenario '+(comparisons.length+1)});
    field.value='';renderComparisons();
  });
  const update=()=>{
    current=null;add.disabled=true;if(ask)ask.disabled=true;
    if(!complete.length){output.innerHTML='<p class="prediction-note">Import real daily sales before modeling a scenario. Missing sales history is not a zero-sales baseline.</p>';return;}
    const horizon=Number(container.querySelector<HTMLInputElement>('#predict-days')!.value);
    const changeField=container.querySelector<HTMLInputElement>('#predict-change')!.value.trim();
    const change=changeField===''?NaN:Number(changeField);
    const marginField=container.querySelector<HTMLInputElement>('#predict-margin')!.value.trim();
    const margin=marginField===''?null:Number(marginField);
    const result=modelRevenueScenario({days:complete,horizonDays:horizon,changePercent:change,grossMarginPercent:margin});
    if(!result){output.innerHTML='<p class="prediction-note">Check the entered assumptions. The horizon must be 1–365 days, change −100% to +500%, and margin 0–100%.</p>';return;}
    current={name:'',horizon,change,margin,result};add.disabled=comparisons.length>=3;if(ask)ask.disabled=false;
    output.innerHTML='<div class="prediction-grid"><div><span>RECORDED DAILY BASELINE</span><strong>'+money(result.baselinePerDay)+'</strong></div>'+
      '<div><span>UNCHANGED-BASELINE REVENUE</span><strong>'+money(result.baselineRevenue)+'</strong></div>'+
      '<div><span>SCENARIO REVENUE</span><strong>'+money(result.scenarioRevenue)+'</strong></div>'+
      '<div><span>SCENARIO DIFFERENCE</span><strong>'+money(result.revenueDifference)+'</strong></div></div>'+
      (result.scenarioGrossProfit===null?'':'<p class="prediction-margin">Modeled gross profit at your entered margin: <strong>'+money(result.scenarioGrossProfit)+'</strong> — before operating expenses.</p>')+
      '<p class="prediction-note">Based on '+result.recordedDays+' reported complete days from '+escape(result.startDate)+' to '+escape(result.endDate)+' ('+escape(source)+'). '+(result.calendarGaps?'There are '+result.calendarGaps+' unreported calendar dates; these are not assumed to be zero-sales days. ':'')+
      'Model: recorded average daily net sales × '+horizon+' future days × (1 + '+change+'% assumed change). The model assumes future reporting days resemble past reported days. It does not know future traffic, demand, closures, product mix or causal effects. No likelihood or confidence interval is implied.</p>';
  };
  container.querySelectorAll<HTMLInputElement>('.prediction-controls input').forEach(input=>input.addEventListener('input',update));
  update();
}

