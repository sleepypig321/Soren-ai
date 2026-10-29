export type RevenueDay={date:string;revenue:number};
export type RevenueScenarioInput={days:RevenueDay[];horizonDays:number;changePercent:number;grossMarginPercent?:number|null};
export type RevenueScenario={recordedDays:number;startDate:string;endDate:string;baselinePerDay:number;baselineRevenue:number;scenarioRevenue:number;revenueDifference:number;scenarioGrossProfit:number|null;calendarGaps:number};
export function modelRevenueScenario(input:RevenueScenarioInput):RevenueScenario|null{
  const {days,horizonDays,changePercent,grossMarginPercent}=input;
  if(!Array.isArray(days)||!Number.isInteger(horizonDays)||horizonDays<1||horizonDays>365||
    !Number.isFinite(changePercent)||changePercent< -100||changePercent>500||
    (grossMarginPercent!=null&&(!Number.isFinite(grossMarginPercent)||grossMarginPercent<0||grossMarginPercent>100)))return null;
  const ordered=[...days].sort((a,b)=>a.date.localeCompare(b.date));
  if(!ordered.length||ordered.length>10000||ordered.some(d=>!/^(?:19|20)\d\d-\d\d-\d\d$/.test(d.date)||!Number.isFinite(d.revenue)||d.revenue<0))return null;
  if(new Set(ordered.map(d=>d.date)).size!==ordered.length)return null;
  const start=Date.parse(ordered[0].date+'T00:00:00Z'),end=Date.parse(ordered.at(-1)!.date+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  const span=Math.round((end-start)/86400000)+1;
  const total=ordered.reduce((n,d)=>n+d.revenue,0);
  const average=total/ordered.length;
  const baseline=average*horizonDays;
  const scenario=baseline*(1+changePercent/100);
  return {recordedDays:ordered.length,startDate:ordered[0].date,endDate:ordered.at(-1)!.date,
    baselinePerDay:average,baselineRevenue:baseline,scenarioRevenue:scenario,
    revenueDifference:scenario-baseline,
    scenarioGrossProfit:grossMarginPercent==null?null:scenario*grossMarginPercent/100,
    calendarGaps:Math.max(0,span-ordered.length)};
}
