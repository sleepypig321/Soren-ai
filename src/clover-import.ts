type Day={date:string;net:number;gross:number|null;discount:number|null};
type CloverReport={days:Day[];reportedNet:number;period:string;fileName:string};
let current:CloverReport|null=null;
let scope='';
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
  return {days,reportedNet,period,fileName};
}
export function renderCloverImport(container:HTMLElement,accountScope:string){
  if(scope!==accountScope){scope=accountScope;current=null;}
  const paint=()=>{
    const report=current;
    container.innerHTML='<div class="clover-heading"><div><span class="section-index">CLOVER / RETAIL DATA BRIDGE</span><h3>Bring your sales into the conversation.</h3><p>Upload Clover’s Daily Sales Report CSV without rearranging columns. Data stays in this browser session—never in the public repository.</p></div><label class="import-button">IMPORT CLOVER DAILY CSV ↑<input id="clover-upload" type="file" accept=".csv,text/csv" hidden/></label></div><p id="clover-feedback" class="clover-feedback" role="status"></p><div class="clover-results"></div>';
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
      results.innerHTML='<div class="clover-summary"><div><span>RECONCILED NET SALES</span><strong>'+money(report.reportedNet)+'</strong></div><div><span>REPORTING DAYS</span><strong>'+days.length+'</strong></div><div><span>LAST 7 VS PRIOR 7</span><strong>'+(variation===null?'N/A':(variation>=0?'+':'')+variation.toFixed(1)+'%')+'</strong></div></div>'+
        '<p class="clover-reconcile">✓ Sum of daily figures reconciles to the Clover report total. '+(last.date===today?'The current date is excluded from the seven-day comparison because it may be incomplete.':'Seven-day comparisons assume all reported days are complete.')+'</p>'+
        '<div class="clover-daily-chart" role="img" aria-label="Clover daily net sales bars">'+days.map(d=>'<div title="'+esc(d.date+': '+money(d.net))+'"><span style="height:'+Math.max(2,Math.max(0,d.net)/max*100)+'%"></span></div>').join('')+'</div>'+
        '<div class="clover-table-wrap"><table><thead><tr><th>DATE</th><th>NET SALES</th><th>GROSS SALES</th><th>DISCOUNTS</th></tr></thead><tbody>'+days.map(d=>'<tr><td data-label="DATE">'+d.date+'</td><td data-label="NET SALES">'+money(d.net)+'</td><td data-label="GROSS SALES">'+(d.gross===null?'N/A':money(d.gross))+'</td><td data-label="DISCOUNTS">'+(d.discount===null?'N/A':money(d.discount))+'</td></tr>').join('')+'</tbody></table></div>'+
        '<p class="clover-limit"><strong>What’s still unknown:</strong> This export has no daily transaction count or product cost data. Average basket, gross profit, break-even and inventory conclusions cannot be calculated from it. The existing financial demo remains separate rather than assuming missing values are zero.</p>';
    }else results.innerHTML='<p class="clover-empty">Waiting for an authorized Clover daily sales report. No data uploaded yet.</p>';
    container.querySelector<HTMLInputElement>('#clover-upload')!.addEventListener('change',async e=>{
      const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;
      const status=container.querySelector<HTMLElement>('#clover-feedback')!;
      try{if(f.size>500000)throw Error('File exceeds 500 KB.');const parsed=parse(await f.text(),f.name);current=parsed;paint();container.querySelector<HTMLElement>('#clover-feedback')!.textContent='Imported '+parsed.days.length+' reporting days from '+parsed.fileName+'.';}
      catch(err){status.textContent=err instanceof Error?err.message:'Could not read Clover report.';}
    });
  };
  paint();
}
