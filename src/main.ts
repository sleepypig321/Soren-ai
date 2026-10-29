import './style.css';
import { normalizeColumns, type FieldSpec } from './column-map';
import { canSyncImports, loadCloudImport, saveCloudImport, removeCloudImport } from './import-sync';
import { openSorenConversation, attachSorenLauncher } from './conversation';
import { initAuth, addAccountToolbar, getActiveBusinessId, getActiveUserId } from './auth';
import { investigateRetail } from './investigations';
import { renderInventory } from './inventory';
import { renderCloverImport } from './clover-import';

type Sale = { date: string; revenue: number; transactions: number; cogs: number };
type FinancialEntry={id:string;uploadedAt:string;fileName:string;sales:Sale[]};
let financialHistory:FinancialEntry[]=[];
let sales:Sale[] = [];
let source = 'No financial data imported';
let fixedCosts = 0;
let importedScope='';
let financialRevision=0;
let financialCloudStatus='LOCAL BROWSER COPY';
const financialKey=(id:string)=>'soren:financial-daily:v1:'+id;
const validSales=(rows:Sale[],maxRows=366):boolean=>Array.isArray(rows)&&rows.length>0&&rows.length<=maxRows&&rows.every(row=>
  /^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number.isFinite(row.revenue)&&row.revenue>=0&&
  Number.isInteger(row.transactions)&&row.transactions>=0&&Number.isFinite(row.cogs)&&row.cogs>=0&&row.cogs<=row.revenue);
