export type ReportingDay={date:string;revenue:number};
export const localReportingDate=(now=new Date())=>[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
/** Compare adjacent seven-calendar-day windows, never seven arbitrarily spaced records. */
export function compareReportingWeeks(days:ReportingDay[],today=localReportingDate()){
  const complete=days.filter(day=>day.date<today).sort((a,b)=>a.date.localeCompare(b.date));
  const last14=complete.slice(-14);
  if(last14.length!==14||last14.some((day,i)=>{
    const timestamp=Date.parse(day.date+'T00:00:00Z');
    return !/^\d{4}-\d{2}-\d{2}$/.test(day.date)||!Number.isFinite(timestamp)||
      new Date(timestamp).toISOString().slice(0,10)!==day.date||!Number.isFinite(day.revenue)||
      (i>0&&timestamp-Date.parse(last14[i-1].date+'T00:00:00Z')!==86400000);
  }))return null;
  const prior=last14.slice(0,7),recent=last14.slice(7);
  const sum=(list:ReportingDay[])=>list.reduce((total,day)=>total+day.revenue,0);
  const priorTotal=sum(prior),recentTotal=sum(recent);
  return {prior,recent,priorTotal,recentTotal,changePercent:priorTotal>0?(recentTotal/priorTotal-1)*100:null};
}
