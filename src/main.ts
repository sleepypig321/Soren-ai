import './style.css';
import { openSorenConversation, attachSorenLauncher } from './conversation';
import { initAuth, addAccountToolbar, getActiveBusinessId, getActiveUserId } from './auth';
import { investigateRetail } from './investigations';
import { renderInventory } from './inventory';
import { renderCloverImport } from './clover-import';

type Sale = { date: string; revenue: number; transactions: number; cogs: number };
const demo: Sale[] = [
  {date:'2026-10-01',revenue:124,transactions:7,cogs:73},{date:'2026-10-02',revenue:89,transactions:5,cogs:54},
  {date:'2026-10-03',revenue:151,transactions:9,cogs:89},{date:'2026-10-04',revenue:61,transactions:4,cogs:38},
  {date:'2026-10-05',revenue:137,transactions:8,cogs:81},{date:'2026-10-06',revenue:96,transactions:6,cogs:58},
  {date:'2026-10-07',revenue:174,transactions:10,cogs:101},{date:'2026-10-08',revenue:82,transactions:5,cogs:51},
  {date:'2026-10-09',revenue:112,transactions:7,cogs:68},{date:'2026-10-10',revenue:205,transactions:12,cogs:126},
  {date:'2026-10-11',revenue:56,transactions:3,cogs:36},{date:'2026-10-12',revenue:93,transactions:5,cogs:55},
  {date:'2026-10-13',revenue:160,transactions:9,cogs:94},{date:'2026-10-14',revenue:116,transactions:7,cogs:69}
];
let sales = [...demo];
let source = 'Synthetic sample';
let fixedCosts = 1250;
const app = document.querySelector<HTMLDivElement>('#app')!;
const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const pct = (n:number) => Number.isFinite(n) ? n.toFixed(1)+'%' : 'N/A';
const escapeHTML = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function parseCSV(text:string): Sale[] {
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
  const s=summarize(sales);
  const investigations=investigateRetail(sales,fixedCosts);
  const ordered=[...sales].sort((a,b)=>a.date.localeCompare(b.date));
  const high=ordered.reduce((a,b)=>a.revenue>b.revenue?a:b);
  const low=ordered.reduce((a,b)=>a.revenue<b.revenue?a:b);
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
  if(!options[selectedInsight])selectedInsight='revenue';
  const active=options[selectedInsight];
  const verdict=s.operating<0?'An operating gap deserves attention.':'The modeled result is positive.';
  const points=ordered.map((r,i)=>{
    const x=ordered.length===1?380:16+i*(748/(ordered.length-1));
    const max=Math.max(1,...ordered.map(d=>d.revenue));
    const y=166-(r.revenue/max)*132;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  const orbitItems=[
    ['revenue','REVENUE',money(s.revenue)],
    ['margin','GROSS MARGIN',pct(s.margin)],
    ['transactions','TRANSACTIONS',String(s.transactions)],
    ['costs','FIXED COSTS',money(fixedCosts)]
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
        '<div class="topline"><div class="wordmark">SOREN <span> / INTELLIGENCE WITH INTENTION</span></div><div class="top-meta"><span>WORKSPACE 001</span><span class="sep"></span><span class="demo-led">● SYNTHETIC DEMO · AI DISABLED</span></div></div>'+
        '<div class="hero-line"><div><p class="eyebrow">GOOD TO SEE YOU, PARTNER.</p><h1>Let’s find the <em>signal</em><br/>inside the noise.</h1></div><p class="hero-copy">Your business is a living system. Every figure is connected. Select a signal and follow the evidence.</p></div>'+
        '<div class="stage" id="intelligence"><section class="orbit-scene" aria-label="Interactive business intelligence map">'+
          '<div class="orbit-grid"></div><div class="orbital orbital-a"></div><div class="orbital orbital-b"></div><div class="orbital orbital-c"></div>'+
          '<div class="crosshair crosshair-one">+</div><div class="crosshair crosshair-two">+</div>'+
          '<div class="orbit-core" id="soren-core" role="button" tabindex="0" aria-label="Talk to Soren"><div class="core-aura"></div><div class="core-disc"><img src="/soren-dna.png" alt="Soren glowing DNA emblem"/></div><span class="core-label">SOREN / CORE</span></div>'+
          orbitItems.map(([id,label,value])=>'<button class="signal signal-'+id+(id===selectedInsight?' selected':'')+'" data-focus="'+id+'" aria-pressed="'+(id===selectedInsight)+'"><span class="signal-point"></span><span class="signal-caption">'+label+'</span><strong>'+value+'</strong></button>').join('')+
          '<div class="orbit-footer"><span>BUSINESS SYSTEM / '+s.days+' DAY WINDOW</span><span>04 CONNECTED SIGNALS</span></div>'+
        '</section>'+
        '<section class="intelligence-brief" aria-live="polite">'+
          '<div class="brief-top"><span class="mini-mark">✳</span><span>SOREN / LIVE BRIEFING</span><span class="muted-dot">● LOCAL</span></div>'+
          '<div class="brief-main"><div class="seq">01—04 / CURRENT FOCUS</div><p class="eyebrow">'+active.label+'</p><div class="focus-value">'+active.value+'</div><p class="focus-context">'+active.context+'</p><div class="brief-rule"></div>'+
          '<p class="brief-caption">WHAT THE DATA SAYS</p><p class="brief-body">'+active.evidence+'</p><p class="brief-caption">WHAT I WOULD INVESTIGATE</p><p class="brief-body">'+active.action+'</p></div>'+
          '<div class="brief-voice"><span class="voice-icon">S</span><p>“'+verdict+' We can investigate it, but we are absolutely not confusing a hypothesis with a fact.”</p></div>'+
          '<button class="strategy-button" id="ask">Develop a strategy <span>↗</span></button><p class="api-state" id="ai-status" role="status">Talk to Soren in local preview mode. Live Meta calls remain locked for credit safety.</p>'+
        '</section></div>'+
        '<section class="signal-floor" id="signals"><div class="section-title"><span class="section-index">02 / RETAIL INVESTIGATION DESK</span><h2>Let’s examine the evidence.</h2><p>'+escapeHTML(source)+' · '+s.days+' reporting rows · Calculations run locally · No Meta credits used</p></div>'+
          '<div class="pulse-chart"><svg viewBox="0 0 780 180" role="img" aria-label="Revenue trend across reporting days" preserveAspectRatio="none"><defs><linearGradient id="pulseGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7aa7ff" stop-opacity=".3"/><stop offset="1" stop-color="#7aa7ff" stop-opacity="0"/></linearGradient></defs><path d="M16 166 H764 M16 122 H764 M16 78 H764 M16 34 H764" fill="none" stroke="#7ca2eb" stroke-opacity=".12"/><polygon points="16,166 '+points+' 764,166" fill="url(#pulseGrad)"/><polyline points="'+points+'" fill="none" stroke="#98beff" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="pulse-axis"><span>'+escapeHTML(ordered[0].date)+'</span><span>'+escapeHTML(ordered[ordered.length-1].date)+'</span></div></div>'+
          '<div class="metric-band"><div><span>GROSS PROFIT</span><strong>'+money(s.profit)+'</strong></div><div><span>AVG. TRANSACTION</span><strong>'+money(s.average)+'</strong></div><div><span>MODELED RESULT</span><strong class="'+(s.operating<0?'loss':'')+'">'+money(s.operating)+'</strong></div><div><span>BREAK-EVEN REVENUE</span><strong>'+(s.breakEven===null?'N/A':money(s.breakEven))+'</strong></div></div>'+
          '<div class="investigation-intro"><div><span class="section-index">INVESTIGATION / 01</span><h3>What the numbers can—and cannot—tell us.</h3><p>Every finding shows its calculation, evidence limitations and a practical next step. That distinction matters, darling.</p></div><button id="investigate-chat" type="button">DISCUSS WITH SOREN ↗</button></div>'+
          '<div class="investigation-list">'+investigations.map((item,i)=>'<article class="investigation-card"><div class="investigation-meta"><span>FINDING '+String(i+1).padStart(2,'0')+'</span><span class="investigation-status '+item.status+'">'+(item.status==='watch'?'REVIEW':item.status==='positive'?'OBSERVED':'NEEDS CONTEXT')+'</span></div><div class="investigation-main"><h3>'+escapeHTML(item.label)+'</h3><strong>'+escapeHTML(item.metric)+'</strong></div><p class="investigation-observation">'+escapeHTML(item.observation)+'</p><details><summary>VIEW THE EVIDENCE & NEXT ACTION <span>＋</span></summary><div class="investigation-evidence"><p><b>CALCULATION</b>'+escapeHTML(item.calculation)+'</p><p><b>WHAT WE CANNOT CLAIM</b>'+escapeHTML(item.limitation)+'</p><p><b>NEXT ACTION</b>'+escapeHTML(item.nextStep)+'</p></div></details></article>').join('')+'</div>'+
          '<div class="investigation-boundary"><span>DATA BOUNDARY / 01</span><p>No product-level inventory, traffic, labor, customer identity or supplier records were provided. Soren will not invent a stockout, employee problem or retention trend without those inputs.</p></div>'+
        '</section>'+
        '<section class="inventory-deck" id="inventory" aria-label="Inventory intelligence"></section>'+
        '<section class="data-deck" id="data"><div class="data-heading"><span class="section-index">03 / DATA CONTROL</span><h2>Give me the right evidence.</h2><p>Import your own authorized CSV, or keep exploring the synthetic sample. Your file is processed locally.</p></div><div class="data-controls"><div><label for="fixed">FIXED EXPENSES / SAME PERIOD ($)</label><input id="fixed" type="number" min="0" step="1" value="'+fixedCosts+'"/><small>COGS is already accounted for. Other costs may be absent.</small></div><label class="import-button">IMPORT CSV ↑<input id="file" type="file" accept=".csv,text/csv" hidden/></label><button id="reset" class="reset-button">RESET SAMPLE ↺</button></div><p class="schema">CSV FORMAT: <code>date,revenue,transactions,cogs</code></p><section class="clover-import" aria-label="Clover daily import"></section></section>'+
        '<footer>© SOREN / PROTOTYPE 0.2 <span>INTELLIGENCE WITH INTENTION · META AI CURRENTLY DISABLED</span></footer>'+
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
    if(Number.isFinite(n)&&n>=0&&n<=1e9){fixedCosts=n;render();}
  });
  document.querySelector('#reset')!.addEventListener('click',()=>{sales=[...demo];source='Synthetic sample';fixedCosts=1250;selectedInsight='revenue';render();});
  document.querySelector<HTMLInputElement>('#file')!.addEventListener('change',async e=>{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
    try{if(file.size>200000)throw Error('File exceeds 200 KB.');sales=parseCSV(await file.text());source=file.name;selectedInsight='revenue';render();}
    catch(err){alert(err instanceof Error?err.message:'Unable to read CSV');}
  });
  if(activePage==='data')renderCloverImport(document.querySelector<HTMLElement>('.clover-import')!, (getActiveUserId()??'signed-out')+':'+(getActiveBusinessId()??'personal'));
  if(activePage==='inventory')renderInventory(document.querySelector<HTMLElement>('.inventory-deck')!, (getActiveUserId()??'signed-out')+':'+(getActiveBusinessId()??'personal'));
  const beginConversation = () => openSorenConversation(s, source);
  document.querySelector<HTMLButtonElement>('#investigate-chat')?.addEventListener('click', beginConversation);
  document.querySelector<HTMLButtonElement>('#ask')!.addEventListener('click', beginConversation);
  const core = document.querySelector<HTMLElement>('#soren-core')!;
  core.addEventListener('click', beginConversation);
  core.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); beginConversation(); } });
  addAccountToolbar();
  attachSorenLauncher(app,s,source);
}
window.addEventListener('popstate', () => { activePage = getPage(); render(); window.scrollTo(0,0); });
window.addEventListener('soren:business-changed', () => { render(); });
initAuth(app, render);
