import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { puzzleApi } from '../lib/puzzle-api.ts';
import { shortenPublicURL } from '../lib/shortener.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0000_daily_miss_america.sql','0001_lucky_loki.sql']) sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const files = new Map(), jobs = [];
  const env = {
    DB: { prepare(sql) { return { bind(...args) { const q=sqlite.prepare(sql); return { first:async()=>q.get(...args)||null, all:async()=>({results:q.all(...args)}),run:async()=>q.run(...args) }; } }; } },
    BUCKET: { put:async(k,v)=>files.set(k,v), delete:async k=>files.delete(k), get:async k=>files.has(k)?{text:async()=>files.get(k)}:null }
  };
  return {sqlite,env,files,ctx:{waitUntil:p=>jobs.push(p)},jobs};
}
const origin='https://tester.github.io', payload={v:1,title:'朋友的 1000 片',count:1000,image:'data:image/webp;base64,UklGRg==',target:origin+'/puzzle/',requestKey:'request-key-for-a-stable-puzzle'};
function request(path='/p',data=payload) { return new Request('https://puzzle.example'+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}); }
let destination;
const shortener=async (url,options)=> {
 if(url==='https://cleanuri.com/api/v1/shorten') {
  assert.equal(options.method,'POST'); destination=options.body.get('url');
  assert.match(destination,/^https:\/\/puzzle\.example\/s\/[A-Za-z0-9_-]{12}$/);
  return Response.json({result_url:'https://cleanuri.com/test12'});
 }
 assert.equal(url,'https://cleanuri.com/test12');assert.equal(options.redirect,'manual');
 return new Response(null,{status:302,headers:{Location:destination}});
};

test('new shares use a short domain, never expire, and preserve exact photo and count',async()=>{
 const f=fixture();const created=await puzzleApi(request(),f.env,f.ctx,shortener);assert.equal(created.status,201);
 const result=await created.json();assert.equal(result.url.length,27);assert.equal(result.expiresAt,null);
 const response=await puzzleApi(request('/p/'+result.id,null),f.env,f.ctx,shortener);
 const restored=await response.json();assert.equal(restored.image,payload.image);assert.equal(restored.count,1000);assert.equal(restored.shareUrl,result.url);
 const redirect=await puzzleApi(request('/s/'+result.id,null),f.env,f.ctx,shortener);assert.equal(redirect.headers.get('Location'),origin+'/puzzle/#s='+result.id);
 await Promise.all(f.jobs);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM puzzles').get().n,1);f.sqlite.close();
});
test('legacy records remain playable even after their old expiration date',async()=>{
 const f=fixture();f.sqlite.prepare('INSERT INTO puzzles(id,metadata,target,expires_at) VALUES(?,?,?,?)').run('abcdefghijkl',JSON.stringify({v:1,title:'舊挑戰',count:24,demo:true}),origin+'/',1);
 const response=await puzzleApi(request('/p/abcdefghijkl',null),f.env,f.ctx,shortener);
 assert.equal(response.status,200);assert.equal((await response.json()).expiresAt,null);f.sqlite.close();
});
test('shortener failures retain the photo, retries reuse one immutable puzzle',async()=>{
 const f=fixture();const bad=async()=>new Response('unavailable',{status:503});
 const failed=await puzzleApi(request(),f.env,f.ctx,bad);assert.equal(failed.status,503);const {id}=await failed.json();assert.equal(f.files.size,1);
 const retried=await puzzleApi(request('/p',{...payload,count:24}),f.env,f.ctx,shortener);assert.equal((await retried.json()).id,id);
 const original=await puzzleApi(request('/p/'+id,null),f.env,f.ctx,shortener);assert.equal((await original.json()).count,1000);
 const reused=await puzzleApi(request(),f.env,f.ctx,()=>{throw Error('cached URL should not call provider');});assert.equal(reused.status,201);
 assert.equal(f.files.size,1);await Promise.all(f.jobs);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM puzzles').get().n,1);f.sqlite.close();
});
test('shortener responses must come from the expected HTTPS short domain',async()=>{
 for(const value of ['javascript:alert(1)','https://evil.example/ab','https://cleanuri.com.evil.example/test12','https://da.gd/test12','<html>Error</html>'])await assert.rejects(shortenPublicURL('https://puzzle.example/s/test',async()=>Response.json({result_url:value})));
});

test('confirmation pages are rejected instead of being shared as direct links',async()=>{
 await assert.rejects(shortenPublicURL('https://puzzle.example/s/abcdefghijkl',async url=>url.includes('/api/')?Response.json({result_url:'https://cleanuri.com/test12'}):new Response('Confirm destination')),/SHORTENER_REQUIRES_CONFIRMATION/);
});
test('old provider URLs are not forwarded and are replaced on a share retry',async()=>{
 const f=fixture();const first=await puzzleApi(request(),f.env,f.ctx,shortener);const {id}=await first.json();
 f.sqlite.prepare('UPDATE puzzles SET short_url=? WHERE id=?').run('https://da.gd/old123',id);
 const old=await puzzleApi(request('/p/'+id,null),f.env,f.ctx,shortener);assert.equal((await old.json()).shareUrl,null);
 const renewed=await puzzleApi(request(),f.env,f.ctx,shortener);const result=await renewed.json();
 assert.equal(result.id,id);assert.equal(result.url,'https://cleanuri.com/test12');assert.equal(f.files.size,1);
 await Promise.all(f.jobs);f.sqlite.close();
});
