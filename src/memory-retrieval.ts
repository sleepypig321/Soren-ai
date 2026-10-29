export type BusinessMemory = { id:string; note:string };
const stopwords=new Set(['about','after','again','been','before','business','could','from','have','into','just','more','that','their','them','there','these','this','what','when','where','which','with','would','your','ours','were','will','does','then','than','they','some','show','tell','much','many']);
const terms=(value:string)=>new Set((value.toLowerCase().match(/[a-z]{4,}/g)??[]).filter(word=>!stopwords.has(word)).map(word=>word.replace(/(?:ing|ed|es|s)$/,'')));
const dateTagged=(note:string)=>/\b20\d{2}-\d{2}-\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+20\d{2})?/i.test(note);
/** Returns at most eight distinct, owner-supplied notes, balancing relevance and continuity.
 * Input is ordered newest first. No AI inference or persistent writes occur here.
 */
export function selectRelevantMemories<T extends BusinessMemory>(notes:T[],question:string,max=8):T[]{
  const selected:T[]=[];
  const seen=new Set<string>();
  const include=(note:T)=>{if(selected.length<max&&!seen.has(note.id)){seen.add(note.id);selected.push(note);}};
  const query=terms(question);
  // Preserve the most recent context even when the user changes topics.
  notes.slice(0,2).forEach(include);
  const ranked=notes.map((note,index)=>{
    const words=terms(note.note);
    let score=0;for(const word of query)if(words.has(word))score++;
    return {note,index,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
  ranked.slice(0,4).forEach(item=>include(item.note));
  // Dated operational milestones support evidence-based before/after investigations.
  notes.filter(note=>dateTagged(note.note)).slice(0,2).forEach(include);
  notes.forEach(include);
  return selected;
}
