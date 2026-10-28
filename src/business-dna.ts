import type { SupabaseClient } from '@supabase/supabase-js';

type Dna = {
  retail_type: string; locations: number; business_stage: string; monthly_revenue_goal: number | null;
  primary_goal: string; biggest_challenge: string; existing_attempts: string; communication_style: string;
};
const initial: Dna = {retail_type:'',locations:1,business_stage:'',monthly_revenue_goal:null,primary_goal:'',biggest_challenge:'',existing_attempts:'',communication_style:'direct'};
const esc = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const options = (selected:string, choices:string[]) => choices.map(v=>'<option value="'+esc(v)+'" '+(selected===v?'selected':'')+'>'+esc(v || 'Choose one')+'</option>').join('');

export async function openBusinessDNA(supabase:SupabaseClient,businessId:string,businessName:string) {
  document.querySelector('.dna-backdrop')?.remove();
  const layer=document.createElement('div');
  layer.className='dna-backdrop';
  layer.innerHTML='<section class="dna-dialog" role="dialog" aria-modal="true" aria-labelledby="dna-title"><button class="dna-close" type="button" aria-label="Close Business DNA">×</button><div class="dna-overline"><img src="/soren-dna.png" alt=""/> SOREN / RETAIL INTELLIGENCE</div><h2 id="dna-title">Let’s get to know <em>your business.</em></h2><p class="dna-description">I can work with incomplete information. I just won’t pretend it’s complete. — Soren</p><p class="dna-state" role="status">Retrieving private business profile…</p><div class="dna-body"></div></section>';
  document.body.append(layer);
  const status=layer.querySelector<HTMLElement>('.dna-state')!;
  const body=layer.querySelector<HTMLElement>('.dna-body')!;
  let busy=false;
  let previousFocus=document.activeElement as HTMLElement|null;
  const close=()=>{if(busy)return;document.removeEventListener('keydown',keyHandler);layer.remove();previousFocus?.focus();};
  const keyHandler=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='Tab'){const list=Array.from(layer.querySelectorAll<HTMLElement>('button,input,textarea,select')).filter(x=>!x.hasAttribute('disabled'));if(!list.length)return;const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  document.addEventListener('keydown',keyHandler);
  layer.querySelector('.dna-close')!.addEventListener('click',close);
  layer.addEventListener('click',e=>{if(e.target===layer)close();});
  layer.querySelector<HTMLButtonElement>('.dna-close')!.focus();
  try {
    const {data,error}=await supabase.from('business_dna').select('retail_type,locations,business_stage,monthly_revenue_goal,primary_goal,biggest_challenge,existing_attempts,communication_style').eq('business_id',businessId).maybeSingle();
    if(error)throw error;
    if(!layer.isConnected)return;
    const d:Dna={...initial,...(data||{})};
    status.textContent=data?'Your private retail profile is ready to edit.':'A fresh slate. Tell me what matters.';
    body.innerHTML='<form id="dna-form"><p class="dna-workspace">'+esc(businessName)+'</p>'+
      '<div class="dna-fields"><label>RETAIL CATEGORY<select name="retail_type">'+options(d.retail_type,['','General retail','Specialty retail','Apparel & accessories','Beauty & personal care','Grocery & convenience','Home goods','Electronics','Wellness','Other retail'])+'</select></label>'+
      '<label>STORE LOCATIONS<input name="locations" type="number" min="1" max="1000" step="1" required value="'+d.locations+'"/></label>'+
      '<label>BUSINESS STAGE<select name="business_stage">'+options(d.business_stage,['','Just opening','Early growth','Established','Turnaround','Expanding'])+'</select></label>'+
      '<label>MONTHLY REVENUE GOAL ($)<input name="monthly_revenue_goal" type="number" min="0" max="1000000000" step="0.01" placeholder="Optional" value="'+(d.monthly_revenue_goal??'')+'"/></label></div>'+
      '<label>TOP BUSINESS GOAL<textarea name="primary_goal" maxlength="500" rows="2" placeholder="What are we trying to accomplish?">'+esc(d.primary_goal)+'</textarea></label>'+
      '<label>BIGGEST CHALLENGE<textarea name="biggest_challenge" maxlength="800" rows="3" placeholder="What’s keeping you up at night?">'+esc(d.biggest_challenge)+'</textarea></label>'+
      '<label>WHAT HAVE YOU ALREADY TRIED?<textarea name="existing_attempts" maxlength="800" rows="2" placeholder="No point repeating something that already failed.">'+esc(d.existing_attempts)+'</textarea></label>'+
      '<label>HOW DIRECT SHOULD SOREN BE?<select name="communication_style">'+
      [['direct','Sharp & candid'],['balanced','Confident & balanced'],['gentle','Supportive & measured']].map(([v,t])=>'<option value="'+v+'" '+(d.communication_style===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<p class="dna-privacy">Only this account can edit this business profile. It stays separate from other businesses. Soren may use it to personalize his responses once live AI is enabled.</p>'+
      '<div class="dna-actions"><button class="dna-cancel" type="button">CANCEL</button><button class="dna-save" type="submit">SAVE BUSINESS DNA ↗</button></div></form>';
    const form=body.querySelector<HTMLFormElement>('#dna-form')!;
    form.querySelector('.dna-cancel')!.addEventListener('click',close);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const fd=new FormData(form);
      const locations=Number(fd.get('locations'));const goalRaw=String(fd.get('monthly_revenue_goal')||'');
      const goal=goalRaw===''?null:Number(goalRaw);
      if(!Number.isInteger(locations)||locations<1||locations>1000||goal!==null&&(!Number.isFinite(goal)||goal<0||goal>1e9)){status.textContent='Check the number of locations and revenue goal.';return;}
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){status.textContent='Your session expired. Please sign in again.';return;}
      busy=true;
      const save=form.querySelector<HTMLButtonElement>('.dna-save')!;
      save.disabled=true;save.textContent='SAVING…';status.textContent='Saving your private retail intelligence…';
      const record={business_id:businessId,owner_id:user.id,retail_type:String(fd.get('retail_type')||''),locations,business_stage:String(fd.get('business_stage')||''),monthly_revenue_goal:goal,primary_goal:String(fd.get('primary_goal')||'').trim(),biggest_challenge:String(fd.get('biggest_challenge')||'').trim(),existing_attempts:String(fd.get('existing_attempts')||'').trim(),communication_style:String(fd.get('communication_style')||'direct'),updated_at:new Date().toISOString()};
      const {error}=await supabase.from('business_dna').upsert(record,{onConflict:'business_id'});
      busy=false;save.disabled=false;save.textContent='SAVE BUSINESS DNA ↗';
      if(error){status.textContent='Unable to save: '+error.message;return;}
      status.textContent='Saved. Your retail business has a little more DNA now. Gorgeous.';
      window.dispatchEvent(new Event('soren:dna-updated'));
    });
  }catch(err){if(layer.isConnected)status.textContent='Unable to load profile: '+(err instanceof Error?err.message:'Please try again.');}
}
