import { normalizeColumns, splitCsv, type FieldSpec } from './column-map';
import { loadCloudImport, saveCloudImport, removeCloudImport, canSyncImports } from './import-sync';
type Day={date:string;net:number;gross:number|null;discount:number|null};
type CloverReport={days:Day[];reportedNet:number;period:string;fileName:string;verifiedTotal?:boolean};
type ArchiveEntry={id:string;uploadedAt:string;report:CloverReport};
let current:CloverReport|null=null;
let history:ArchiveEntry[]=[];
let scope='';
let enteredCogs='';
let dataRevision=0;
let openPanes=new Set<string>(['investigator']);
const storageKey=(id:string)=>'soren:clover-daily:v1:'+id;
function validReport(report:CloverReport|undefined,maxRows=366):report is CloverReport{
  return !!report&&Array.isArray(report.days)&&report.days.length>0&&report.days.length<=maxRows&&
    Number.isFinite(report.reportedNet)&&report.days.every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.date)&&Number.isFinite(day.net)&&
      (day.gross===null||Number.isFinite(day.gross))&&(day.discount===null||Number.isFinite(day.discount)))&&
    Math.abs(report.days.reduce((n,day)=>n+day.net,0)-report.reportedNet)<=.02;
}
function combineReports(entries:ArchiveEntry[]):CloverReport|null{
  if(!entries.length)return null;
  const merged=new Map<string,Day>();
  for(const entry of entries)for(const day of entry.report.days)merged.set(day.date,day);
  const days=[...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
  return {days,reportedNet:sum(days),period:days[0].date+' through '+days.at(-1)!.date,
    fileName:entries.length===1?entries[0].report.fileName:entries.length+' saved Clover reports',verifiedTotal:false};
}
function readSaved(id:string):{report:CloverReport;cogs:string;history:ArchiveEntry[]}|null{
  try{
    const raw=localStorage.getItem(storageKey(id));if(!raw)return null;
    return normalizeSaved(JSON.parse(raw));
  }catch{return null;}
}
function normalizeSaved(payload:unknown):{report:CloverReport;cogs:string;history:ArchiveEntry[]}|null{
  const value=payload as {report?:CloverReport;cogs?:string;history?:ArchiveEntry[]}|null;
  if(!value||!validReport(value.report,10000))return null;
  const loaded=Array.isArray(value.history)&&value.history.length<=100&&value.history.every(entry=>
    entry&&typeof entry.id==='string'&&typeof entry.uploadedAt==='string'&&validReport(entry.report))
    ?value.history:[{id:'legacy',uploadedAt:'Previously imported',report:value.report}];
  const report=combineReports(loaded);
  if(!report)return null;
  const cogs=typeof value.cogs==='string'&&(/^(?:|\d+(?:\.\d+)?)$/.test(value.cogs))&&Number(value.cogs||'0')<=1e9?value.cogs:'';
  return {report,cogs,history:loaded};
}
function saveCurrent():boolean{
  if(!scope||scope.startsWith('signed-out:'))return false;
  try{
    if(current)localStorage.setItem(storageKey(scope),JSON.stringify({report:current,cogs:enteredCogs,history}));
    else localStorage.removeItem(storageKey(scope));
    return true;
  }catch{return false;}
}
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const sum=(d:Day[])=>d.reduce((a,b)=>a+b.net,0);
function readCSV(raw:string):string[][]{
  const rows:string[][]=[];let row:string[]=[];let cell='';let quote=false;
  for(let i=0;i<raw.length;i++){const ch=raw[i];if(ch==='"'){if(quote&&raw[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
  else if(ch===','&&!quote){row.push(cell);cell='';}
  else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&raw[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))rows.push(row);row=[];}
  else cell+=ch;}
  if(quote)throw Error('CSV has an unclosed quoted field.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
function parseAmount(value:string):number {
  const n=Number(value.trim().replace(/[$,\s"]/g,'').replace(/^\((.*)\)$/,'-$1'));
  if(!value.trim()||!Number.isFinite(n))throw Error('Expected a currency amount but found '+value.slice(0,35));
  return n;
}
function parse(raw:string,fileName:string):CloverReport{
  const rows=readCSV(raw);
  if(rows[0]?.[0]?.replace(/^\uFEFF/,'').trim()!=='Sales Report')throw Error('This is not a Clover daily Sales Report export. Export Reports → Sales Report, Daily view.');
  const period=rows[1]?.[0]||'';
  const header=rows.find(r=>r[0]?.trim()===''&&r[1]==='Total'&&r.slice(2).some(x=>/^[A-Z][a-z]{2} \d{1,2}$/.test(x)));
  if(!header)throw Error('No daily date columns found. Switch Clover to Daily view before exporting.');
  const count=header.length-2;
  if(count<1||count>366)throw Error('Expected 1–366 calendar days.');
  const firstYear=Number((period.match(/\b(20\d{2})\b/)||[])[1]);
  if(!Number.isInteger(firstYear))throw Error('Could not determine the report year.');
  const dates:string[]=[];let year=firstYear;let prevMonth=-1;
  for(const label of header.slice(2)){
    const match=label.match(/^([A-Z][a-z]{2}) (\d{1,2})$/);if(!match)throw Error('Unexpected daily column '+label);
    const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[1]);
    if(month<0)throw Error('Invalid report month.');
    if(prevMonth===11&&month===0)year++;
    else if(prevMonth>=0&&month<prevMonth)throw Error('Unexpected date order in Clover report.');
    prevMonth=month;
    const day=Number(match[2]);const date=new Date(Date.UTC(year,month,day));
    if(date.getUTCMonth()!==month||date.getUTCDate()!==day)throw Error('Invalid date in Clover report.');
    dates.push(date.toISOString().slice(0,10));
  }
  const dataStart=rows.findIndex(r=>r[0]===''&&r[1]==='Total'&&r.length===header.length);
  const salesRows=rows.slice(dataStart+1);
  const get=(name:string)=>salesRows.find(r=>r[0]?.trim()===name&&r.length===header.length);
  const net=get('Net sales'),gross=get('Gross sales'),discount=get('Discounts');
  if(!net)throw Error('The daily Net sales row is missing.');
  const reportedNet=parseAmount(net[1]);
  const days=dates.map((date,i)=>({date,net:parseAmount(net[i+2]),gross:gross?parseAmount(gross[i+2]):null,discount:discount?parseAmount(discount[i+2]):null}));
  const difference=Math.abs(Math.round((sum(days)-reportedNet)*100));
  if(difference>1)throw Error('Daily net sales do not reconcile with Clover’s report total. Verify filters and date range.');
  return {days,reportedNet,period,fileName,verifiedTotal:true};
}
const dailyFields:FieldSpec[]=[
  {key:'date',label:'Calendar date',required:true,aliases:['day','sales date','business date','report date','transaction date']},
  {key:'net',label:'Daily net sales',required:true,aliases:['net sales','net revenue','net amount','revenue','sales total','total sales']},
  {key:'gross',label:'Gross sales',aliases:['gross sales','gross revenue','gross amount']},
  {key:'discount',label:'Discounts',aliases:['discounts','discount total','discount amount']}
];
async function parseDailyReport(raw:string,fileName:string):Promise<CloverReport>{
  if(raw.trimStart().replace(/^\uFEFF/,'').startsWith('Sales Report'))return parse(raw,fileName);
  const csv=await normalizeColumns(raw,dailyFields,'daily sales');
  const rows=splitCsv(csv);
  const header=rows.shift()!;
  const field=(row:string[],name:string)=>row[header.indexOf(name)]?.trim()??'';
  const days:Day[]=[];
  const seen=new Set<string>();
  for(const [i,row] of rows.entries()){
    const date=field(row,'date');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('Row '+(i+2)+': invalid date; use YYYY-MM-DD.');
    if(seen.has(date))throw Error('This file contains multiple rows for '+date+'. A line-item report must be aggregated with its transaction rules first; Soren will not guess daily totals.');
    seen.add(date);
    const amount=(key:string,required:boolean)=>{
      const v=field(row,key);
      if(!v&&!required)return null;
      if(!v)throw Error('Row '+(i+2)+': missing '+key+'.');
      return parseAmount(v);
    };
    days.push({date,net:amount('net',true)!,gross:amount('gross',false),discount:amount('discount',false)});
  }
  days.sort((a,b)=>a.date.localeCompare(b.date));
  if(!days.length||days.length>366)throw Error('Provide between 1 and 366 distinct daily rows.');
  return {days,reportedNet:sum(days),period:days[0].date+' through '+days.at(-1)!.date,fileName,verifiedTotal:false};
}
export function renderCloverImport(container:HTMLElement,accountScope:string){
  if(scope!==accountScope){
    scope=accountScope;current=null;history=[];enteredCogs='';dataRevision++;openPanes=new Set(['investigator']);
    if(!scope.startsWith('signed-out:')){const saved=readSaved(scope);if(saved){current=saved.report;history=saved.history;enteredCogs=saved.cogs;}}
  }
  const paint=()=>{
    const report=current;
    container.innerHTML='<div class="clover-heading"><div><span class="section-index">CLOVER / RETAIL DATA BRIDGE</span><h3>Bring your sales into the conversation.</h3><p>Upload Clover’s Daily Sales Report CSV without rearranging columns. Authorized imports are saved in this browser and sync privately to your selected business when online. On shared devices, remove the local copy after use. Nothing is committed to the public repository.</p></div><label class="import-button">IMPORT CLOVER DAILY CSV ↑<input id="clover-upload" type="file" accept=".csv,text/csv" hidden/></label></div><p id="clover-feedback" class="clover-feedback" role="status"></p><div class="clover-results"></div>';
    const results=container.querySelector<HTMLElement>('.clover-results')!;
    if(report){
      const days=report.days;
      const max=Math.max(1,...days.map(d=>d.net));
      const last=days.at(-1)!;
      const now=new Date();
      const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
      const complete=last.date===today?days.slice(0,-1):days;
      const recent=complete.slice(-7),prior=complete.slice(-14,-7);
      const avg=(xs:Day[])=>xs.length?sum(xs)/xs.length:0;
      const variation=prior.length&&avg(prior)>0?(avg(recent)/avg(prior)-1)*100:null;
      const comparisonReady=recent.length===7&&prior.length===7;
      const highDay=complete.length?complete.reduce((a,b)=>a.net>b.net?a:b):null;
      const lowDay=complete.length?complete.reduce((a,b)=>a.net<b.net?a:b):null;
      const recentNet=sum(recent),priorNet=sum(prior);
      const comparisonChange=comparisonReady&&priorNet>0?(recentNet/priorNet-1)*100:null;
      const trendLabel=!comparisonReady?'MORE HISTORY NEEDED':priorNet===0?'BASELINE IS ZERO':comparisonChange===null?'NOT CALCULABLE':comparisonChange>10?'REVENUE INCREASE':comparisonChange< -10?'REVENUE DECREASE':'RELATIVELY STEADY';
      const trendDescription=!comparisonReady?'I need fourteen complete reporting dates to compare two seven-day periods responsibly.':priorNet===0?'The earlier week recorded zero net sales; a percentage change would be misleading.':'The most recent complete seven days recorded '+money(recentNet)+' compared with '+money(priorNet)+' in the preceding seven days. The change is '+(comparisonChange!>=0?'+':'')+comparisonChange!.toFixed(1)+'%.';
      const cogsProvided=enteredCogs.trim()!=='';
      const cogs=cogsProvided?Number(enteredCogs):null;
      const grossProfit=cogs===null?null:report.reportedNet-cogs;
      const grossMargin=grossProfit!==null&&report.reportedNet!==0?grossProfit/report.reportedNet*100:null;
      results.innerHTML='<div class="clover-retention"><span>● DEVICE COPY / PRIVATE CLOUD SYNC WHEN AVAILABLE</span><button type="button" class="reset-button" id="clover-forget">REMOVE SAVED IMPORT</button></div><div class="clover-summary"><div><span>RECONCILED NET SALES</span><strong>'+money(report.reportedNet)+'</strong></div><div><span>REPORTING DAYS</span><strong>'+days.length+'</strong></div><div><span>LAST 7 VS PRIOR 7</span><strong>'+(variation===null?'N/A':(variation>=0?'+':'')+variation.toFixed(1)+'%')+'</strong></div></div>'+
        '<p class="clover-reconcile">'+(report.verifiedTotal?'✓ Sum of daily figures reconciles to Clover’s report total. ':'Mapped daily report: total is the sum of imported daily rows; no independent Clover summary was supplied. ')+''+(last.date===today?'The current date is excluded from the seven-day comparison because it may be incomplete.':'Seven-day comparisons assume all reported days are complete.')+'</p>'+
        '<div class="clover-archive"><div><span class="section-index">REPORT HISTORY / '+history.length+' UPLOADS</span><h4>Your saved report library</h4><p>Each CSV is retained privately. Overlapping dates use the most recently uploaded report once; totals are never double-counted.</p></div><div class="clover-archive-list">'+history.map(entry=>'<div class="clover-archive-row"><div><strong>'+esc(entry.report.fileName)+'</strong><small>'+esc(entry.report.period)+' · '+entry.report.days.length+' days · '+esc(entry.uploadedAt)+'</small></div><button type="button" class="reset-button" data-remove-report="'+esc(entry.id)+'" aria-label="Remove saved report">REMOVE</button></div>').join('')+'</div></div>'+
        '<div class="clover-chart-wrap"><div class="clover-daily-chart" role="group" aria-label="Daily net sales by date">'+days.map(d=>'<div role="img" aria-label="'+esc(d.date+': '+money(d.net))+'" title="'+esc(d.date+': '+money(d.net))+'"><span style="height:'+Math.max(2,Math.max(0,d.net)/max*100)+'%"></span></div>').join('')+'</div><div class="clover-chart-dates" aria-label="Chart date axis">'+days.map((d,i)=>(i===0||i===days.length-1||i%7===0)?'<span class="'+(i!==0&&i!==days.length-1?'detail-date ':'')+(i===0?'first-date':i===days.length-1?'last-date':'')+'" style="left:'+((i+.5)/days.length*100).toFixed(2)+'%">'+new Date(d.date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})+'</span>':'').join('')+'</div></div>'+
        '<details class="data-disclosure" data-pane="investigator"><summary><span>YOUR SALES ANALYSIS</span><strong>Retail performance investigator</strong><small>Week-over-week trends and standout dates</small></summary><section class="clover-investigator" aria-label="Retail performance investigator"><div class="clover-investigator-top"><span class="section-index">SOREN / RETAIL PERFORMANCE INVESTIGATOR</span><h4>Here’s what caught my attention.</h4><p>Observed patterns from your authorized Clover sales report, not a forecast or a diagnosis.</p></div><div class="clover-investigator-grid">'+
        '<article><span>07 DAYS VS PREVIOUS 07</span><strong>'+trendLabel+'</strong><p>'+trendDescription+'</p><small>Periods end '+(complete.at(-1)?.date||'N/A')+'. A current-day partial report is excluded.</small></article>'+
        '<article><span>HIGHEST REPORTED DAY</span><strong>'+(highDay?money(highDay.net):'N/A')+'</strong><p>'+(highDay?'Recorded '+highDay.date+'. Investigate promotions, traffic and availability before assigning a cause.':'No complete-day observations available.')+'</p></article>'+
        '<article><span>LOWEST REPORTED DAY</span><strong>'+(lowDay?money(lowDay.net):'N/A')+'</strong><p>'+(lowDay?'Recorded '+lowDay.date+'. Confirm whether the store was open and whether sales were fully recorded.':'No complete-day observations available.')+'</p></article></div>'+
        '<p class="clover-investigator-limit">Interpretation boundary: Sales alone do not establish customer traffic, seasonality, employee performance, profit or causation. Seven-day periods are calendar days and may include closures or reporting gaps.</p></section></details>'+
        '<details class="data-disclosure" data-pane="profit"><summary><span>OPTIONAL / FINANCIAL INPUTS</span><strong>Gross profit & margin</strong><small>Add product costs only when you have reliable figures</small></summary><section class="clover-profit-model" aria-label="Financial intelligence from owner provided costs"><div><span class="section-index">FINANCIAL INTELLIGENCE / OWNER INPUT</span><h4>Revenue is not profit. Let’s get specific.</h4><p>Enter total cost of goods sold for <strong>this exact Clover reporting period</strong>, excluding operating expenses. This is your supplied figure, not a value verified by Clover.</p></div><label for="clover-cogs">COST OF GOODS SOLD / MATCHING PERIOD ($)</label><div class="clover-profit-entry"><input id="clover-cogs" type="number" min="0" max="1000000000" step="0.01" placeholder="Unknown — leave blank" value="'+esc(enteredCogs)+'"/><button type="button" class="reset-button" id="clover-clear-cost">CLEAR</button></div>'+ (grossProfit===null?'<p class="clover-profit-pending">GROSS PROFIT & MARGIN / UNAVAILABLE UNTIL COST IS SUPPLIED</p>':'<div class="clover-profit-results"><div><span>MODELED GROSS PROFIT</span><strong>'+money(grossProfit)+'</strong></div><div><span>MODELED GROSS MARGIN</span><strong>'+(grossMargin===null?'N/A — ZERO NET SALES':grossMargin.toFixed(1)+'%')+'</strong></div></div><p class="clover-profit-caution">Calculated from reconciled net sales and <strong>owner-entered COGS</strong>. Not independently verified. This is not operating or net profit: labor, rent, fees, other variable expenses and taxes have not been supplied. A negative gross profit can be valid.</p>')+'</section></details>'+
        '<details class="data-disclosure" data-pane="ledger"><summary><span>REPORT DETAILS</span><strong>Daily sales ledger</strong><small>Expand to inspect every reported date</small></summary><div class="clover-table-wrap"><table><thead><tr><th>DATE</th><th>NET SALES</th><th>GROSS SALES</th><th>DISCOUNTS</th></tr></thead><tbody>'+days.map(d=>'<tr><td data-label="DATE">'+d.date+'</td><td data-label="NET SALES">'+money(d.net)+'</td><td data-label="GROSS SALES">'+(d.gross===null?'N/A':money(d.gross))+'</td><td data-label="DISCOUNTS">'+(d.discount===null?'N/A':money(d.discount))+'</td></tr>').join('')+'</tbody></table></div></details>'+
        '<details class="data-disclosure" data-pane="evidence"><summary><span>NEXT STEPS</span><strong>What data would unlock more insight?</strong><small>Required reports and a downloadable checklist</small></summary><section class="clover-evidence" aria-label="Missing business intelligence inputs"><div class="clover-evidence-head"><span class="section-index">SOREN / EVIDENCE CHECK</span><h4>What I need before we call this profit.</h4><p>Sales are verified. The rest is an open investigation, darling—not an invitation to make numbers up.</p></div><div class="clover-evidence-grid">'+
        '<article class="clover-evidence-item"><span class="clover-evidence-state">NEEDS DATA</span><h5>Transaction counts</h5><p>Export the matching date range from Clover orders or transaction reporting.</p><span>UNLOCKS / AVERAGE TRANSACTION</span></article>'+
        '<article class="clover-evidence-item"><span class="clover-evidence-state">'+(cogsProvided?'OWNER-SUPPLIED':'NEEDS DATA')+'</span><h5>Cost of goods sold</h5><p>Provide actual item costs or a COGS report for the same period. Revenue is not profit.</p><span>UNLOCKS / GROSS PROFIT & MARGIN</span></article>'+
        '<article class="clover-evidence-item"><span class="clover-evidence-state">NEEDS DATA</span><h5>Operating expenses</h5><p>Provide fixed and variable expenses for this period, separate from COGS.</p><span>UNLOCKS / MODELED BREAK-EVEN</span></article>'+
        '<article class="clover-evidence-item"><span class="clover-evidence-state">NEEDS DATA</span><h5>Product movement & stock</h5><p>Provide item-level sales plus current on-hand quantities.</p><span>UNLOCKS / INVENTORY INTELLIGENCE</span></article></div>'+
        '<div class="clover-evidence-footer"><p><strong>Evidence boundary:</strong> The Clover report does not provide transaction counts, expenses, or inventory. '+(cogsProvided?'COGS is owner-entered, not verified by Clover.':'COGS is also missing.')+' Missing metrics are not zero. Keep private reports out of the public repository.</p><button id="clover-evidence-template" type="button" class="reset-button">DOWNLOAD DATA CHECKLIST ↓</button></div></section></details>';
    }else results.innerHTML='<p class="clover-empty">Waiting for an authorized Clover daily sales report. No data uploaded yet.</p>';
    container.querySelectorAll<HTMLDetailsElement>('details[data-pane]').forEach(details=>{
      const pane=details.dataset.pane!;
      details.open=openPanes.has(pane);
      details.addEventListener('toggle',()=>{if(details.open)openPanes.add(pane);else openPanes.delete(pane);});
    });
    container.querySelectorAll<HTMLButtonElement>('[data-remove-report]').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.dataset.removeReport!;
      const remaining=history.filter(entry=>entry.id!==id);
      if(remaining.length===history.length)return;
      const next=combineReports(remaining);
      try{
        if(canSyncImports()){
          if(next)await saveCloudImport('clover_daily',{report:next,cogs:'',history:remaining});
          else await removeCloudImport('clover_daily');
        }
        history=remaining;current=next;enteredCogs='';dataRevision++;saveCurrent();paint();
        queueMicrotask(()=>window.dispatchEvent(new Event('soren:clover-changed')));
      }catch(error){container.querySelector<HTMLElement>('#clover-feedback')!.textContent=error instanceof Error?error.message:'Could not update your saved report history.';}
    }));
    container.querySelector<HTMLButtonElement>('#clover-forget')?.addEventListener('click',async()=>{
      const targetScope=scope;
      try{
        if(canSyncImports())await removeCloudImport('clover_daily');
        if(targetScope!==scope)return;
        dataRevision++;current=null;history=[];enteredCogs='';saveCurrent();paint();queueMicrotask(()=>window.dispatchEvent(new Event('soren:clover-changed')));
      }catch(err){container.querySelector<HTMLElement>('#clover-feedback')!.textContent=err instanceof Error?err.message:'Unable to remove the cloud copy.';}
    });
    container.querySelector<HTMLInputElement>('#clover-cogs')?.addEventListener('change',e=>{
      const input=e.target as HTMLInputElement;
      const value=input.value.trim();
      if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e9)){
        const status=container.querySelector<HTMLElement>('#clover-feedback')!;status.textContent='Enter a valid nonnegative COGS amount, or leave it blank if unknown.';return;
      }
      dataRevision++;enteredCogs=value;saveCurrent();paint();if(current&&canSyncImports()){const targetScope=scope;void saveCloudImport('clover_daily',{report:current,cogs:enteredCogs,history}).catch(err=>{if(scope===targetScope)container.querySelector<HTMLElement>('#clover-feedback')!.textContent=err.message;});}
    });
    container.querySelector<HTMLButtonElement>('#clover-clear-cost')?.addEventListener('click',()=>{dataRevision++;enteredCogs='';saveCurrent();paint();if(current&&canSyncImports())void saveCloudImport('clover_daily',{report:current,cogs:enteredCogs}).catch(()=>{});});
    container.querySelector<HTMLButtonElement>('#clover-evidence-template')?.addEventListener('click',()=>{
      const rows=[['Data needed','Matching period','Question unlocked','Source'],['Transaction counts',report?.period||'','Average transaction value','Clover orders / transaction report'],['Cost of goods sold',report?.period||'','Gross margin','Actual costs'],['Operating expenses',report?.period||'','Modeled break-even','Fixed and variable; exclude COGS'],['Product movement and stock',report?.period||'','Inventory intelligence','Item-level sales and on-hand']];
      const csv=rows.map(row=>row.map(cell=>'"'+cell.replace(/"/g,'""')+'"').join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='soren-retail-evidence-checklist.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    container.querySelector<HTMLInputElement>('#clover-upload')!.addEventListener('change',async e=>{
      const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;
      const status=container.querySelector<HTMLElement>('#clover-feedback')!;
      try{if(f.size>500000)throw Error('File exceeds 500 KB.');const parsed=await parseDailyReport(await f.text(),f.name);if(history.length>=100)throw Error('Your report library holds 100 uploads. Remove an obsolete report before adding another.');history.push({id:crypto.randomUUID(),uploadedAt:new Date().toLocaleDateString(),report:parsed});dataRevision++;current=combineReports(history);enteredCogs='';const saved=saveCurrent();paint();queueMicrotask(()=>window.dispatchEvent(new Event('soren:clover-changed')));if(canSyncImports()){const targetScope=scope;void saveCloudImport('clover_daily',{report:current,cogs:'',history}).then(()=>{if(scope===targetScope)container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Clover import saved privately to your business workspace and this browser.';}).catch(err=>{if(scope===targetScope)container.querySelector<HTMLElement>('#clover-feedback')!.textContent=err.message+' Your device copy remains available.';});}if(!saved)container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Imported for this session, but this browser could not save the report. Storage may be disabled or full.';if(saved)container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Imported '+parsed.days.length+' reporting days from '+parsed.fileName+'.';}
      catch(err){status.textContent=err instanceof Error?err.message:'Could not read Clover report.';}
    });
  };
  paint();
  if(canSyncImports()){
    const targetScope=scope;
    const initialRevision=dataRevision;
    void loadCloudImport('clover_daily').then(async payload=>{
      if(scope!==targetScope||dataRevision!==initialRevision)return;
      const cloud=normalizeSaved(payload);
      if(cloud){
        current=cloud.report;history=cloud.history;enteredCogs=cloud.cogs;
        saveCurrent();paint();
        container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Restored '+history.length+' report(s) from your private business workspace.';
      }else if(!payload&&current){
        await saveCloudImport('clover_daily',{report:current,cogs:enteredCogs});
        if(scope===targetScope)container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Previously saved report synced privately to your business workspace.';
      }
    }).catch(err=>{if(scope===targetScope)container.querySelector<HTMLElement>('#clover-feedback')!.textContent=err instanceof Error?err.message:'Cloud sync unavailable; local copy remains.';});
  }
}