function combinedFinancial(entries:FinancialEntry[]):Sale[]{
  const map=new Map<string,Sale>();
  for(const entry of entries)for(const row of entry.sales)map.set(row.date,row);
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function applySavedFinancial(payload:unknown):boolean{
  const stored=payload as {sales?:Sale[];source?:string;fixedCosts?:number;history?:FinancialEntry[]}|null;
  if(!stored||!validSales(stored.sales??[],10000))return false;
  const entries=Array.isArray(stored.history)&&stored.history.length<=100&&stored.history.every(entry=>
    entry&&typeof entry.id==='string'&&typeof entry.fileName==='string'&&typeof entry.uploadedAt==='string'&&validSales(entry.sales))
    ?stored.history:[{id:'legacy',fileName:stored.source||'Imported financial CSV',uploadedAt:'Previously imported',sales:stored.sales!}];
  financialHistory=entries;sales=combinedFinancial(entries);
  source=entries.length===1?entries[0].fileName:entries.length+' saved financial reports';
  fixedCosts=Number.isFinite(stored.fixedCosts)&&stored.fixedCosts!>=0&&stored.fixedCosts!<=1e9?stored.fixedCosts!:0;
  return true;
}
type CloverDay = {date:string;net:number};
type CloverStored = {report:{days:CloverDay[];reportedNet:number;fileName:string}};
let cloverDays:CloverDay[]=[];
let cloverSource='';
let cloverReportCount=0;
let cloverScope='';
let cloverRevision=0;
function applyCloverPayload(payload:unknown):boolean {
  const report=(payload as CloverStored|null)?.report;
  if(!report||!Array.isArray(report.days)||report.days.length<1||report.days.length>10000||
    !Number.isFinite(report.reportedNet)||!report.days.every(day=>typeof day.date==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(day.date)&&Number.isFinite(day.net) )||
    Math.abs(report.days.reduce((sum,day)=>sum+day.net,0)-report.reportedNet)>.02)return false;
  cloverDays=[...report.days].sort((a,b)=>a.date.localeCompare(b.date));
  cloverSource=typeof report.fileName==='string'?report.fileName.slice(0,150):'Saved Clover report';
  cloverReportCount=Array.isArray((payload as {history?:unknown[]}).history)?(payload as {history:unknown[]}).history.length:1;
  return true;
}
function restoreCloverImport(){
  const user=getActiveUserId(),key=user?user+':'+(getActiveBusinessId()??'personal'):'signed-out';
  if(cloverScope===key)return;
  cloverScope=key;cloverRevision++;cloverDays=[];cloverSource='';cloverReportCount=0;
  if(!user)return;
  try{const raw=localStorage.getItem('soren:clover-daily:v1:'+key);if(raw)applyCloverPayload(JSON.parse(raw));}catch{/* Cloud may still have a copy. */}
  if(canSyncImports()){
    const revision=cloverRevision;
    void loadCloudImport('clover_daily').then(payload=>{
      if(cloverScope!==key||cloverRevision!==revision)return;
      if(payload&&applyCloverPayload(payload))render();
    }).catch(()=>{/* Use the device copy when offline. */});
  }
}
function restoreFinancialImport(){
  const id=getActiveUserId();
  const key=id?id+':'+(getActiveBusinessId()??'personal'):'signed-out';
  if(importedScope===key)return;
  importedScope=key;financialRevision++;financialCloudStatus='LOCAL BROWSER COPY';sales=[];financialHistory=[];source='No financial data imported';fixedCosts=0;
  if(!id)return;
  try{
    const raw=localStorage.getItem(financialKey(key));if(raw)applySavedFinancial(JSON.parse(raw));
  }catch{/* Keep previous cloud copy available for restoration. */}
  if(canSyncImports()){
    const revision=financialRevision;
    void loadCloudImport('financial_daily').then(async payload=>{
      if(importedScope!==key||financialRevision!==revision)return;
      if(applySavedFinancial(payload)){
        saveFinancialImport();financialCloudStatus='RESTORED FROM PRIVATE CLOUD';render();
      }else if(!payload&&sales.length>0){
        await saveCloudImport('financial_daily',{sales,source,fixedCosts,history:financialHistory});
        if(importedScope===key)financialCloudStatus='SYNCED TO PRIVATE CLOUD';
      }
    }).catch(()=>{if(importedScope===key)financialCloudStatus='OFFLINE / LOCAL COPY AVAILABLE';});
  }
}
function saveFinancialImport():boolean{
  if(importedScope==='signed-out')return false;
  try{
    if(sales.length===0)localStorage.removeItem(financialKey(importedScope));
    else localStorage.setItem(financialKey(importedScope),JSON.stringify({sales,source,fixedCosts,history:financialHistory}));
    return true;
  }catch{return false;}
}

const app = document.querySelector<HTMLDivElement>('#app')!;
const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const pct = (n:number) => Number.isFinite(n) ? n.toFixed(1)+'%' : 'N/A';
const escapeHTML = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const financialFields:FieldSpec[]=[
  {key:'date',label:'Sale date',required:true,aliases:['day','sales date','transaction date','business date','report date']},
  {key:'revenue',label:'Revenue',required:true,aliases:['net sales','sales','sales total','total net sales','net revenue','net amount']},
  {key:'transactions',label:'Transaction count',required:true,aliases:['orders','order count','number of orders','transactions count','transaction qty','receipts','number of transactions']},
  {key:'cogs',label:'Cost of goods sold',required:true,aliases:['cost of goods','costs of goods sold','total cogs','product costs','goods cost']}
];
function parseCSV(text:string): Sale[] {
  if(/^\uFEFF?Sales Report(?:,|\r?\n)/.test(text.trimStart()) || text.trimStart().startsWith('Sales Report'))throw Error('This is a Clover Sales Report. Use “IMPORT CLOVER DAILY CSV” in the Clover / Retail Data Bridge below. The custom financial importer expects date,revenue,transactions,cogs.');
  const records:string[][]=[]; let row:string[]=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))records.push(row);row=[];}
    else cell+=c;
  }
  if(quoted)throw Error('An opening quote is missing its closing quote.');
  row.push(cell);if(row.some(v=>v.trim()))records.push(row);
  const headers=(records.shift()||[]).map(h=>h.trim().toLowerCase().replace(/^\uFEFF/,''));
  const required=['date','revenue','transactions','cogs'];
  if(required.some(h=>!headers.includes(h)))throw Error('CSV needs columns: date, revenue, transactions, cogs.');
  if(records.length===0||records.length>366)throw Error('Upload between 1 and 366 daily rows.');
  const seen=new Set<string>();
  return records.map((r,i)=>{
    const field=(name:string)=>r[headers.indexOf(name)]?.trim()||'';
    const date=field('date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('Row '+(i+2)+': date must be YYYY-MM-DD.');
    if(seen.has(date))throw Error('Row '+(i+2)+': duplicate date '+date+'. Provide one row per calendar day.');
    seen.add(date);
    const vals=['revenue','transactions','cogs'].map(h=>field(h));
    if(vals.some(v=>v===''||!Number.isFinite(Number(v))||Number(v)<0))throw Error('Row '+(i+2)+': values must be nonnegative numbers.');
    const [revenue,transactions,cogs]=vals.map(Number);
    if(!Number.isInteger(transactions)||cogs>revenue)throw Error('Row '+(i+2)+': transactions must be whole; COGS cannot exceed revenue.');
    return {date,revenue,transactions,cogs};
  });
}
function summarize(rows:Sale[]){
  const revenue=rows.reduce((n,r)=>n+r.revenue,0),cogs=rows.reduce((n,r)=>n+r.cogs,0),transactions=rows.reduce((n,r)=>n+r.transactions,0);
  const profit=revenue-cogs,margin=revenue?100*profit/revenue:0,average=transactions?revenue/transactions:0;
  const operating=profit-fixedCosts,breakEven=margin>0?fixedCosts/(margin/100):null;
  return {revenue,cogs,transactions,profit,margin,average,operating,breakEven,days:rows.length};
}

