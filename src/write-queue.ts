/** Serializes writes for one private business/import key. A failed write does not block later attempts. */
export function createScopedWriteQueue(){
  const pending=new Map<string,Promise<void>>();
  const wait=(key:string)=>pending.get(key)??Promise.resolve();
  const run=<T>(key:string,operation:()=>Promise<T>):Promise<T>=>{
    const prior=wait(key);
    const result=prior.catch(()=>{}).then(operation);
    const settled=result.then(()=>{},()=>{});
    pending.set(key,settled);
    void settled.then(()=>{if(pending.get(key)===settled)pending.delete(key);});
    return result;
  };
  return {run,wait};
}
