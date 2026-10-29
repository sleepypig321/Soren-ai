import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelevantMemories } from '../src/memory-retrieval.ts';
const note=(id,text)=>({id,note:text});

test('an older relevant decision is recalled despite many newer memories',()=>{
  const notes=[
    note('new1','We updated the store lights'),
    note('new2','The coffee machine is delayed'),
    ...Array.from({length:12},(_,i)=>note('other'+i,'General operating note '+i)),
    note('old','We changed the glass merchandise layout to improve visibility')
  ];
  const found=selectRelevantMemories(notes,'What did we do about glass merchandise?');
  assert.ok(found.some(x=>x.id==='old'));
  assert.ok(found.some(x=>x.id==='new1'));
  assert.ok(found.length<=8);
});

test('dated operational changes remain available for comparisons',()=>{
  const notes=[
    note('new1','The alarm was checked'),
    note('new2','Chris ordered supplies'),
    ...Array.from({length:12},(_,i)=>note('other'+i,'Routine note '+i)),
    note('dated','Rearranged the store on October 23, 2026')
  ];
  const found=selectRelevantMemories(notes,'How has sales changed?');
  assert.ok(found.some(x=>x.id==='dated'));
});

test('duplicates are never included and output is capped',()=>{
  const notes=Array.from({length:30},(_,i)=>note(String(i),'We sold products'));
  const found=selectRelevantMemories(notes,'sold products');
  assert.equal(found.length,8);
  assert.equal(new Set(found.map(x=>x.id)).size,8);
});
