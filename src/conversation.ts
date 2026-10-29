import { supabase, getActiveBusinessId, getActiveBusinessName } from './auth';
import { loadCloudImport, currentImportScope } from './import-sync';
import { selectRelevantMemories } from './memory-retrieval';

type Summary = { revenue:number; profit:number; margin:number; transactions:number; average:number; operating:number; days:number; breakEven:number|null };
type CloverDay = { date:string; net:number };
type CloverFacts = {
  kind:'clover';netSales:number;days:number;firstDate:string;lastDate:string;
  recent7:number|null;prior7:number|null;highest:{date:string;net:number};lowest:{date:string;net:number};
  monthly:{month:string;reportedDays:number;net:number}[];
  daily:{date:string;net:number}[];
  milestones:{date:string;note:string;beforeDays:number;afterDays:number;beforeNet:number;afterNet:number;changePct:number|null}[];
};
function dateInNote(note:string):string|null{
  const iso=note.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if(iso)return !Number.isNaN(Date.parse(iso[1]))?iso[1]:null;
  const named=note.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if(!named)return null;
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const month=months.findIndex(m=>named[1].toLowerCase().startsWith(m));
  const d=new Date(Date.UTC(Number(named[3]),month,Number(named[2])));
  return d.getUTCMonth()===month&&d.getUTCDate()===Number(named[2])?d.toISOString().slice(0,10):null;
}
async function cloverFacts(notes:{note:string}[]=[]):Promise<CloverFacts|null>{
  const scope=currentImportScope();if(!scope)return null;
  let payload:unknown=null;
  try{payload=await loadCloudImport('clover_daily');}catch{/* Use a valid local copy if the network fails. */}
  if(!payload){try{const local=localStorage.getItem('soren:clover-daily:v1:'+scope);payload=local?JSON.parse(local):null;}catch{return null;}}
  const report=(payload as {report?:{days?:CloverDay[];reportedNet?:number}}|null)?.report;
  if(!report||!Array.isArray(report.days)||report.days.length<1||report.days.length>10000||!Number.isFinite(report.reportedNet))return null;
  if(!report.days.every(d=>typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&Number.isFinite(d.net)))return null;
  const days=[...report.days].sort((a,b)=>a.date.localeCompare(b.date));
  if(Math.abs(days.reduce((n,d)=>n+d.net,0)-report.reportedNet!)>.02)return null;
  const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const complete=days.at(-1)?.date===today?days.slice(0,-1):days;
  const recent=complete.slice(-7),prior=complete.slice(-14,-7);
  const recentContinuous=recent.length===7&&recent.every((day,i)=>i===0||Date.parse(day.date+'T00:00:00Z')-Date.parse(recent[i-1].date+'T00:00:00Z')===86400000);
  const priorContinuous=prior.length===7&&prior.every((day,i)=>i===0||Date.parse(day.date+'T00:00:00Z')-Date.parse(prior[i-1].date+'T00:00:00Z')===86400000);
  const periodsAdjacent=recentContinuous&&priorContinuous&&Date.parse(recent[0].date+'T00:00:00Z')-Date.parse(prior[6].date+'T00:00:00Z')===86400000;
  const total=(list:CloverDay[])=>list.reduce((n,d)=>n+d.net,0);
  const highest=complete.length?complete.reduce((a,b)=>a.net>b.net?a:b):days[0];
  const lowest=complete.length?complete.reduce((a,b)=>a.net<b.net?a:b):days[0];
  const monthlyMap=new Map<string,{month:string;reportedDays:number;net:number}>();
  for(const day of complete){
    const month=day.date.slice(0,7);
    const previous=monthlyMap.get(month)??{month,reportedDays:0,net:0};
    previous.reportedDays++;previous.net+=day.net;monthlyMap.set(month,previous);
  }
  const byDate=new Map(complete.map(day=>[day.date,day.net]));
  const milestones=notes.flatMap(({note})=>{
    const date=dateInNote(note);if(!date)return [];
    const base=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(base))return [];
    const dates=(offset:number)=>new Date(base+offset*86400000).toISOString().slice(0,10);
    const before=Array.from({length:7},(_,i)=>byDate.get(dates(i-7))).filter((v):v is number=>v!==undefined);
    const after=Array.from({length:7},(_,i)=>byDate.get(dates(i))).filter((v):v is number=>v!==undefined);
    const beforeNet=before.reduce((n,v)=>n+v,0),afterNet=after.reduce((n,v)=>n+v,0);
    return [{date,note:note.slice(0,180),beforeDays:before.length,afterDays:after.length,beforeNet,afterNet,
      changePct:before.length===7&&after.length===7&&beforeNet>0?Math.round((afterNet/beforeNet-1)*1000)/10:null}];
  }).slice(0,5);
  return {kind:'clover',netSales:report.reportedNet!,days:days.length,firstDate:days[0].date,lastDate:days.at(-1)!.date,
    recent7:periodsAdjacent?total(recent):null,prior7:periodsAdjacent?total(prior):null,
    highest:{date:highest.date,net:highest.net},lowest:{date:lowest.date,net:lowest.net},
    monthly:[...monthlyMap.values()].slice(-24),daily:complete.slice(-60),milestones};
}
type Line = { role:'user'|'soren'; text:string };
type Memory = { id:string; note:string };
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Render a tiny, safe subset of chat Markdown after HTML-escaping all user/model text.
const formatChatText=(s:string)=>escape(s)
  .replace(/\\\*/g,'*')
  .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g,'$1<em>$2</em>')
  .replace(/(^|\n)[ \t]*[\*-][ \t]+/g,'$1• ');
