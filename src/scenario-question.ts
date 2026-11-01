import type {ScenarioComparison} from './scenario-export';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
/** A reviewable chat draft; opening it does not call the model. */
export function scenarioQuestion(item:ScenarioComparison):string{
  const r=item.result;
  const name=item.name.trim().slice(0,40)||'Business decision';
  return [
    'Review my what-if scenario "'+name+'".',
    'Baseline: '+r.recordedDays+' reported days, '+r.startDate+' to '+r.endDate+'; '+r.calendarGaps+' missing dates; '+money(r.baselinePerDay)+'/reported day.',
    'Assumptions: '+item.horizon+' future reporting days; '+item.change+'% revenue change; gross margin '+(item.margin===null?'unknown':item.margin+'%')+'.',
    'Modeled revenue '+money(r.scenarioRevenue)+' vs unchanged '+money(r.baselineRevenue)+'; gross profit '+(r.scenarioGrossProfit===null?'unknown':money(r.scenarioGrossProfit))+' before expenses.',
    'These are assumptions, not predictions or causal evidence. Challenge them and suggest a measurable test.'
  ].join('\n');
}
