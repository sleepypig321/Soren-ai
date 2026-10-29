import { supabase, getActiveBusinessId, getActiveBusinessName } from './auth';
import { loadCloudImport, currentImportScope } from './import-sync';

type Summary = { revenue:number; profit:number; margin:number; transactions:number; average:number; operating:number; days:number; breakEven:number|null };
type CloverDay = { date:string; net:number };
let activeCloverDays:CloverDay[]=[];
type CloverFacts = {
  kind:'clover';netSales:number;days:number;firstDate:string;lastDate:string;
  recent7:number|null;prior7:number|null;highest:{date:string;net:number};lowest:{date:string;net:number};
};
async function cloverFacts():Promise<CloverFacts|null>{
  activeCloverDays=[];
  const scope=currentImportScope();if(!scope)return null;
  let payload:unknown=null;
  try{payload=await loadCloudImport('clover_daily');}catch{/* Use a valid local copy if the network fails. */}
  if(!payload){try{const local=localStorage.getItem('soren:clover-daily:v1:'+scope);payload=local?JSON.parse(local):null;}catch{return null;}}
  const report=(payload as {report?:{days?:CloverDay[];reportedNet?:number}}|null)?.report;
  if(!report||!Array.isArray(report.days)||report.days.length<1||report.days.length>366||!Number.isFinite(report.reportedNet))return null;
  if(!report.days.every(d=>typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&Number.isFinite(d.net)))return null;
  const days=[...report.days].sort((a,b)=>a.date.localeCompare(b.date));
  activeCloverDays=days;
  if(Math.abs(days.reduce((n,d)=>n+d.net,0)-report.reportedNet!)>.02)return null;
  const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const complete=days.at(-1)?.date===today?days.slice(0,-1):days;
  const recent=complete.slice(-7),prior=complete.slice(-14,-7);
  const total=(list:CloverDay[])=>list.reduce((n,d)=>n+d.net,0);
  const highest=complete.length?complete.reduce((a,b)=>a.net>b.net?a:b):days[0];
  const lowest=complete.length?complete.reduce((a,b)=>a.net<b.net?a:b):days[0];
  return {kind:'clover',netSales:report.reportedNet!,days:days.length,firstDate:days[0].date,lastDate:days.at(-1)!.date,
    recent7:recent.length===7?total(recent):null,prior7:prior.length===7?total(prior):null,
    highest:{date:highest.date,net:highest.net},lowest:{date:lowest.date,net:lowest.net}};
}
type Line = { role:'user'|'soren'; text:string };
type Memory = { id:string; note:string };
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let activePanel:HTMLElement|null=null;
let teardown:(()=>void)|null=null;

