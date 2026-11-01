export type GuardDatabase={
  prepare(query:string):{
    bind(...values:unknown[]):{first<T>():Promise<T|null>};
    first<T>():Promise<T|null>;
    run():Promise<unknown>;
  };
};
const CREATE_LIMITS=`CREATE TABLE IF NOT EXISTS ai_user_limits (
  user_id TEXT PRIMARY KEY,
  minute_bucket INTEGER NOT NULL,
  minute_count INTEGER NOT NULL,
  day_bucket INTEGER NOT NULL,
  day_count INTEGER NOT NULL
)`;
const RESERVE_LIMIT=`INSERT INTO ai_user_limits(user_id,minute_bucket,minute_count,day_bucket,day_count)
VALUES (?1,?2,1,?3,1)
ON CONFLICT(user_id) DO UPDATE SET
  minute_bucket=excluded.minute_bucket,
  minute_count=CASE WHEN ai_user_limits.minute_bucket=excluded.minute_bucket THEN ai_user_limits.minute_count+1 ELSE 1 END,
  day_bucket=excluded.day_bucket,
  day_count=CASE WHEN ai_user_limits.day_bucket=excluded.day_bucket THEN ai_user_limits.day_count+1 ELSE 1 END
WHERE (ai_user_limits.minute_bucket<>excluded.minute_bucket OR ai_user_limits.minute_count<3)
  AND (ai_user_limits.day_bucket<>excluded.day_bucket OR ai_user_limits.day_count<20)
RETURNING user_id`;
/** Persistent and atomic across Worker instances; identity must come from verified Auth. */
export async function reserveUserRequest(db:GuardDatabase,userId:string,now=Date.now()){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))throw Error('Invalid verified identity');
  await db.prepare(CREATE_LIMITS).run();
  const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
  const approved=await db.prepare(RESERVE_LIMIT).bind(userId,minute,day).first<{user_id:string}>();
  if(approved)return {allowed:true,retryAfter:0};
  const row=await db.prepare('SELECT minute_bucket,minute_count,day_bucket,day_count FROM ai_user_limits WHERE user_id=?1')
    .bind(userId).first<{minute_bucket:number;minute_count:number;day_bucket:number;day_count:number}>();
  const wait=row&&row.day_bucket===day&&row.day_count>=20?(day+1)*86400000-now:(minute+1)*60000-now;
  return {allowed:false,retryAfter:Math.max(1,Math.ceil(wait/1000))};
}
export class RequestInputError extends Error{
  status:number;
  constructor(message:string,status:number){super(message);this.status=status;}
}
/** Bound actual stream bytes before JSON parsing, including chunked or dishonest clients. */
export async function readChatJSON(request:Request):Promise<unknown>{
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){
    throw new RequestInputError('Content-Type must be application/json',415);
  }
  if(Number(request.headers.get('content-length')??0)>12000)throw new RequestInputError('Request too large',413);
  if(!request.body)throw new RequestInputError('Invalid request JSON',400);
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];let length=0;
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>12000){void reader.cancel().catch(()=>{});throw new RequestInputError('Request too large',413);}
      chunks.push(value);
    }
    const bytes=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{throw new RequestInputError('Invalid request JSON',400);}
  }finally{reader.releaseLock();}
}
