import type { RevenueScenario } from './prediction';

export type ScenarioComparison={name:string;horizon:number;change:number;margin:number|null;result:RevenueScenario};
const csvCell=(value:string|number|null)=>{
  const text=value===null?'Unknown':String(value);
  // Prevent user-controlled labels from becoming formulas in spreadsheet apps.
  const safe=/^[\s]*[=+\-@]/.test(text)&&typeof value==='string'?"'"+text:text;
  return '"'+safe.replace(/"/g,'""')+'"';
};
export function exportScenarioComparisons(items:ScenarioComparison[],source:string):string{
  const rows:(string|number|null)[][]=[
    ['Scenario','Source','Baseline start','Baseline end','Recorded days','Unreported dates','Future reporting days','Assumed revenue change (%)','Entered gross margin (%)','Recorded daily baseline','Unchanged-baseline revenue','Scenario revenue','Revenue difference','Modeled gross profit before operating expenses','Model limitation'],
    ...items.map(item=>[item.name,source,item.result.startDate,item.result.endDate,item.result.recordedDays,item.result.calendarGaps,item.horizon,item.change,item.margin,item.result.baselinePerDay,item.result.baselineRevenue,item.result.scenarioRevenue,item.result.revenueDifference,item.result.scenarioGrossProfit,'User-defined arithmetic scenario; not a validated prediction or proof of causation.'])
  ];
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
