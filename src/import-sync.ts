import { supabase, getActiveUserId, getActiveBusinessId } from './auth';
import { createScopedWriteQueue } from './write-queue';

export type ImportKind = 'clover_daily' | 'financial_daily';

type ImportContext = { userId: string; businessId: string };
const context = (): ImportContext | null => {
  const userId=getActiveUserId(), businessId=getActiveBusinessId();
  return userId&&businessId?{userId,businessId}:null;
};
const writes=createScopedWriteQueue();
const keyFor=(c:ImportContext,kind:ImportKind)=>c.userId+':'+c.businessId+':'+kind;
export const canSyncImports = () => context()!==null;
export const currentImportScope = () => {
  const c=context();return c?c.userId+':'+c.businessId:null;
};
export async function loadCloudImport(kind:ImportKind):Promise<unknown|null>{
  const c=context();if(!c)return null;
  await writes.wait(keyFor(c,kind));
  const {data,error}=await supabase.from('retail_imports')
    .select('report').eq('user_id',c.userId).eq('business_id',c.businessId).eq('import_type',kind).maybeSingle();
  if(error)throw new Error('Cloud read unavailable: '+error.message);
  return data?.report??null;
}
export async function saveCloudImport(kind:ImportKind,payload:unknown):Promise<void>{
  const c=context();if(!c)throw new Error('Select a business workspace to sync your imports.');
  await writes.run(keyFor(c,kind),async()=>{
    const {error}=await supabase.from('retail_imports').upsert({
      user_id:c.userId,business_id:c.businessId,import_type:kind,report:payload,updated_at:new Date().toISOString()
    },{onConflict:'user_id,business_id,import_type'});
    if(error)throw new Error('Cloud save unavailable: '+error.message);
  });
}
export async function removeCloudImport(kind:ImportKind):Promise<void>{
  const c=context();if(!c)throw new Error('Select a business workspace.');
  await writes.run(keyFor(c,kind),async()=>{
    const {error}=await supabase.from('retail_imports').delete()
      .eq('user_id',c.userId).eq('business_id',c.businessId).eq('import_type',kind);
    if(error)throw new Error('Cloud removal unavailable: '+error.message);
  });
}