type Page = 'overview' | 'signals' | 'data' | 'inventory';
const getPage = (): Page => location.hash === '#signals' ? 'signals' : location.hash === '#data' ? 'data' : location.hash === '#inventory' ? 'inventory' : 'overview';
let activePage: Page = getPage();
let selectedInsight = 'revenue';
function render(){
  restoreFinancialImport();
  restoreCloverImport();
  const s=summarize(sales);
  const investigations=sales.length?investigateRetail(sales,fixedCosts):[];
  const ordered=[...sales].sort((a,b)=>a.date.localeCompare(b.date));
  const hasFinancial=ordered.length>0;
  const hasClover=!hasFinancial&&cloverDays.length>0;
  const hasSales=hasFinancial||hasClover;
  const salesDays=hasFinancial?ordered.map(day=>({date:day.date,revenue:day.revenue})):cloverDays.map(day=>({date:day.date,revenue:day.net}));
  const salesTotal=hasFinancial?s.revenue:cloverDays.reduce((n,day)=>n+day.net,0);
  const salesSource=hasFinancial?source:cloverSource;
  const salesCount=hasFinancial?s.days:cloverDays.length;
  const completeSales=salesDays.filter(d=>{const t=new Date();const today=[t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0')].join('-');return d.date!==today;});
  const weekRecent=completeSales.slice(-7),weekPrior=completeSales.slice(-14,-7);
  const weekSum=(list:{date:string;revenue:number}[])=>list.reduce((n,d)=>n+d.revenue,0);
  const weekChange=weekRecent.length===7&&weekPrior.length===7&&weekSum(weekPrior)>0?(weekSum(weekRecent)/weekSum(weekPrior)-1)*100:null;
  const high=ordered.length?ordered.reduce((a,b)=>a.revenue>b.revenue?a:b):{date:'',revenue:0};
  const low=ordered.length?ordered.reduce((a,b)=>a.revenue<b.revenue?a:b):{date:'',revenue:0};
  const options:Record<string,{label:string,value:string,context:string,evidence:string,action:string}> = {
    revenue:{label:'REVENUE SIGNAL',value:money(s.revenue),context:'Recorded sales across '+s.days+' reporting days.',
      evidence:'Daily peak: '+money(high.revenue)+' on '+high.date+'. Daily low: '+money(low.revenue)+' on '+low.date+'.',
      action:'Compare traffic, staffing and availability on high- and low-revenue days before making a causal claim.'},
    margin:{label:'MARGIN STRUCTURE',value:pct(s.margin),context:'Gross profit as a share of recorded sales.',
      evidence:'Gross profit '+money(s.profit)+' from '+money(s.revenue)+' revenue after '+money(s.cogs)+' cost of goods.',
      action:'Investigate category mix and pricing before treating this percentage as good or bad.'},
    transactions:{label:'TRANSACTION FLOW',value:String(s.transactions),context:'Recorded transactions, not unique customers.',
      evidence:'Average transaction value is '+money(s.average)+'. Repeat-purchase behavior was not provided.',
      action:'Review basket composition and checkout behavior to identify responsible ways to increase value.'},
    costs:{label:'COST PRESSURE',value:money(fixedCosts),context:'Fixed costs entered for this exact reporting period.',
      evidence:'Modeled result is '+money(s.operating)+', before other unlisted operating expenses.',
      action:'Validate expense categories and periods before cutting costs or forecasting profitability.'}
  };
  if(hasClover){
    const peak=salesDays.reduce((a,b)=>a.revenue>b.revenue?a:b);
    const lowDay=salesDays.reduce((a,b)=>a.revenue<b.revenue?a:b);
    options.revenue={label:'REVENUE SIGNAL',value:money(salesTotal),context:'Actual Clover net sales across '+salesCount+' reported days.',
      evidence:'Highest reported day: '+money(peak.revenue)+' on '+peak.date+'. Lowest: '+money(lowDay.revenue)+' on '+lowDay.date+'.',
      action:'Compare hours, promotions and stock availability on those dates; sales alone cannot prove the cause.'};
    options.margin={label:'MARGIN STRUCTURE',value:'—',context:'Cost of goods was not included in the Clover sales report.',evidence:'Gross margin is unavailable without actual COGS.',action:'Add verified costs for the same reporting period in Data Sources.'};
    options.transactions={label:'TRANSACTION FLOW',value:'—',context:'Daily transaction counts were not supplied.',evidence:'Net sales are available, but average basket size cannot be calculated.',action:'Import a matching Clover orders report to understand basket size.'};
    options.costs={label:'COST PRESSURE',value:'—',context:'Operating expenses were not supplied.',evidence:'Sales revenue is not operating profit.',action:'Add actual expense figures for the same period before modeling profit.'};
  }else if(!hasFinancial){for(const option of Object.values(options)){option.value='—';option.context='Import actual financial records to calculate this signal.';option.evidence='No financial data has been provided for this workspace.';option.action='Import a Clover report or a complete financial CSV in Data Sources.';}}
  if(!options[selectedInsight])selectedInsight='revenue';
  const active=options[selectedInsight];
  const points=salesDays.map((r,i)=>{
    const x=salesDays.length===1?380:16+i*(748/(salesDays.length-1));
    const max=Math.max(1,...salesDays.map(d=>d.revenue));
    const y=166-(r.revenue/max)*132;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  const orbitItems=[
    ['revenue','REVENUE',hasSales?money(salesTotal):'—'],
    ['margin','GROSS MARGIN',hasFinancial?pct(s.margin):'—'],
    ['transactions','TRANSACTIONS',hasFinancial?String(s.transactions):'—'],
    ['costs','FIXED COSTS',hasFinancial?money(fixedCosts):'—']
  ];
  app.innerHTML=
    '<div class="observatory">'+
      '<aside class="identity-rail"><div class="rail-logo"><img src="/soren-dna.png" alt="Soren DNA mark"/></div>'+
        '<div class="rail-divider"></div><nav aria-label="Soren pages">'+
          '<button type="button" data-page-link="overview" class="rail-link'+(activePage==='overview'?' active':'')+'" aria-label="Overview" aria-current="'+(activePage==='overview'?'page':'false')+'" data-tooltip="Overview">✧</button>'+
          '<button type="button" data-page-link="signals" class="rail-link'+(activePage==='signals'?' active':'')+'" aria-label="Retail investigations" aria-current="'+(activePage==='signals'?'page':'false')+'" data-tooltip="Retail Investigations">⌁</button>'+
          '<button type="button" data-page-link="inventory" class="rail-link'+(activePage==='inventory'?' active':'')+'" aria-label="Inventory intelligence" aria-current="'+(activePage==='inventory'?'page':'false')+'" data-tooltip="Inventory Intelligence">▥</button>'+
          '<button type="button" data-page-link="data" class="rail-link'+(activePage==='data'?' active':'')+'" aria-label="Data sources" aria-current="'+(activePage==='data'?'page':'false')+'" data-tooltip="Data Sources">▤</button>'+
          '</nav>'+
        '<div class="rail-bottom"><span class="rail-pulse"></span><span>01</span></div></aside>'+
      '<div class="workspace" data-page="'+activePage+'">'+
        '<div class="topline"><div class="wordmark">SOREN <span> / INTELLIGENCE WITH INTENTION</span></div><div class="top-meta"><span>BUSINESS WORKSPACE</span><span class="sep"></span><span class="demo-led">● PRIVATE BUSINESS WORKSPACE</span></div></div>'+
        '<div class="hero-line"><div><p class="eyebrow">GOOD TO SEE YOU, PARTNER.</p><h1>Let’s find the <em>signal</em><br/>inside the noise.</h1></div><p class="hero-copy">Your business is a living system. Every figure is connected. Select a signal and follow the evidence.</p></div>'+
        '<div class="stage" id="intelligence"><section class="business-overview" aria-label="Business performance overview">'+
          '<div class="business-overview-header"><div><span class="section-index">BUSINESS COMMAND CENTER / VERIFIED DATA</span><h2>Your business at a glance.</h2><p>Connected reports power the numbers. Anything unknown stays unknown.</p></div><span class="business-overview-live">'+(hasSales?'● SALES CONNECTED':'○ AWAITING REPORT')+'</span></div>'+
          '<div class="business-overview-grid">'+
            '<article class="overview-tile overview-tile-revenue"><span>REPORTED SALES</span><strong>'+(hasSales?money(salesTotal):'—')+'</strong><small>'+(hasSales?salesCount+' reporting days':'No sales report uploaded')+'</small></article>'+
            '<article class="overview-tile"><span>WEEK-OVER-WEEK</span><strong>'+(weekChange===null?'—':(weekChange>=0?'+':'')+weekChange.toFixed(1)+'%')+'</strong><small>'+(weekChange===null?'Need two full seven-day periods':'Last seven reported days vs prior seven')+'</small></article>'+
            '<article class="overview-tile"><span>TRANSACTIONS</span><strong>'+(hasFinancial?String(s.transactions):'—')+'</strong><small>'+(hasFinancial?'From financial CSV':'Orders data not supplied')+'</small></article>'+
            '<article class="overview-tile"><span>GROSS MARGIN</span><strong>'+(hasFinancial?pct(s.margin):'—')+'</strong><small>'+(hasFinancial?'From supplied COGS':'Product costs not supplied')+'</small></article>'+
          '</div>'+
          '<div class="overview-trend"><div><span>REVENUE HISTORY</span><small>'+escapeHTML(salesSource||'Awaiting sales records')+'</small></div>'+
          (hasSales?'<div class="overview-bars" role="img" aria-label="Net revenue by reported day">'+salesDays.map(day=>'<div title="'+escapeHTML(day.date+' · '+money(day.revenue))+'"><span style="height:'+Math.max(2,Math.max(0,day.revenue)/Math.max(1,...salesDays.map(x=>x.revenue))*100)+'%"></span></div>').join('')+'</div><div class="overview-dates"><span>'+escapeHTML(salesDays[0].date)+'</span><span>'+escapeHTML(salesDays[salesDays.length-1].date)+'</span></div>':'<p class="overview-empty">Your first real sales report will appear here. No sample numbers.</p>')+'</div>'+
          '<div class="overview-sources"><div><span>DATA CONNECTIONS</span><strong>'+(hasClover?cloverReportCount+' Clover CSV report(s)':hasFinancial?'Custom financial CSV loaded':'No sales reports yet')+'</strong></div><div><span>STOCK INTELLIGENCE</span><strong>Open inventory workspace for stock status</strong></div><button type="button" data-page-link="data" class="overview-link">MANAGE REPORTS ↗</button></div>'+
        '</section>'+
        '<section class="intelligence-brief" aria-live="polite">'+
          '<div class="brief-top"><span class="mini-mark">✳</span><span>SOREN / LIVE BRIEFING</span><span class="muted-dot">● LOCAL</span></div>'+
          '<div class="brief-main"><div class="seq">01—04 / CURRENT FOCUS</div><p class="eyebrow">'+active.label+'</p><div class="focus-value">'+active.value+'</div><p class="focus-context">'+active.context+'</p><div class="brief-rule"></div>'+
          '<p class="brief-caption">WHAT THE DATA SAYS</p><p class="brief-body">'+active.evidence+'</p><p class="brief-caption">WHAT I WOULD INVESTIGATE</p><p class="brief-body">'+active.action+'</p></div>'+
          '<button class="strategy-button" id="ask">Develop a strategy <span>↗</span></button><p class="api-state" id="ai-status" role="status">Talk to Soren using your workspace context.</p>'+
        '</section></div>'+
        '<section class="signal-floor" id="signals"><div class="section-title"><span class="section-index">02 / RETAIL INVESTIGATION DESK</span><h2>Let’s examine the evidence.</h2><p>'+escapeHTML(salesSource||source)+' · '+salesCount+' reporting rows · Calculations run locally · No Meta credits used</p></div>'+
          (hasSales?'<div class="pulse-chart"><svg viewBox="0 0 780 180" role="img" aria-label="Revenue trend across reporting days" preserveAspectRatio="none"><defs><linearGradient id="pulseGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7aa7ff" stop-opacity=".3"/><stop offset="1" stop-color="#7aa7ff" stop-opacity="0"/></linearGradient></defs><path d="M16 166 H764 M16 122 H764 M16 78 H764 M16 34 H764" fill="none" stroke="#7ca2eb" stroke-opacity=".12"/><polygon points="16,166 '+points+' 764,166" fill="url(#pulseGrad)"/><polyline points="'+points+'" fill="none" stroke="#98beff" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="pulse-axis"><span>'+escapeHTML(salesDays[0].date)+'</span><span>'+escapeHTML(salesDays[salesDays.length-1].date)+'</span></div></div>':'<div class="inventory-boundary"><b>NO FINANCIAL REPORT IMPORTED</b><p>Upload actual Clover or financial data in Data Sources to see sales signals here.</p></div>')+
          (hasClover?'<div class="metric-band"><div><span>NET SALES</span><strong>'+money(salesTotal)+'</strong></div><div><span>REPORTING DAYS</span><strong>'+salesCount+'</strong></div><div><span>TRANSACTIONS</span><strong>NOT PROVIDED</strong></div><div><span>GROSS MARGIN</span><strong>NOT PROVIDED</strong></div></div>':hasFinancial?'<div class="metric-band"><div><span>GROSS PROFIT</span><strong>'+money(s.profit)+'</strong></div><div><span>AVG. TRANSACTION</span><strong>'+money(s.average)+'</strong></div><div><span>MODELED RESULT</span><strong class="'+(s.operating<0?'loss':'')+'">'+money(s.operating)+'</strong></div><div><span>BREAK-EVEN REVENUE</span><strong>'+(s.breakEven===null?'N/A':money(s.breakEven))+'</strong></div></div>':'')+
          '<div class="investigation-intro"><div><span class="section-index">INVESTIGATION / 01</span><h3>What the numbers can—and cannot—tell us.</h3><p>Every finding shows its calculation, evidence limitations and a practical next step. That distinction matters, darling.</p></div><button id="investigate-chat" type="button">DISCUSS WITH SOREN ↗</button></div>'+
          '<div class="investigation-list">'+(hasClover?'<p class="inventory-boundary">Clover sales are loaded. Review the exact daily highs, lows and week-over-week comparison in Data Sources, or discuss them with Soren. Profit and transaction findings await additional reports.</p>':hasFinancial?investigations.map((item,i)=>'<article class="investigation-card"><div class="investigation-meta"><span>FINDING '+String(i+1).padStart(2,'0')+'</span><span class="investigation-status '+item.status+'">'+(item.status==='watch'?'REVIEW':item.status==='positive'?'OBSERVED':'NEEDS CONTEXT')+'</span></div><div class="investigation-main"><h3>'+escapeHTML(item.label)+'</h3><strong>'+escapeHTML(item.metric)+'</strong></div><p class="investigation-observation">'+escapeHTML(item.observation)+'</p><details><summary>VIEW THE EVIDENCE & NEXT ACTION <span>＋</span></summary><div class="investigation-evidence"><p><b>CALCULATION</b>'+escapeHTML(item.calculation)+'</p><p><b>WHAT WE CANNOT CLAIM</b>'+escapeHTML(item.limitation)+'</p><p><b>NEXT ACTION</b>'+escapeHTML(item.nextStep)+'</p></div></details></article>').join(''):'<p class="inventory-boundary">No financial investigations yet. Import actual data in Data Sources to begin.</p>')+'</div>'+
          '<div class="investigation-boundary"><span>DATA BOUNDARY / 01</span><p>This sales report does not include product-level inventory, traffic, labor, customer identity or supplier records. Soren will not invent a stockout, employee problem or retention trend without those inputs.</p></div>'+
        '</section>'+
        '<section class="inventory-deck" id="inventory" aria-label="Inventory intelligence"></section>'+
        '<section class="data-deck" id="data"><header class="data-heading"><span class="section-index">03 / DATA WORKSPACE</span><h2>Your data. <em>Actual intelligence.</em></h2><p>One report at a time. Start with Clover, see your results, then add more detail when you have it. Imports sync privately to your selected business when online.</p></header>'+
        '<div class="data-journey"><div><span>01</span><strong>IMPORT</strong><small>Choose a sales report</small></div><div><span>02</span><strong>REVIEW</strong><small>Verify the figures</small></div><div><span>03</span><strong>INVESTIGATE</strong><small>Follow the evidence</small></div></div>'+
        '<section class="clover-import" aria-label="Clover daily import"></section>'+
        '<details class="financial-advanced"><summary><span>ALTERNATIVE FORMAT</span><strong>Using a custom financial CSV?</strong><small>Advanced import and expense input</small></summary><div class="financial-advanced-content"><p>For manually prepared daily reports with the required columns. This is separate from the Clover importer above.</p><div class="data-controls"><div><label for="fixed">FIXED EXPENSES / SAME PERIOD ($)</label><input id="fixed" type="number" min="0" step="1" value="'+(hasFinancial?fixedCosts:'')+'" placeholder="Optional after import"/><small>COGS is already accounted for. Other expenses may still be missing.</small></div><label class="import-button">IMPORT FINANCIAL CSV ↑<input id="file" type="file" accept=".csv,text/csv" hidden/></label><button id="reset" class="reset-button">CLEAR FINANCIAL DATA ↺</button></div><p class="schema">CSV FORMAT: <code>date,revenue,transactions,cogs</code> · '+(sales.length===0?'NO FINANCIAL REPORT IMPORTED':'SAVED: '+escapeHTML(source))+' · '+escapeHTML(financialCloudStatus)+'</p><div class="clover-archive"><span class="section-index">CUSTOM FINANCIAL REPORT HISTORY / '+financialHistory.length+' UPLOADS</span><div class="clover-archive-list">'+financialHistory.map(entry=>'<div class="clover-archive-row"><div><strong>'+escapeHTML(entry.fileName)+'</strong><small>'+entry.sales.length+' rows · '+escapeHTML(entry.uploadedAt)+'</small></div><button type="button" class="reset-button" data-remove-financial="'+escapeHTML(entry.id)+'">REMOVE</button></div>').join('')+'</div></div></div></details></section>'+
        '<footer>© SOREN / PROTOTYPE 0.2 <span>INTELLIGENCE WITH INTENTION · BUSINESS INTELLIGENCE</span></footer>'+
      '</div></div>';
  document.querySelectorAll<HTMLButtonElement>('[data-page-link]').forEach(button => button.addEventListener('click', () => {
    const page = button.dataset.pageLink as Page;
    if (page === activePage) return;
    activePage = page;
    history.pushState({page}, '', '#'+page);
    render();
    window.scrollTo(0,0);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(button=>button.addEventListener('click',()=>{
    selectedInsight=button.dataset.focus||'revenue';render();
  }));
  document.querySelector<HTMLInputElement>('#fixed')!.addEventListener('change',e=>{
    const n=Number((e.target as HTMLInputElement).value);
    if(Number.isFinite(n)&&n>=0&&n<=1e9){financialRevision++;fixedCosts=n;saveFinancialImport();if(sales.length>0&&canSyncImports())void saveCloudImport('financial_daily',{sales,source,fixedCosts}).catch(()=>{});render();}
  });
  document.querySelector('#reset')!.addEventListener('click',()=>{financialRevision++;sales=[];financialHistory=[];source='No financial data imported';fixedCosts=0;selectedInsight='revenue';saveFinancialImport();if(canSyncImports())void removeCloudImport('financial_daily').catch(()=>{});render();});
  document.querySelectorAll<HTMLButtonElement>('[data-remove-financial]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.removeFinancial!;
    const remaining=financialHistory.filter(entry=>entry.id!==id);
    if(remaining.length===financialHistory.length)return;
    try{
      if(canSyncImports()){
        if(remaining.length)await saveCloudImport('financial_daily',{sales:combinedFinancial(remaining),source:remaining.length+' saved financial reports',fixedCosts:0,history:remaining});
        else await removeCloudImport('financial_daily');
      }
      financialHistory=remaining;sales=combinedFinancial(remaining);source=remaining.length?remaining.length+' saved financial reports':'No financial data imported';fixedCosts=0;financialRevision++;saveFinancialImport();render();
    }catch(error){alert(error instanceof Error?error.message:'Unable to update financial report history.');}
  }));
  document.querySelector<HTMLInputElement>('#file')!.addEventListener('change',async e=>{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
    try{if(file.size>200000)throw Error('File exceeds 200 KB.');if(financialHistory.length>=100)throw Error('Your financial report history contains 100 uploads. Remove an obsolete report before adding another.');const rows=parseCSV(await normalizeColumns(await file.text(),financialFields,'daily financial report'));financialRevision++;financialHistory.push({id:crypto.randomUUID(),uploadedAt:new Date().toLocaleDateString(),fileName:file.name,sales:rows});sales=combinedFinancial(financialHistory);source=financialHistory.length+' saved financial reports';fixedCosts=0;selectedInsight='revenue';const saved=saveFinancialImport();if(canSyncImports()){const targetScope=importedScope;void saveCloudImport('financial_daily',{sales,source,fixedCosts}).then(()=>{if(importedScope===targetScope){financialCloudStatus='SYNCED TO PRIVATE CLOUD';render();}}).catch(()=>{if(importedScope===targetScope){financialCloudStatus='OFFLINE / LOCAL COPY AVAILABLE';render();}});}render();if(!saved)alert('File imported for this session, but this browser could not store it for future visits.');}
    catch(err){alert(err instanceof Error?err.message:'Unable to read CSV');}
  });
  if(activePage==='data')renderCloverImport(document.querySelector<HTMLElement>('.clover-import')!, (getActiveUserId()??'signed-out')+':'+(getActiveBusinessId()??'personal'));
  if(activePage==='inventory')renderInventory(document.querySelector<HTMLElement>('.inventory-deck')!, (getActiveUserId()??'signed-out')+':'+(getActiveBusinessId()??'personal'));
  const beginConversation = () => openSorenConversation(s, source);
  document.querySelector<HTMLButtonElement>('#investigate-chat')?.addEventListener('click', beginConversation);
  document.querySelector<HTMLButtonElement>('#ask')!.addEventListener('click', beginConversation);
  addAccountToolbar();
  attachSorenLauncher(app,s,source);
}
window.addEventListener('popstate', () => { activePage = getPage(); render(); window.scrollTo(0,0); });
window.addEventListener('soren:business-changed', () => { render(); });
window.addEventListener('soren:clover-changed', () => { cloverScope='';render(); });
initAuth(app, render);
