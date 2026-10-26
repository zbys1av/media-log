// MEDIA / LOG secure GitHub JSON sync — Cloudflare Worker (ES module).
// Never place GITHUB_TOKEN in frontend files or [vars].
const OWNER_EMAIL = 'zbyslav13@gmail.com';
const asJson = (value, status=200) => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const failure=(status,error)=>asJson({error},status);
const base64url=(s)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
function utf8b64(s){const bytes=new TextEncoder().encode(s);let b='';for(let i=0;i<bytes.length;i+=8192)b+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(b);}
function unb64(s){return new TextDecoder().decode(base64url(s.replace(/\s/g,'')));}
let keys=null,expires=0;
async function verifyIdentity(req,env){
 const a=/^Bearer\s+([^\s]+)$/i.exec(req.headers.get('authorization')||'');if(!a)throw Object.assign(new Error('Увійди через Google'),{status:401});
 const parts=a[1].split('.');if(parts.length!==3)throw Object.assign(new Error('Некоректний токен'),{status:401});
 let head,p;try{head=JSON.parse(unb64(parts[0]));p=JSON.parse(unb64(parts[1]));}catch{throw Object.assign(new Error('Некоректний токен'),{status:401});}
 if(head.alg!=='RS256'||!head.kid||!env.GOOGLE_CLIENT_ID)throw Object.assign(new Error('Google OAuth не налаштовано'),{status:401});
 if(!keys||Date.now()>expires){const r=await fetch('https://www.googleapis.com/oauth2/v3/certs');if(!r.ok)throw Error('Google keys unavailable');keys=(await r.json()).keys;expires=Date.now()+600000;}
 const jwk=keys.find(k=>k.kid===head.kid&&k.kty==='RSA');if(!jwk)throw Object.assign(new Error('Unknown Google key'),{status:401});
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 const now=Math.floor(Date.now()/1000);
 if(!ok||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.aud!==env.GOOGLE_CLIENT_ID||typeof p.exp!=='number'||p.exp<=now||typeof p.iat!=='number'||p.iat>now+120||p.email_verified!==true||String(p.email||'').toLowerCase()!==OWNER_EMAIL||!p.sub||(env.GOOGLE_ALLOWED_SUB&&p.sub!==env.GOOGLE_ALLOWED_SUB))throw Object.assign(new Error('Цей Google-акаунт не має прав запису'),{status:401});
 return {email:p.email,sub:p.sub};
}
function endpoint(env){if(!/^[\w.-]+$/.test(env.GITHUB_OWNER||'')||!/^[\w.-]+$/.test(env.GITHUB_REPO||''))throw Error('GitHub settings missing');return 'https://api.github.com/repos/'+encodeURIComponent(env.GITHUB_OWNER)+'/'+encodeURIComponent(env.GITHUB_REPO)+'/contents/data.json';}
async function github(env,method,body){
 if(!env.GITHUB_TOKEN)throw Error('GITHUB_TOKEN is not set in Worker Secrets');
 const url=endpoint(env)+(method==='GET'?'?ref='+encodeURIComponent(env.GITHUB_BRANCH||'main'):'');
 return fetch(url,{method,headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'MEDIA-LOG-Cloudflare-Worker',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
async function remote(env){
 const res=await github(env,'GET');if(res.status===404)return null;if(!res.ok)throw Error('GitHub GET '+res.status);
 const f=await res.json();if(f.type!=='file'||f.encoding!=='base64'||!f.sha)throw Error('Unexpected GitHub file');
 const data=JSON.parse(unb64(f.content));if(!Array.isArray(data?.records))throw Error('Invalid data.json');return {data,sha:f.sha};
}
export default {async fetch(req,env){
 const origin=req.headers.get('origin');const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
 if(origin&&origin!==allowed)return failure(403,'Origin not allowed');
 const cors={'vary':'Origin',...(origin?{'access-control-allow-origin':allowed,'access-control-allow-methods':'GET,PUT,OPTIONS','access-control-allow-headers':'Authorization,Content-Type','access-control-max-age':'600'}:{})};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const path=new URL(req.url).pathname;let result;
 try{
 if(path==='/health'&&req.method==='GET')result=asJson({ok:true,service:'media-log-github'});
 else if(path==='/data'&&req.method==='GET'){const f=await remote(env);result=f?asJson(f):failure(404,'data.json not found');}
 else if(path==='/me'&&req.method==='GET'){const user=await verifyIdentity(req,env);result=asJson({authorized:true,email:user.email});}
 else if(path==='/data'&&req.method==='PUT'){
   const user=await verifyIdentity(req,env);const text=await req.text();
   if(text.length>5000000)result=failure(413,'JSON too large');
   else {const body=JSON.parse(text);const data=body?.data;
     if(!data||!Array.isArray(data.records)||!Array.isArray(data.trackers)||typeof data.schemaVersion!=='number'||data.records.length>50000)result=failure(400,'Invalid MEDIA / LOG JSON');
     else {const prev=await remote(env);if((prev?.sha||null)!==(body.expectedSha||null))result=failure(409,'Cloud version changed — reload before saving');
     else {const change={message:'MEDIA / LOG · cloud save ('+data.records.length+' records)',content:utf8b64(JSON.stringify(data,null,2)+'\n'),branch:env.GITHUB_BRANCH||'main',...(prev?{sha:prev.sha}:{})};
      const out=await github(env,'PUT',change);
      if(out.status===409||out.status===422)result=failure(409,'GitHub conflict');
      else if(!out.ok)result=failure(502,'GitHub denied write ('+out.status+')');
      else {const body=await out.json();result=asJson({saved:true,sha:body.content?.sha,commit:body.commit?.sha,email:user.email});}
     }}
   }
 }else result=failure(404,'Not found');
 }catch(e){result=failure(e.status||(/SyntaxError/.test(e.name)?400:500),e.status?e.message:'Cloud synchronization error');}
 const h=new Headers(result.headers);for(const [k,v] of Object.entries(cors))h.set(k,v);return new Response(result.body,{status:result.status,headers:h});
}};