function preview(q:string,f:Summary,clover:CloverFacts|null,previousUserQuestion=''):string {
  const followupPriority=/which (?:recommendation|one|step)|prioriti[sz]e first|what should i do first|why (?:that|first)/i.test(q);
  if(followupPriority&&/(sales|revenue|traffic|growth|customer|store)/i.test(previousUserQuestion))return 'Start with the lowest-cost diagnostic: investigate your weakest days for missing stock, hours, and staffing patterns before paying for promotions. Then test one consistent checkout add-on for seven days. Why first? It targets an operational problem you can check immediately, with little or no acquisition spend. Measure daily sales and, when available, transactions; we cannot yet claim which lever will produce the largest lift.';
  const dateMatch=q.match(/(?:since|from|starting|started|on)\s+(?:managing|working|the store|at the store|on)?\s*(?:on\s+)?(\d{4}-\d{2}-\d{2}|(?:October|Oct)\s+\d{1,2}(?:,?\s+\d{4})?)/i);
  if(clover&&dateMatch&&/(since|change|compared|before|after|started|managing)/i.test(q)){
    const rawDate=dateMatch[1];const iso=/^\d{4}-/.test(rawDate)?rawDate:(()=>{const m=rawDate.match(/(?:October|Oct)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);return m?(m[2]||'2026')+'-10-'+m[1].padStart(2,'0'):''})();
    const sorted=activeCloverDays.filter(d=>d.date<=clover.lastDate).sort((a,b)=>a.date.localeCompare(b.date));
    const post=sorted.filter(d=>d.date>=iso),before=sorted.filter(d=>d.date<iso).slice(-post.length);
    if(post.length&&before.length===post.length){const sum=(ds:CloverDay[])=>ds.reduce((n,d)=>n+d.net,0);const a=sum(before),b=sum(post);return 'From '+iso+' through '+post.at(-1)!.date+', reported net sales total '+money(b)+' across '+post.length+' reporting days. The immediately preceding '+before.length+' reported days total '+money(a)+'. '+(a===0?'The earlier period is zero, so a percentage comparison would mislead.':'That is '+((b/a-1)*100>=0?'+':'')+((b/a-1)*100).toFixed(1)+'% in equal-length reporting windows.')+' This is an association in timing, not proof that the management change caused it; confirm closures and promotions before attributing a cause.';}
    return 'I can locate '+iso+' in your question, but I cannot construct equal-length before-and-after windows from the available reported dates. I will not compare mismatched periods.';
  }
  const wantsGrowth=/(increase|boost|improve|grow|raise|drive|more|higher|sell more|upsell|bring in).{0,40}(sales|revenue|traffic|customers|orders|basket|transactions)|(?:sales|revenue|traffic|customers|orders|basket|transactions).{0,40}(increase|boost|improve|grow|higher|more)/i.test(q);
  if(clover&&wantsGrowth){
    const trend=clover.recent7!==null&&clover.prior7!==null&&clover.prior7!==0
      ?'Your last two complete seven-day windows show '+money(clover.recent7)+' versus '+money(clover.prior7)+' ('+((clover.recent7/clover.prior7-1)*100).toFixed(1)+'%). '
      :'I can see '+money(clover.netSales)+' in reported net sales, but not enough complete comparable weeks to quantify a trend. ';
    return 'Let’s make a sales plan, not throw discounts at the wall. '+trend+
      'First, review your weakest complete day ('+clover.lowest.date+', '+money(clover.lowest.net)+') for opening hours, stock gaps and promotions. '+
      'Second, test one simple add-on recommendation at checkout and track daily sales before and after—without claiming the test caused any change. '+
      'Third, run one locally targeted offer with a clear end date and measure its results. '+
      'We still need transaction counts to tell whether the issue is fewer purchases or smaller baskets. Do you have an orders-by-day export?';
  }
  if(clover){
    if(/profit|loss|cost|margin|expense|break.?even|inventory|stock/i.test(q))
      return 'I have '+money(clover.netSales)+' in reconciled Clover net sales across '+clover.days+' reporting days. Lovely. But we do not have verified COGS, operating expenses or inventory in this report, so I will not invent profit or stock conclusions. Which costs or records can we add next?';
    if(/best|highest|peak|worst|lowest|slowest|weakest/i.test(q))
      return 'Highest complete reported day: '+clover.highest.date+' ('+money(clover.highest.net)+'). Lowest: '+clover.lowest.date+' ('+money(clover.lowest.net)+'). That tells us what happened, not why. Were there changes in hours, promotions or stock availability?';
    if(/week|trend|growth|change|compare|up|down/i.test(q)){
      if(clover.recent7===null||clover.prior7===null)return 'I can see '+clover.days+' Clover reporting dates, but need two complete seven-day windows for a fair comparison. A partial week is not a trend, darling.';
      if(clover.prior7===0)return 'The earlier week had zero recorded net sales. A percentage change would be misleading, so let’s investigate whether the store was closed or the report was incomplete.';
      const change=(clover.recent7/clover.prior7-1)*100;
      return 'The latest seven complete days brought in '+money(clover.recent7)+' versus '+money(clover.prior7)+' for the previous seven: '+(change>=0?'+':'')+change.toFixed(1)+'%. That is an observed movement, not proof of a cause. What changed operationally?';
    }
    return 'I have your actual Clover report: '+money(clover.netSales)+' net sales from '+clover.firstDate+' through '+clover.lastDate+'. We can examine trends and daily extremes. Transactions, COGS and expenses are missing, so I will not present synthetic profit figures as real. Which question should we investigate first?';
  }
  if(wantsGrowth){
    return 'Here’s where I’d start: review low-performing days, check whether popular items are out of stock, and test one checkout add-on for a week. '+
      'You have '+f.transactions+' transactions across '+f.days+' days with '+money(f.average)+' average transaction value in this '+(f.days===14?'sample':'report')+'. '+
      'Track transaction count and average basket separately to see which lever moves; don’t assume a promotion is profitable without its costs. '+
      'Do you have an item-sales report so we can pick an add-on based on what customers actually buy?';
  }
  if(/break.?even|profit|loss|cost|expense|margin/i.test(q))
    return 'Evidence first: '+money(f.revenue)+' revenue, '+money(f.profit)+' gross profit ('+f.margin.toFixed(1)+'%), and '+money(f.operating)+' modeled operating result. Other operating expenses may be missing. What additional costs should we account for?';
  if(/sales|revenue|traffic|growth|customer|transaction/i.test(q))
    return 'We have '+f.transactions+' recorded transactions across '+f.days+' days, '+money(f.revenue)+' revenue, and '+money(f.average)+' average transaction value. None of those figures alone explains *why* sales changed. Do you have foot traffic or out-of-stock records?';
  return 'I can work with the facts in front of me, but the full Meta model is still in gated testing. We have '+money(f.revenue)+' recorded revenue and '+f.margin.toFixed(1)+'% gross margin. Ask me a focused question, or use “Remember: ...” to save a business fact.';
}
async function fetchHistory(userId:string,businessId:string|null):Promise<Line[]> {
  let query=supabase.from('conversation_messages').select('role,content').eq('user_id',userId).order('created_at',{ascending:false}).limit(50);
  query=businessId?query.eq('business_id',businessId):query.is('business_id',null);
  const {data,error}=await query;
  if(error)throw error;
  return (data??[]).reverse().map(row=>({role:row.role as Line['role'],text:row.content as string}));
}
async function fetchMemories(userId:string,businessId:string|null):Promise<Memory[]> {
  if(!businessId)return [];
  const {data,error}=await supabase.from('business_memories').select('id,note').eq('user_id',userId).eq('business_id',businessId).order('created_at',{ascending:false}).limit(20);
  if(error)throw error;
  return (data??[]) as Memory[];
}
async function saveLine(userId:string,businessId:string|null,line:Line) {
  const {error}=await supabase.from('conversation_messages').insert({user_id:userId,business_id:businessId,role:line.role,content:line.text.slice(0,4000)});
  if(error)throw error;
}
export function closeSorenConversation() { teardown?.(); }
export function attachSorenLauncher(root:HTMLDivElement,facts:Summary,source:string) {
  const button=document.createElement('button');
  button.type='button';
  button.className='soren-floating-launcher';
  button.setAttribute('aria-label','Open chat with Soren');
  button.title='Open chat with Soren';
  button.innerHTML='<img src="/soren-dna.png" alt=""/><span>CHAT WITH SOREN</span>';
  root.appendChild(button);
  button.addEventListener('click',()=>{void openSorenConversation(facts,source);});
}
export async function openSorenConversation(facts:Summary,source:string) {
  if(activePanel)return;
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){alert('Please sign in to speak with Soren.');return;}
  const userId=user.id;
  const businessId=getActiveBusinessId();
  const businessName=getActiveBusinessName();
  const clover=await cloverFacts();
  const displaySource=clover?'CLOVER / ACTUAL NET SALES':source;
  const displayDays=clover?.days??facts.days;
  const overlay=document.createElement('div');
  overlay.className='soren-conversation-backdrop';
  overlay.innerHTML=`<section class="soren-conversation" role="dialog" aria-modal="true" aria-labelledby="soren-conversation-title">
    <header class="soren-conversation-head"><img src="/soren-dna.png" alt=""/><div><p>SOREN / DIRECT CHANNEL</p><h2 id="soren-conversation-title">Let's talk strategy.</h2></div><button class="soren-conversation-close" aria-label="Close Soren conversation" type="button">×</button></header>
    <div class="soren-conversation-context"><span class="soren-conversation-dot"></span> <span class="conversation-context-business">${escape(businessName)}</span> <span>·</span> ${escape(displaySource)} <span>·</span> ${displayDays} DAYS</div>
    <div class="soren-memory-bar"><span>BUSINESS MEMORY <strong class="soren-memory-count">0</strong></span><button type="button" class="soren-memory-toggle">MANAGE MEMORY ↗</button></div>
    <section class="soren-memory-list" hidden><p>To save a fact, tell Soren: <strong>Remember: our busiest day is Saturday.</strong></p><div class="soren-memory-items"></div></section>
    <div class="soren-conversation-messages" aria-live="polite" aria-label="Soren conversation"></div>
    <form class="soren-conversation-form"><label for="soren-message">ASK SOREN</label><div class="soren-compose"><textarea id="soren-message" rows="2" maxlength="600" required placeholder="Ask about strategy—or say Remember: ..."></textarea><button type="submit" aria-label="Send message">↗</button></div></form>
    <p class="soren-conversation-note">Private history saved to your account · Memory belongs to this business · Model usage remains guarded</p>
  </section>`;
  document.body.appendChild(overlay);
  activePanel=overlay;
  const messages=overlay.querySelector<HTMLElement>('.soren-conversation-messages')!;
  const input=overlay.querySelector<HTMLTextAreaElement>('#soren-message')!;
  const submit=overlay.querySelector<HTMLButtonElement>('.soren-compose button')!;
  const memoryList=overlay.querySelector<HTMLElement>('.soren-memory-list')!;
  const memoryItems=overlay.querySelector<HTMLElement>('.soren-memory-items')!;
  const memoryCount=overlay.querySelector<HTMLElement>('.soren-memory-count')!;
  let lines:Line[]=[];
  let notes:Memory[]=[];
  let closed=false;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  function close(){
    closed=true;
    document.removeEventListener('keydown',onKey);
    window.removeEventListener('soren:auth-changed',onAuthChanged);
    overlay.remove();if(activePanel===overlay)activePanel=null;
    teardown=null;
  }
  teardown=close;
  document.addEventListener('keydown',onKey);
  overlay.querySelector('.soren-conversation-close')!.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  const onAuthChanged=()=>{void supabase.auth.getUser().then(({data})=>{if(!data.user||data.user.id!==userId)close();});};
  window.addEventListener('soren:auth-changed',onAuthChanged);
  function draw() {
    const visible:Line[]=[{role:'soren',text:"Good to see you, partner. What's on your mind?"},...lines];
    messages.innerHTML=visible.map(line=>'<article class="soren-line '+line.role+'"><span>'+(line.role==='soren'?'SOREN':'YOU')+'</span><p>'+escape(line.text)+'</p></article>').join('');
    messages.scrollTop=messages.scrollHeight;
  }
  function drawMemories() {
    memoryCount.textContent=String(notes.length);
    memoryItems.innerHTML=notes.length?notes.map(note=>'<div class="soren-memory-entry"><span>'+escape(note.note)+'</span><button type="button" data-forget="'+escape(note.id)+'" aria-label="Forget this memory">FORGET ×</button></div>').join(''):'<p>No saved memories for this business yet.</p>';
    memoryItems.querySelectorAll<HTMLButtonElement>('[data-forget]').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.dataset.forget!;
      button.disabled=true;
      const {error}=await supabase.from('business_memories').delete().eq('id',id).eq('user_id',userId);
      if(error){button.disabled=false;button.textContent='RETRY';return;}
      notes=notes.filter(note=>note.id!==id);drawMemories();
    }));
  }
  overlay.querySelector('.soren-memory-toggle')!.addEventListener('click',()=>{memoryList.hidden=!memoryList.hidden;});
  messages.innerHTML='<div class="soren-history-loading">Retrieving your private conversation…</div>';
  try{
    [lines,notes]=await Promise.all([fetchHistory(userId,businessId),fetchMemories(userId,businessId)]);
    if(closed)return;draw();drawMemories();
  }catch(error){
    if(closed)return;
    messages.innerHTML='<div class="soren-history-loading">Could not load private conversation history. Please close and retry.</div>';
    submit.disabled=true;return;
  }
  overlay.querySelector<HTMLFormElement>('.soren-conversation-form')!.addEventListener('submit',async event=>{
    event.preventDefault();
    const question=input.value.trim();
    if(!question||submit.disabled)return;
    submit.disabled=true;input.value='';
    const userLine:Line={role:'user',text:question};
    const previousUserQuestion=[...lines].reverse().find(line=>line.role==='user')?.text??'';
    const prior=lines.slice(-6).map(line=>({role:line.role==='soren'?'assistant':'user',content:line.text.slice(0,900)}));
    lines.push(userLine);draw();
    try{
      await saveLine(userId,businessId,userLine);
      let reply:string;
      const remembered=/^remember(?:\s+that)?\s*:?\s+(.+)$/i.exec(question);
      if(remembered){
        const full=remembered[1].trim();
        const split=full.match(/^(.+?\.)(?:\s+)(.+\?)$/);
        const note=(split?split[1]:full).replace(/\.$/,'').trim();
        const followup=split?split[2].trim():'';
        if(!businessId)reply='Create or select a business workspace first, then I can remember facts specifically for that business.';
        else if(!note||note.length>500)reply='Keep a memory between 1 and 500 characters, partner.';
        else{
          const {data,error}=await supabase.from('business_memories').insert({user_id:userId,business_id:businessId,note}).select('id,note').single();
          if(error)throw error;
          notes.unshift(data as Memory);drawMemories();
          reply='Noted. I saved that to '+businessName+' memory. You can review or delete it any time.'+(followup?' '+preview(note+'. '+followup,facts,clover,previousUserQuestion):'');
        }
      }else{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session)throw Error('Session expired. Please sign in again.');
        // Owner-owned Business DNA is context, never an instruction or an authorization source.
        let dnaContext:string[]=[];
        if(businessId){
          const {data:dna,error:dnaError}=await supabase.from('business_dna')
            .select('retail_type,locations,business_stage,monthly_revenue_goal,primary_goal,biggest_challenge,existing_attempts,communication_style')
            .eq('business_id',businessId).eq('owner_id',userId).maybeSingle();
          if(dnaError)throw dnaError;
          if(dna){
            const parts=[
              'Retail category: '+dna.retail_type,
              'Locations: '+dna.locations,
              'Stage: '+dna.business_stage,
              'Monthly revenue goal: '+(dna.monthly_revenue_goal??'not provided'),
              'Main goal: '+dna.primary_goal,
              'Current challenge: '+dna.biggest_challenge,
              'Previously tried: '+dna.existing_attempts,
              'Preferred tone: '+dna.communication_style
            ];
            dnaContext=[parts.slice(0,4).join(' | ').slice(0,500),parts.slice(4).join(' | ').slice(0,500)];
          }
        }
        const res=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},body:JSON.stringify({question,facts:clover??facts,history:prior,memories:[...dnaContext,...notes.map(note=>note.note)].slice(0,8)})});
        const response=await res.json() as {answer?:string;error?:string;demo?:boolean};
        if(res.status===503&&response.demo)reply=preview(question,facts,clover,previousUserQuestion);
        else if(res.ok&&response.answer)reply=response.answer;
        else reply=response.error||'Soren is temporarily unavailable.';
      }
      const line:Line={role:'soren',text:reply};
      lines.push(line);draw();
      await saveLine(userId,businessId,line);
    }catch(error){
      lines.push({role:'soren',text:'I couldn’t save or retrieve that message securely. '+(error instanceof Error?error.message:'Please try again.')});
      draw();
    }finally{submit.disabled=false;if(!closed)input.focus();}
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();overlay.querySelector<HTMLFormElement>('.soren-conversation-form')!.requestSubmit();}});
  input.focus();
}