let activePanel:HTMLElement|null=null;
let teardown:(()=>void)|null=null;

async function fetchHistory(userId:string,businessId:string|null):Promise<Line[]> {
  let query=supabase.from('conversation_messages').select('role,content').eq('user_id',userId).order('created_at',{ascending:false}).limit(50);
  query=businessId?query.eq('business_id',businessId):query.is('business_id',null);
  const {data,error}=await query;
  if(error)throw error;
  return (data??[]).reverse().map(row=>({role:row.role as Line['role'],text:row.content as string}));
}
async function fetchMemories(userId:string,businessId:string|null):Promise<Memory[]> {
  if(!businessId)return [];
  const {data,error}=await supabase.from('business_memories').select('id,note').eq('user_id',userId).eq('business_id',businessId).order('created_at',{ascending:false}).limit(30);
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
    <section class="soren-memory-list" hidden><p>To save a fact, tell Soren naturally: <strong>Remember that our busiest day is Saturday.</strong></p><div class="soren-memory-items"></div></section>
    <div class="soren-conversation-messages" aria-live="polite" aria-label="Soren conversation"></div>
    <form class="soren-conversation-form"><label for="soren-message">ASK SOREN</label><div class="soren-compose"><textarea id="soren-message" rows="2" maxlength="600" required placeholder="Ask about strategy—or tell Soren what to remember"></textarea><button type="submit" aria-label="Send message">↗</button></div></form>
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
    window.removeEventListener('soren:business-changed',onBusinessChanged);
    overlay.remove();if(activePanel===overlay)activePanel=null;
    teardown=null;
  }
  teardown=close;
  document.addEventListener('keydown',onKey);
  overlay.querySelector('.soren-conversation-close')!.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  const onAuthChanged=()=>{void supabase.auth.getUser().then(({data})=>{if(!data.user||data.user.id!==userId)close();});};
  window.addEventListener('soren:auth-changed',onAuthChanged);
  // Keep the open conversation scoped to the business that created it.
  const onBusinessChanged=()=>close();
  window.addEventListener('soren:business-changed',onBusinessChanged);
  function draw() {
    const visible:Line[]=[{role:'soren',text:"Good to see you, partner. What's on your mind?"},...lines];
    messages.innerHTML=visible.map(line=>'<article class="soren-line '+line.role+'"><span>'+(line.role==='soren'?'SOREN':'YOU')+'</span><p>'+formatChatText(line.text)+'</p></article>').join('');
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
    const prior=lines.slice(-4).map(line=>({role:line.role==='soren'?'assistant':'user',content:line.text.slice(0,500)}));
    lines.push(userLine);draw();
    try{
      await saveLine(userId,businessId,userLine);
      let reply:string;
      const remembered=/^(?:(?:hey\s+)?soren\s*[,!:]?\s*)?(?:please\s+)?remember(?:\s+that)?\s*:?\s+(.+)$/i.exec(question);
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
          reply='Noted. I saved that to '+businessName+' memory. You can review or delete it any time.'+(followup?' Ask your follow-up as a separate message so I can give you a real AI answer.':'');
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
        const relevantNotes=selectRelevantMemories(notes,question,6);
        const updatedClover=await cloverFacts(relevantNotes);
        const res=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},body:JSON.stringify({question,facts:updatedClover??(facts.days>0?facts:null),history:prior,memories:[...dnaContext,...relevantNotes.map(item=>item.note.slice(0,300))].slice(0,8)})});
        const response=await res.json() as {answer?:string;error?:string;demo?:boolean};
        if(res.ok&&response.answer)reply=response.answer;
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
