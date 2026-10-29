import { normalizeColumns, type FieldSpec } from './column-map';
export type InventoryItem={sku:string;name:string;unitCost:number;price:number;onHand:number;sold30:number;reorderPoint:number;leadDays:number};
const demo:InventoryItem[]=[
{sku:'DEMO-101',name:'Sapphire Glass Piece',unitCost:21,price:49,onHand:4,sold30:18,reorderPoint:5,leadDays:7},
{sku:'DEMO-102',name:'Aurora Accessories Kit',unitCost:8,price:22,onHand:42,sold30:3,reorderPoint:6,leadDays:5},
{sku:'DEMO-103',name:'Midnight Storage Jar',unitCost:4,price:12,onHand:0,sold30:9,reorderPoint:7,leadDays:4},
{sku:'DEMO-104',name:'Premium Display Stand',unitCost:30,price:65,onHand:15,sold30:0,reorderPoint:3,leadDays:10},
{sku:'DEMO-105',name:'Cosmic Gift Set',unitCost:14,price:35,onHand:8,sold30:11,reorderPoint:5,leadDays:6},
{sku:'DEMO-106',name:'Travel Organizer',unitCost:6,price:18,onHand:25,sold30:5,reorderPoint:4,leadDays:5}
];
let items=[...demo];let source='Synthetic product catalog';let scope='';
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const marginPct=(i:InventoryItem)=>i.price>0?100*(i.price-i.unitCost)/i.price:null;
const unitGrossProfit=(i:InventoryItem)=>i.price-i.unitCost;
function csvRows(text:string){
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){row.push(cell);cell='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
  else cell+=ch;}
  if(quoted)throw Error('CSV contains an unclosed quoted value.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
function parse(text:string):InventoryItem[]{
  const records=csvRows(text);const headers=(records.shift()??[]).map(v=>v.trim().toLowerCase().replace(/^\uFEFF/,''));
  const required=['sku','name','unit_cost','price','on_hand','sold_30d'];
  if(required.some(k=>!headers.includes(k))){
    const observed=headers.filter(Boolean).slice(0,12).join(', ');
    throw Error('This looks like a sales/line-items export, not a complete inventory snapshot. A line-items report cannot tell us current on-hand stock or unit costs. Soren needs both item sales and an inventory export to calculate reorder needs. Detected columns: '+(observed||'none')+'.');
  }
  if(!records.length||records.length>2000)throw Error('Provide between 1 and 2,000 products.');
  const used=new Set<string>();
  return records.map((r,index)=>{
    const field=(k:string)=>r[headers.indexOf(k)]?.trim()??'';
    const sku=field('sku');const name=field('name');
    if(!sku||sku.length>90||!name||name.length>150||used.has(sku.toLowerCase()))throw Error('Row '+(index+2)+': invalid or duplicate SKU/name.');
    used.add(sku.toLowerCase());
    const numeric=(key:string,optionalDefault?:number)=>{const v=field(key);if(!v&&optionalDefault!==undefined)return optionalDefault;if(!v||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Row '+(index+2)+': invalid '+key+'.');return Number(v);};
    const unitCost=numeric('unit_cost'),price=numeric('price'),onHand=numeric('on_hand'),sold30=numeric('sold_30d'),reorderPoint=numeric('reorder_point',0),leadDays=numeric('lead_days',7);
    if(![onHand,sold30,reorderPoint,leadDays].every(Number.isInteger)||leadDays>365)throw Error('Row '+(index+2)+': quantities and lead days must be whole numbers (lead days ≤365).');
    return {sku,name,unitCost,price,onHand,sold30,reorderPoint,leadDays};
  });
}
const inventoryFields:FieldSpec[]=[
  {key:'sku',label:'SKU / Item ID',required:true,aliases:['item id','item code','product id','product code','sku number','stock keeping unit']},
  {key:'name',label:'Product name',required:true,aliases:['item','item name','product','product name','description','line item']},
  {key:'unit_cost',label:'Unit cost',required:true,aliases:['cost','cost per item','cost price','purchase cost','unit cost','buy price']},
  {key:'price',label:'Selling price',required:true,aliases:['unit price','retail price','sale price','selling price','item price']},
  {key:'on_hand',label:'Current on-hand units',required:true,aliases:['stock','stock on hand','on hand','quantity on hand','qty on hand','available quantity','inventory quantity','quantity in stock']},
  {key:'sold_30d',label:'Units sold in the past 30 days',required:true,aliases:['sold','sold last 30 days','30 day sales','qty sold','quantity sold','units sold','sales quantity']},
  {key:'reorder_point',label:'Reorder point',aliases:['reorder level','minimum stock','min stock','low stock threshold']},
  {key:'lead_days',label:'Supplier lead time in days',aliases:['lead time','lead time days','supplier lead days']}
];
function metrics(product:InventoryItem){
  const velocity=product.sold30/30;
  const cover=velocity>0?product.onHand/velocity:null;
  const reorder=product.onHand<=product.reorderPoint;
  const estimatedTarget=Math.ceil(velocity*(30+product.leadDays));
  const suggested=Math.max(0,estimatedTarget-product.onHand);
  const out=product.onHand===0;
  const slow=product.onHand>0&&product.sold30<=2;
  return {velocity,cover,reorder,suggested,out,slow};
}
export function renderInventory(root:HTMLElement,identityScope:string) {
  if(scope!==identityScope){scope=identityScope;items=[...demo];source='Synthetic product catalog';}
  function draw(){
    const value=items.reduce((sum,r)=>sum+r.onHand*r.unitCost,0);
    const out=items.filter(i=>i.onHand===0).length;
    const low=items.filter(i=>metrics(i).reorder&&i.onHand>0).length;
    const slow=items.filter(i=>metrics(i).slow).length;
    const danger=items.filter(i=>metrics(i).reorder).sort((a,b)=>a.onHand-b.onHand);
    const thinMargins=items.filter(i=>{const m=marginPct(i);return m!==null&&m<10;}).sort((a,b)=>marginPct(a)!-marginPct(b)!);
    const rankedMargins=items.filter(i=>i.price>0).sort((a,b)=>marginPct(b)!-marginPct(a)!);
    root.innerHTML='<div class="inventory-title"><div><span class="section-index">04 / STOCK INTELLIGENCE</span><h2>Inventory has a pulse, too.</h2><p>Know what is selling, what needs attention, and where your cash is sitting. Evidence before assumptions, darling.</p></div><span class="inventory-source">'+escape(source)+'</span></div>'+
      '<div class="inventory-stats"><div><span>AT-COST STOCK VALUE</span><strong>'+usd(value)+'</strong><small>On hand × unit cost</small></div><div><span>OUT OF STOCK</span><strong>'+out+'</strong><small>Zero units recorded</small></div><div><span>AT REORDER THRESHOLD</span><strong>'+low+'</strong><small>Excludes zero-stock items</small></div><div><span>LOW SALES VELOCITY</span><strong>'+slow+'</strong><small>0–2 units sold in 30 days</small></div></div>'+
      '<div class="inventory-margin-insight"><span class="section-index">PRODUCT MARGIN INTELLIGENCE</span><h3>Revenue is not the same as money kept.</h3><p>'+thinMargins.length+' product(s) have a recorded gross margin below 10%. This is a review threshold, not an automatic reason to discontinue them; transactions, payment fees and overhead are not included.</p><div class="inventory-margin-ranks"><div><b>LOW-MARGIN REVIEW</b>'+(thinMargins.length?thinMargins.slice(0,4).map(i=>'<p>'+escape(i.name)+': '+marginPct(i)!.toFixed(1)+'% margin · '+usd(unitGrossProfit(i))+' unit gross profit</p>').join(''):'<p>No entered product is below the 10% review threshold.</p>')+'</div><div><b>HIGHEST UNIT GROSS PROFIT</b>'+(rankedMargins.length?[...rankedMargins].sort((a,b)=>unitGrossProfit(b)-unitGrossProfit(a)).slice(0,4).map(i=>'<p>'+escape(i.name)+': '+usd(unitGrossProfit(i))+' per unit · '+marginPct(i)!.toFixed(1)+'% margin</p>').join(''):'<p>Enter selling prices and costs to compare products.</p>')+'</div></div><p class="inventory-margin-disclaimer">Gross margin = (price − unit cost) ÷ price. Price and cost must refer to comparable units and exclude sales tax. These rankings do not prove which products are commonly bought together or whether discontinuing an item would improve total profit.</p></div>'+
      '<div class="inventory-operations"><label class="import-button">IMPORT INVENTORY CSV ↑<input id="inventory-file" type="file" accept=".csv,text/csv" hidden/></label><button id="inventory-reset" type="button" class="reset-button">RESET SAMPLE ↺</button><small>Local analysis · No model credits · Data is not saved to your account</small></div>'+
      '<div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>SKU / PRODUCT</th><th>ON HAND</th><th>SOLD / 30 DAYS</th><th>STOCK COST</th><th>GROSS MARGIN</th><th>DAYS OF COVER</th><th>STATUS</th></tr></thead><tbody>'+items.map(i=>{const m=metrics(i);return '<tr><td data-label="PRODUCT"><strong>'+escape(i.name)+'</strong><small>'+escape(i.sku)+'</small></td><td data-label="ON HAND">'+i.onHand+'</td><td data-label="SOLD / 30 DAYS">'+i.sold30+'</td><td data-label="STOCK COST">'+usd(i.unitCost*i.onHand)+'</td><td data-label="GROSS MARGIN">'+(marginPct(i)===null?'N/A':marginPct(i)!.toFixed(1)+'%')+'</td><td data-label="DAYS OF COVER">'+(m.cover===null?'N/A':m.cover.toFixed(1))+'</td><td data-label="STATUS"><span class="inventory-pill '+(m.out?'out':m.reorder?'low':m.slow?'slow':'healthy')+'">'+(m.out?'OUT':m.reorder?'REORDER':m.slow?'SLOW':'ON TRACK')+'</span></td></tr>';}).join('')+'</tbody></table></div>'+
      '<div class="inventory-investigation"><div class="inventory-callout"><span class="section-index">STOCKOUT & REORDER INVESTIGATION</span><h3>Here’s where I’d look first.</h3><p>'+danger.length+' product(s) are at or below their entered reorder point. Those are review candidates, not automatic orders.</p></div>'+
      '<div class="inventory-priorities">'+(danger.length?danger.slice(0,5).map(i=>{const m=metrics(i);return '<article><div><strong>'+escape(i.name)+'</strong><span>'+escape(i.sku)+'</span></div><p>'+i.onHand+' on hand · '+i.sold30+' sold in 30 days · '+i.leadDays+' lead days</p><p>Illustrative 30-day replenishment target: <b>'+m.suggested+' additional units</b>. Based on constant daily demand and the entered lead time—not a purchase instruction.</p></article>';}).join(''):'<p>Nothing has crossed the supplied reorder points. Let’s not invent an emergency.</p>')+'</div></div>'+
      '<div class="inventory-boundary"><b>WHAT SOREN CANNOT KNOW YET</b><p>Sales from before the 30-day window, returns, purchase orders already in transit, actual supplier reliability, carrying costs, shelf life, seasonal demand and lost sales are not in this dataset. “Slow” means low recorded unit sales, not proven dead stock. Days of cover assumes the last 30 days represent future demand.</p></div>'+
      '<p class="inventory-schema">This importer expects an inventory snapshot, not a Clover line-items sales report. For Clover sales-only exports, we need to map the actual headers without inventing stock or costs. Template columns: <code>sku,name,unit_cost,price,on_hand,sold_30d</code> (optional: <code>reorder_point,lead_days</code>).</p>';
    root.querySelector<HTMLButtonElement>('#inventory-reset')!.addEventListener('click',()=>{items=[...demo];source='Synthetic product catalog';draw();});
    root.querySelector<HTMLInputElement>('#inventory-file')!.addEventListener('change',async e=>{
      const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
      try{if(file.size>500000)throw Error('File is larger than 500 KB.');const normalized=await normalizeColumns(await file.text(),inventoryFields,'inventory');const parsed=parse(normalized);items=parsed;source=file.name;draw();}
      catch(err){const status=document.createElement('p');status.className='inventory-error';status.setAttribute('role','alert');status.textContent=err instanceof Error?err.message:'Unable to read inventory CSV.';root.querySelector('.inventory-operations')!.append(status);}
    });
  }
  draw();
}
