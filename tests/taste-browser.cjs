// Isolated synthetic collection; all external requests are blocked, including sync.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),key='media-log-archive-v10-6-clean-20261026';
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/application\/json/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
const record=(id,category,extra={})=>({id,title:id,category,status:'done',rating:null,scale:100,tags:[],source:['Test'],history:[],...extra});
const data={records:[record('Actor movie','movie',{actors:['  TEST   Actor  '],watchHistory:[]}),record('Director only','movie',{directors:['Test Actor'],watchHistory:[]}),record('Season actor','tv',{seasons:[{name:'Season 1',actors:['test actor'],rating:60,viewings:[{id:'v1',rating:60,scale:100,date:'2025-01-01'}]}]}),record('Planned actor','movie',{status:'planned',wishlist:true,actors:['Test Actor']})],trackers:[],settings:{}};
data.records.push(...JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8')).records);
let browser;
(async()=>{
 console.log('Launching isolated Chrome');
 browser=await chromium.launch({headless:true,timeout:15000,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});let writes=0;const errors=[];
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(!['GET','HEAD'].includes(req.method()))writes++;
  if(url.origin!=='http://ux.test')return route.abort();
  if(url.pathname==='/data.json')return route.fulfill({json:data});
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','taste-model.js','atlas.js','atlas-model.js','atlas.css','cloud-config.js'].includes(name))return route.abort();
  let body=fs.readFileSync(path.join(root,name),'utf8');if(name==='index.html')body=body.replace(/(<script[^>]*id="initialData"[^>]*>)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data)+b);
  if(name==='index.html')body=body.replace('})();\n  </script>', 'Object.assign(window,{go,recordForm,rec,detail,migrateData,persist,ratingJourneyPoints,findBestPoster,applyAppearance,cloudInitGoogle,cloudConfig,db});})();\n  </script>');
  return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key,data});
 await page.goto('http://ux.test');await page.locator('#topAdd').waitFor();console.log('Loaded synthetic library');



 page.setDefaultTimeout(15000);
 await page.waitForFunction(()=>window.MediaTasteModel?.createPredictor(db.records).ready(),{timeout:30000});
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 const out=path.resolve(root,'..','taste-previews');fs.mkdirSync(out,{recursive:true});
 const snap=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),initial=await snap();
 const started=await page.evaluate(()=>({report:MediaTasteModel.createPredictor(db.records).report(),version:MediaTasteModel.VERSION}));assert.ok(started.report.models.selected.groups>200);
 await page.evaluate(()=>go('queue'));await page.locator('.atlas-prediction[data-taste-ready="true"]').first().waitFor();assert.match(await page.locator('.atlas-prediction').first().innerText(),/\/100/);
 await page.screenshot({path:path.join(out,'wishlist-dark.png'),fullPage:true,animations:'disabled'});
 await page.evaluate(()=>go('atlas'));await page.locator('[data-tab="wishlist"]').click();await page.locator('.atlas-quality').waitFor();await page.locator('.atlas-quality > summary').click();assert.match(await page.locator('.atlas-quality').innerText(),/Brier/);assert.match(await page.locator('.atlas-quality').innerText(),/Хронологічна/);
 await page.locator('.atlas-queue-card [data-open-record]').first().click();await page.locator('.atlas-prediction-detail > summary').click();assert.match(await page.locator('.atlas-taste-summary').innerText(),/Очікувана оцінка/);assert.match(await page.locator('.atlas-taste-summary').innerText(),/Модель/);
 await page.screenshot({path:path.join(out,'forecast-detail.png'),fullPage:true,animations:'disabled'});await page.locator('#modalRoot [data-action="close"]').first().click();

 assert.deepEqual((await snap()).records,initial.records);
 const ratedId=await page.evaluate(()=>{const r=db.records.find(r=>r.category==='movie'&&r.rating!=null);r.wishlist=true;persist();go('queue');return String(r.id);});
 await page.locator(`.atlas-prediction[data-id="${ratedId}"][data-taste-ready="true"]`).waitFor();assert.match(await page.locator(`.atlas-prediction[data-id="${ratedId}"]`).innerText(),/Історична перевірка/);
 console.log('PASS: self-excluding historical forecasts are also computed off the UI thread');

 // Updating ratings launches fresh local training; poster/wish changes leave the fingerprint intact.
 const cacheCheck=await page.evaluate(()=>{const before=MediaTasteModel.fingerprint(db.records),r=db.records.find(r=>r.rating!=null);r.wishlist=!r.wishlist;r.poster='https://invalid.test/poster';const unchanged=MediaTasteModel.fingerprint(db.records)===before;r.rating=0;persist();return {unchanged,changed:MediaTasteModel.fingerprint(db.records)!==before};});assert.ok(cacheCheck.unchanged&&cacheCheck.changed);
 await page.evaluate(()=>go('queue'));const frames=await page.evaluate(()=>new Promise(resolve=>{let n=0;function tick(){n++;if(MediaTasteModel.createPredictor(db.records).ready()||n>300)resolve(n);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));assert.ok(frames>=2);await page.waitForFunction(()=>MediaTasteModel.createPredictor(db.records).ready(),{timeout:30000});
 await page.reload();await page.locator('#topAdd').waitFor();await page.waitForFunction(()=>MediaTasteModel.createPredictor(db.records).ready(),{timeout:30000});
 await page.evaluate(()=>go('atlas'));await page.locator('[data-tab="wishlist"]').click();await page.locator('#themeToggle').click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,'quality-mobile-light.png'),fullPage:true,animations:'disabled'});
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS: actual taste module + local Blob Worker, nested metrics, expected score/probability/details, cache invalidation, zero-rating/reload, mobile/light, zero external writes');
 await context.close();
 const fileContext=await browser.newContext();await fileContext.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol!=='file:')return route.abort();const name=decodeURIComponent(u.pathname.split('/').at(-1));if(!['index.html','taste-model.js','atlas-model.js','atlas.js','atlas.css','cloud-config.js'].includes(name))return route.abort();let body=fs.readFileSync(path.join(root,name),'utf8');if(name==='index.html')body=body.replace(/(<script[^>]*id="initialData"[^>]*>)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data)+b);return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});});
 const filePage=await fileContext.newPage();await filePage.goto(require('node:url').pathToFileURL(path.join(root,'index.html')).href);await filePage.waitForFunction(()=>window.MediaTasteModel?.createPredictor(JSON.parse(document.getElementById('initialData').textContent).records).ready(),null,{timeout:30000});console.log('PASS: local Blob Worker training also works when opening index.html through file://');await fileContext.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
