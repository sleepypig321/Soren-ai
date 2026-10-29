export type RetailDay = { date:string; revenue:number; transactions:number; cogs:number };
export type Investigation = { id:string; label:string; status:'watch'|'positive'|'unknown'; metric:string; observation:string; calculation:string; limitation:string; nextStep:string };
const dollars=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const percent=(n:number)=>Number.isFinite(n)?n.toFixed(1)+'%':'N/A';
export function investigateRetail(rows:RetailDay[], fixedCosts:number):Investigation[] {
  if (!rows.length) return [{
    id:'coverage',label:'Data completeness',status:'unknown',metric:'NO DATA',
    observation:'No dated financial rows are available for this business workspace.',
    calculation:'No financial calculation can be made without recorded rows.',
    limitation:'Missing records are not evidence of zero revenue, zero costs or zero transactions.',
    nextStep:'Import a valid dated retail report before interpreting business performance.'
  }];
  const ordered=[...rows].sort((a,b)=>a.date.localeCompare(b.date));
  const total=(items:RetailDay[],key:'revenue'|'transactions'|'cogs')=>items.reduce((sum,row)=>sum+row[key],0);
  const revenue=total(ordered,'revenue'),transactions=total(ordered,'transactions'),cogs=total(ordered,'cogs');
  const grossProfit=revenue-cogs,margin=revenue?grossProfit/revenue:0;
  const result=grossProfit-fixedCosts;
  const avg=transactions?revenue/transactions:null;
  const first=ordered.slice(0,Math.floor(ordered.length/2));
  const last=ordered.slice(Math.floor(ordered.length/2));
  const earlyAverage=first.length?total(first,'revenue')/first.length:0;
  const lateAverage=last.length?total(last,'revenue')/last.length:0;
  const consecutive=ordered.every((row,i)=>i===0||Date.parse(row.date+'T00:00:00Z')-Date.parse(ordered[i-1].date+'T00:00:00Z')===86400000);
  const change=consecutive&&earlyAverage>0?((lateAverage/earlyAverage)-1)*100:null;
  const breakeven=margin>0?fixedCosts/margin:null;
  const low=ordered.reduce((a,b)=>a.revenue<b.revenue?a:b);
  const high=ordered.reduce((a,b)=>a.revenue>b.revenue?a:b);
  const dates=new Set(ordered.map(r=>r.date));
  const start=new Date(ordered[0].date+'T00:00:00Z').getTime();
  const end=new Date(ordered[ordered.length-1].date+'T00:00:00Z').getTime();
  const span=Math.round((end-start)/86400000)+1;
  const missing=Math.max(0,span-dates.size);
  const period='These fixed expenses must cover the same reporting period as the '+ordered.length+' sales rows.';
  return [
    {id:'trend',label:'Revenue momentum',status:change===null||ordered.length<4?'unknown':change< -10?'watch':'positive',
      metric:change===null||ordered.length<4?'INSUFFICIENT DATA':(change>=0?'+':'')+percent(change),
      observation:ordered.length<4?'At least four recorded days are needed for a meaningful first-half comparison.':!consecutive?'Reported days contain calendar gaps, so a continuous-period percentage comparison would be misleading.':change===null?'The initial comparison group had zero revenue, so a percentage change is undefined.':'The later '+last.length+' recorded day(s) averaged '+dollars(lateAverage)+'/day versus '+dollars(earlyAverage)+'/day across the first '+first.length+'.',
      calculation:ordered.length<4||!consecutive?'No valid continuous-period comparison.':'(Later group daily average ÷ earlier group daily average − 1) × 100.',
      limitation:'A short sample, day-of-week mix and missing days may distort this comparison. It does not establish why sales changed.',
      nextStep:'Check foot traffic, promotions, stock availability and staffing before attributing the shift to a cause.'},
    {id:'profit',label:'Operating pressure',status:result<0?'watch':'positive',metric:dollars(result),
      observation:'Gross profit is '+dollars(grossProfit)+' on '+dollars(revenue)+' sales. Entered fixed expenses are '+dollars(fixedCosts)+'.',
      calculation:dollars(revenue)+' revenue − '+dollars(cogs)+' COGS − '+dollars(fixedCosts)+' fixed costs = '+dollars(result)+'.',
      limitation:'This is a modeled result before unknown variable operating costs, taxes, financing and cash-flow timing. '+period,
      nextStep:result<0?'Verify costs and look for reversible ways to close the operating gap.':'Confirm omitted expenses and cash requirements before treating this as spendable profit.'},
    {id:'breakeven',label:'Break-even distance',status:breakeven===null?'unknown':revenue<breakeven?'watch':'positive',metric:breakeven===null?'N/A':dollars(breakeven),
      observation:breakeven===null?'Cannot compute a break-even point with zero calculated gross margin.':'At the observed '+percent(margin*100)+' gross margin, modeled break-even sales are '+dollars(breakeven!)+'.',
      calculation:breakeven===null?'Gross margin is 0%, so fixed costs cannot be recovered at this margin.':dollars(fixedCosts)+' fixed costs ÷ '+percent(margin*100)+' gross margin = '+dollars(breakeven!)+'.',
      limitation:'Assumes the same sales mix and margin at different revenue levels and no additional variable expenses. '+period,
      nextStep:'Stress-test price, costs, sales volume and the margin assumptions in a scenario.'},
    {id:'basket',label:'Basket economics',status:avg===null?'unknown':'positive',metric:avg===null?'N/A':dollars(avg),
      observation:transactions+' recorded transactions produced '+dollars(revenue)+' in revenue.',
      calculation:transactions?dollars(revenue)+' ÷ '+transactions+' transactions = '+dollars(avg!)+'.':'No transactions recorded: average transaction value is undefined.',
      limitation:'Transaction count is not unique customers; basket composition, conversion and retention are not available.',
      nextStep:'Investigate product pairings, add-on opportunities and customer traffic; validate margins before discounts.'},
    {id:'range',label:'Daily sales variability',status:'unknown',metric:dollars(low.revenue)+' — '+dollars(high.revenue),
      observation:'Lowest recorded day: '+low.date+' ('+dollars(low.revenue)+'). Highest: '+high.date+' ('+dollars(high.revenue)+').',
      calculation:'Observed high − low = '+dollars(high.revenue-low.revenue)+'.',
      limitation:'Variability is descriptive, not proof of seasonality, performance or causation.',
      nextStep:'Compare opening hours, traffic, events, inventory and staff coverage on those dates.'},
    {id:'coverage',label:'Data completeness',status:missing>0?'watch':'positive',metric:missing+' MISSING DAY'+(missing===1?'':'S'),
      observation:ordered.length+' distinct dates were supplied over a '+span+'-day calendar span.',
      calculation:span+' calendar days − '+dates.size+' dated records = '+missing+' gaps.',
      limitation:'Missing days may be legitimate closures, not missing data. Uploads do not establish the store was open on every date.',
      nextStep:missing?'Confirm whether missing dates were closed or excluded; backfill valid records where possible.':'Confirm the period and whether daily records include refunds or voids.'}
  ];
}
