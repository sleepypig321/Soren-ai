import { supabase, getActiveBusinessId, getActiveBusinessName } from './auth';

type Summary = { revenue:number; profit:number; margin:number; transactions:number; average:number; operating:number; days:number; breakEven:number|null };
type Line = { role:'user'|'soren'; text:string };
type Memory = { id:string; note:string };
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let activePanel:HTMLElement|null=null;
let teardown:(()=>void)|null=null;

function preview(q:string,f:Summary):string {
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
  const overlay=document.createElement('div');
  overlay.className='soren-conversation-backdrop';
  overlay.innerHTML=`<section class="soren-conversation" role="dialog" aria-modal="true" aria-labelledby="soren-conversation-title">
    <header class="soren-conversation-head"><img src="/soren-dna.png" alt=""/><div><p>SOREN / DIRECT CHANNEL</p><h2 id="soren-conversation-title">Let's talk strategy.</h2></div><button class="soren-conversation-close" aria-label="Close Soren conversation" type="button">×</button></header>
    <div class="soren-conversation-context"><span class="soren-conversation-dot"></span> <span class="conversation-context-business">${escape(businessName)}</span> <span>·</span> ${escape(source)} <span>·</span> ${facts.days} DAYS</div>
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
    const prior=lines.slice(-6).map(line=>({role:line.role==='soren'?'assistant':'user',content:line.text.slice(0,900)}));
    lines.push(userLine);draw();
    try{
      await saveLine(userId,businessId,userLine);
      let reply:string;
      if(/^remember\s*:/i.test(question)){
        const note=question.replace(/^remember\s*:/i,'').trim();
        if(!businessId)reply='Create or select a business workspace first, then I can remember facts specifically for that business.';
        else if(!note||note.length>500)reply='Keep a memory between 1 and 500 characters, partner.';
        else{
          const {data,error}=await supabase.from('business_memories').insert({user_id:userId,business_id:businessId,note}).select('id,note').single();
          if(error)throw error;
          notes.unshift(data as Memory);drawMemories();
          reply='Noted. I saved that to '+businessName+' memory. You can review or delete it any time.';
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
            dnaContext=parts.map(v=>v.slice(0,500));
          }
        }
        const res=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},body:JSON.stringify({question,facts,history:prior,memories:[...dnaContext,...notes.map(note=>note.note)].slice(0,8)})});
        const response=await res.json() as {answer?:string;error?:string;demo?:boolean};
        if(res.status===503&&response.demo)reply=preview(question,facts);
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
