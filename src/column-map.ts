/** Conservative, auditable CSV column mapping shared by Soren importers.
 * Semantic fields must actually exist. Missing values are never manufactured.
 */
export type FieldSpec={key:string;label:string;aliases:string[];required?:boolean};
const normal=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
export function splitCsv(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];
    }else cell+=ch;
  }
  if(quoted)throw Error('CSV includes an unclosed quoted field.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
const quote=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
export async function normalizeColumns(raw:string,fields:FieldSpec[],title:string):Promise<string>{
  const rows=splitCsv(raw);
  if(rows.length<2)throw Error('The CSV needs a header and at least one data row.');
  const candidates=rows.slice(0,Math.min(20,rows.length-1));
  const score=(row:string[])=>fields.filter(f=>row.some(h=>[f.key,...f.aliases].some(a=>normal(a)===normal(h)))).length;
  const start=candidates.reduce((best,row,i)=>score(row)>score(rows[best])?i:best,0);
  const headers=rows[start].map(v=>v.replace(/^\uFEFF/,'').trim());
  const defaults=fields.map(f=>headers.findIndex(h=>[f.key,...f.aliases].some(a=>normal(a)===normal(h))));
  const unique=new Set(defaults.filter(i=>i>=0));
  const complete=fields.every((f,i)=>!f.required||defaults[i]>=0)&&unique.size===defaults.filter(i=>i>=0).length;
  const selection=complete?defaults:await chooseMapping(headers,fields,defaults,title);
  const output=[fields.map(f=>f.key)];
  for(const row of rows.slice(start+1)){
    if(!row.some(x=>x.trim()))continue;
    output.push(selection.map(i=>i>=0?row[i]??'':''));
  }
  if(output.length<2)throw Error('No data rows found below the header.');
  return output.map(row=>row.map(quote).join(',')).join('\r\n');
}
function chooseMapping(headers:string[],fields:FieldSpec[],suggested:number[],title:string):Promise<number[]>{
  return new Promise((resolve,reject)=>{
    const backdrop=document.createElement('div');backdrop.className='csv-map-backdrop';
    const dialog=document.createElement('section');dialog.className='csv-map-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','csv-map-title');
    const h=document.createElement('h2');h.id='csv-map-title';h.textContent='Match your '+title+' columns';
    const p=document.createElement('p');p.textContent='I recognized some columns. Review the suggestions below. Required information must be in the report; Soren will never fill it in with invented zeros.';
    const form=document.createElement('form');form.className='csv-map-form';
    const selects:HTMLSelectElement[]=[];
    for(const [index,f] of fields.entries()){
      const row=document.createElement('label');row.textContent=f.label+(f.required?' (required)':' (optional)');
      const select=document.createElement('select');select.setAttribute('aria-label',f.label);
      const empty=document.createElement('option');empty.value='-1';empty.textContent='Not in this report';select.append(empty);
      headers.forEach((header,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=header||'(blank header '+(i+1)+')';select.append(option);});
      select.value=String(suggested[index]??-1);selects.push(select);row.append(select);form.append(row);
    }
    const error=document.createElement('p');error.className='csv-map-error';error.setAttribute('role','alert');
    const actions=document.createElement('div');actions.className='csv-map-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='CANCEL';
    const confirm=document.createElement('button');confirm.type='submit';confirm.textContent='IMPORT MATCHED COLUMNS ↗';
    actions.append(cancel,confirm);form.append(error,actions);
    dialog.append(h,p,form);backdrop.append(dialog);document.body.append(backdrop);
    const previous=document.activeElement as HTMLElement|null;
    const cleanup=()=>{document.removeEventListener('keydown',onKey);backdrop.remove();previous?.focus();};
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){cleanup();reject(Error('Import cancelled.'));}};
    document.addEventListener('keydown',onKey);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop){cleanup();reject(Error('Import cancelled.'));}});
    cancel.addEventListener('click',()=>{cleanup();reject(Error('Import cancelled.'));});
    form.addEventListener('submit',e=>{
      e.preventDefault();const mapping=selects.map(s=>Number(s.value));
      const requiredMissing=fields.filter((f,i)=>f.required&&mapping[i]<0);
      if(requiredMissing.length){error.textContent='This report does not contain: '+requiredMissing.map(f=>f.label).join(', ')+'. Import the matching source report before running those calculations.';return;}
      const assigned=mapping.filter(i=>i>=0);
      if(new Set(assigned).size!==assigned.length){error.textContent='Each source column can only map to one field.';return;}
      cleanup();resolve(mapping);
    });
    selects[0]?.focus();
  });
}
