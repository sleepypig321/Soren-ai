import './style.css';

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
  return records.map((r,i)=>{
    const field=(name:string)=>r[headers.indexOf(name)]?.trim()||'';
    const date=field('date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('Row '+(i+2)+': date must be YYYY-MM-DD.');
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
function render(){
  const s=summarize(sales);
  const latest=[...sales].sort((a,b)=>a.date.localeCompare(b.date));
  const high=latest.reduce((a,b)=>a.revenue>b.revenue?a:b);
  const low=latest.reduce((a,b)=>a.revenue<b.revenue?a:b);
  const max=Math.max(1,...latest.map(r=>r.revenue));
  const findings=[
    {title:s.operating<0?'Operating shortfall detected':'Positive modeled operating result',text:'Gross profit '+money(s.profit)+' minus entered fixed costs '+money(fixedCosts)+' = '+money(s.operating)+'. Other expenses are not provided.'},
    {title:'Sales variability',text:'Highest day '+escapeHTML(high.date)+' ('+money(high.revenue)+'); lowest day '+escapeHTML(low.date)+' ('+money(low.revenue)+'). Investigate staffing, inventory, events, and traffic before assigning a cause.'},
    {title:'Break-even scenario',text:s.breakEven===null?'Break-even cannot be calculated without positive gross margin.':'At the observed '+pct(s.margin)+' gross margin, modeled break-even revenue is '+money(s.breakEven)+'. This holds costs and product mix constant.'}
  ];
  app.innerHTML='<aside class="sidebar"><div class="brand"><span class="mark"><img src="/soren-icon.svg" alt="" width="42" height="42"/></span><span>SOREN<small>INTELLIGENCE WITH INTENTION</small></span></div><nav><a class="active" href="#overview">◈ &nbsp; Overview</a><a href="#investigation">◎ &nbsp; Investigation</a><a href="#data">▤ &nbsp; Data source</a></nav><div class="sidebar-foot"><span class="status-dot"></span> Local analysis active<small>Meta calls disabled · $0 spent</small></div></aside>'+
    '<main><header><div><p class="eyebrow">BUSINESS INTELLIGENCE / WORKSPACE 01</p><h1>Good to see you, partner.</h1><p class="muted">Let’s look at what the numbers actually say.</p></div><span class="pill">● DEMO MODE</span></header>'+
    '<section class="heading-row" id="overview"><div><h2>Performance overview</h2><p class="muted">'+escapeHTML(source)+' · '+s.days+' reporting days</p></div><button id="reset" class="button ghost">Reset sample</button></section>'+
    '<div class="metrics">'+
    [['Revenue',money(s.revenue),'Total recorded'],['Gross profit',money(s.profit),pct(s.margin)+' gross margin'],['Avg. transaction',money(s.average),s.transactions+' transactions'],['Modeled result',money(s.operating),'Before unlisted costs']].map((m,i)=>'<article class="metric"><p>'+m[0]+'</p><strong class="'+(i===3&&s.operating<0?'negative':'')+'">'+m[1]+'</strong><small>'+m[2]+'</small></article>').join('')+'</div>'+
    '<div class="columns"><section class="panel chart-panel"><div class="panel-top"><div><h3>Revenue by day</h3><p class="muted">Observed daily sales, not a forecast</p></div><span class="tag">USD</span></div><div class="chart">'+latest.map(r=>'<div class="bar-wrap" title="'+escapeHTML(r.date)+': '+money(r.revenue)+'"><div class="bar" style="height:'+Math.max(3,Math.round(r.revenue/max*100))+'%"></div></div>').join('')+'</div><div class="chart-label"><span>'+escapeHTML(latest[0].date)+'</span><span>'+escapeHTML(latest[latest.length-1].date)+'</span></div></section>'+
    '<section class="panel"><div class="panel-top"><div><h3>Financial assumptions</h3><p class="muted">Change inputs to recalculate instantly</p></div></div><label for="fixed">Fixed expenses for this reporting period ($)</label><input id="fixed" type="number" min="0" step="1" value="'+fixedCosts+'"/><p class="muted note">Costs of goods sold are already included in gross profit. Other variable expenses are not included.</p><div class="line"><span>Break-even revenue</span><b>'+(s.breakEven===null?'Unavailable':money(s.breakEven))+'</b></div><div class="line"><span>Recorded transactions</span><b>'+s.transactions+'</b></div></section></div>'+
    '<section class="panel investigation" id="investigation"><div class="panel-top"><div><p class="eyebrow">SOREN / INVESTIGATION 001</p><h3>Here’s what caught my attention.</h3></div><span class="tag">VERIFIED CALCULATIONS</span></div><div class="findings">'+findings.map((f,i)=>'<article><span class="number">0'+(i+1)+'</span><div><h4>'+f.title+'</h4><p>'+f.text+'</p></div></article>').join('')+'</div><div class="soren-voice"><strong>Soren says</strong><p>We’ve got numbers. Lovely. Now let’s not pretend they tell us everything. These are leads worth investigating—not proof of why a day performed well or badly.</p></div><button id="ask" class="button primary">Ask Soren for a strategy ↗</button><p id="ai-status" class="muted note" role="status">AI remains locked until a server-side spend guard is installed.</p></section>'+
    '<section class="panel upload" id="data"><div><h3>Bring your own data</h3><p class="muted">CSV columns: date, revenue, transactions, cogs. Use synthetic or data you are authorized to share.</p></div><label class="button ghost upload-button">Import CSV <input id="file" type="file" accept=".csv,text/csv" hidden/></label></section>'+
    '<footer>Prototype v0.1 · All insights use supplied data · No Meta API calls made</footer></main>';
  document.querySelector<HTMLInputElement>('#fixed')!.addEventListener('change',e=>{
    const n=Number((e.target as HTMLInputElement).value);
    if(Number.isFinite(n)&&n>=0&&n<=1e9){fixedCosts=n;render();}
  });
  document.querySelector('#reset')!.addEventListener('click',()=>{sales=[...demo];source='Synthetic sample';fixedCosts=1250;render();});
  document.querySelector<HTMLInputElement>('#file')!.addEventListener('change',async e=>{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
    try{if(file.size>200000)throw Error('File exceeds 200 KB.');sales=parseCSV(await file.text());source=file.name;render();}
    catch(err){alert(err instanceof Error?err.message:'Unable to read CSV');}
  });
  document.querySelector('#ask')!.addEventListener('click',async ()=>{
    const status=document.querySelector<HTMLElement>('#ai-status')!;status.textContent='Checking live intelligence availability...';
    try{
      const res=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({facts:s,question:'Identify three evidence-based growth opportunities.'})});
      const result=await res.json() as {error?:string;answer?:string};
      status.textContent=result.answer||result.error||'No response available.';
    }catch{status.textContent='Local preview only. Live AI is not deployed yet.';}
  });
}
render();
