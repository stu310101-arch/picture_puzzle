import { validatePayload } from './puzzle-core.mjs';
import { shortenPublicURL, isDirectShortURL } from './shortener.mjs';
const codePattern = /^[A-Za-z0-9_-]{12}$/;
function allowed(origin: string, self: string) {
  if (origin === self || origin === 'null') return true;
  try { const u = new URL(origin); return (u.protocol === 'https:' && u.hostname.endsWith('.github.io')) || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)); } catch { return false; }
}
export async function puzzleApi(request: Request, env: any, ctx: any, fetcher: typeof fetch = fetch): Promise<Response | null> {
 const url = new URL(request.url), path = url.pathname;
 if (!path.startsWith('/p') && !path.startsWith('/s/')) return null;
 if (path !== '/p' && !/^\/(p|s)\/[A-Za-z0-9_-]{12}$/.test(path)) return new Response('Not found', {status:404});
 const origin = request.headers.get('Origin') || url.origin;
 const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Vary':'Origin', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
 const respond = (body: unknown, status=200) => Response.json(body, {status,headers});
 if (!allowed(origin,url.origin)) return new Response('Origin not allowed',{status:403});
 if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
 if (!env.DB || !env.BUCKET) return respond({error:'storage unavailable'},503);
 try {
  if (request.method === 'GET' && path !== '/p') {
   const id = path.split('/')[2]; if (!codePattern.test(id)) return respond({error:'invalid code'},400);
   const record = await env.DB.prepare('SELECT * FROM puzzles WHERE id = ?').bind(id).first();
   // Existing records also stay playable: the old expiry column is no longer enforced.
   if (!record) return respond({error:'not found'},404);
   if (path.startsWith('/s/')) return new Response(null, {status:302,headers:{...headers,Location:record.target+'#s='+id}});
   const payload = JSON.parse(record.metadata);
   if (record.image_key) { const object = await env.BUCKET.get(record.image_key); if (!object) return respond({error:'photo unavailable'},404); payload.image = await object.text(); }
   return respond({...payload, shareUrl:isDirectShortURL(record.short_url) ? record.short_url : null, expiresAt:null});
  }
  if (request.method !== 'POST' || path !== '/p') return respond({error:'method not allowed'},405);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({error:'JSON required'},415);
  if (Number(request.headers.get('Content-Length') || 0) > 155000) return respond({error:'too large'},413);
  const reader=request.body?.getReader(); if (!reader) return respond({error:'empty body'},400);
  const chunks: Uint8Array[]=[]; let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>155000){await reader.cancel();return respond({error:'too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  let data: any, payload: any;
  try { data=JSON.parse(new TextDecoder().decode(bytes));payload=validatePayload(data); } catch { return respond({error:'invalid puzzle'},400); }
  const now=Date.now(), minute=Math.floor(now/60000);
  const ip=request.headers.get('CF-Connecting-IP') || 'local';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+':'+minute));
  const key=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const limit=await env.DB.prepare('INSERT INTO limits (key,n,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n').bind(key,now+120000).first();
  if(limit.n>15) return respond({error:'too many requests'},429);
  const requestKey = typeof data.requestKey === 'string' && /^[a-zA-Z0-9-]{20,80}$/.test(data.requestKey) ? data.requestKey : null;
  let record = requestKey ? await env.DB.prepare('SELECT * FROM puzzles WHERE request_key = ?').bind(requestKey).first() : null;
  if (!record) {
   const id=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replaceAll('+','-').replaceAll('/','_');
   let target=url.origin+'/game/index.html';
   try {const proposed=new URL(data.target);if(proposed.protocol==='https:' && proposed.hostname.endsWith('.github.io') && !proposed.username && !proposed.password){proposed.hash='';proposed.search='';target=proposed.href;}}catch{}
   const imageKey=payload.image ? 'photos/'+id : null;
   if(imageKey){await env.BUCKET.put(imageKey,payload.image,{httpMetadata:{contentType:'text/plain'}});delete payload.image;}
   try {await env.DB.prepare('INSERT INTO puzzles (id,metadata,image_key,target,expires_at,request_key) VALUES (?,?,?,?,0,?)').bind(id,JSON.stringify(payload),imageKey,target,requestKey).run();}
   catch(error){
    if(imageKey) await env.BUCKET.delete(imageKey);
    record=requestKey ? await env.DB.prepare('SELECT * FROM puzzles WHERE request_key = ?').bind(requestKey).first() : null;
    if(!record) throw error;
   }
   record ||= {id,short_url:null};
  }
  ctx.waitUntil(env.DB.prepare('DELETE FROM limits WHERE expires_at < ?').bind(now).run().catch(()=>{}));
  // A retry reuses the saved puzzle. A shortener outage must never discard its photo.
  if(!isDirectShortURL(record.short_url)){
   try {
    record.short_url=await shortenPublicURL(url.origin+'/s/'+record.id,fetcher);
    await env.DB.prepare('UPDATE puzzles SET short_url=? WHERE id=?').bind(record.short_url,record.id).run();
   }catch{return respond({error:'SHORTENER_UNAVAILABLE',id:record.id},503);}
  }
  return respond({id:record.id,url:record.short_url,expiresAt:null},201);
 } catch {return respond({error:'service temporarily unavailable'},503);}
}
