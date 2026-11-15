// Isolated synthetic collection; all external requests are blocked, including sync.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),key='media-log-archive-v10-6-clean-20261026';
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/application\/json/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
const record=(id,category,extra={})=>({id,title:id,category,status:'done',rating:null,scale:100,tags:[],source:['Test'],history:[],...extra});
const data={records:[record('Actor movie','movie',{actors:['  TEST   Actor  '],watchHistory:[]}),record('Director only','movie',{directors:['Test Actor'],watchHistory:[]}),record('Season actor','tv',{seasons:[{name:'Season 1',actors:['test actor'],rating:60,viewings:[{id:'v1',rating:60,scale:100,date:'2025-01-01'}]}]}),record('Planned actor','movie',{status:'planned',wishlist:true,actors:['Test Actor']})],trackers:[],settings:{}};
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
  if(name==='index.html')body=body.replace('})();\n  </script>', 'Object.assign(window,{go,recordForm,rec,detail,migrateData,persist,ratingJourneyPoints,findBestPoster,applyAppearance,db});})();\n  </script>');
  return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key,data});
 await page.goto('http://ux.test');await page.locator('#topAdd').waitFor();console.log('Loaded synthetic library');

 const close=async()=>{const b=page.locator('#modalRoot [data-action="close"]').first();if(await b.count())await b.click();};
 const snap=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 // Full forms, real persistence, all types, defaults and manually selected states.
 for(const origin of ['queue','movie'])for(const cat of ['movie','tv','game','book'])for(const manual of [false,true]){
  const title=`Create ${origin} ${cat} ${manual}`;
  await page.evaluate(({origin,cat})=>{go(origin);recordForm(null,cat);},{origin,cat});
  const status=page.locator('#recordForm [name="status"]');
  if(origin==='queue')assert.equal(await status.inputValue(),'planned');
  if(manual&&await status.count())await status.selectOption('done');
  await page.locator('#recordForm [name="title"]').fill(title);
  await page.locator('#modalRoot button[type="submit"]').click();
  const r=(await snap()).records.find(r=>r.title===title);assert.ok(r);
  assert.equal(r.wishlist,origin==='queue');assert.equal(r.status,origin==='queue'?(manual?'done':'planned'):(manual&&cat!=='tv'?'done':''));
  await close();if(origin==='queue')assert.equal(await page.locator(`.item-card[data-id="${r.id}"]`).count(),1);
 }
 await page.reload();await page.locator('#topAdd').waitFor();assert.equal((await snap()).records.filter(r=>r.title.startsWith('Create queue')&&r.wishlist).length,8);
 console.log('PASS: wishlist creation for all four categories, explicit status choices, other origins, reload');
 for(const count of [2,4,20]){
  await page.evaluate(count=>{const r=rec('Actor movie');r.actors=Array.from({length:count},(_,i)=>'Actor '+i);detail(r.id);},count);
  const more=page.locator('.cast-more');assert.equal(await more.count(),count>4?1:0);
  assert.equal(await page.locator('#modalRoot [data-facet="actor"]:visible').count(),Math.min(4,count));
  if(count>4){await more.locator('summary').click();assert.equal(await page.locator('#modalRoot [data-facet="actor"]:visible').count(),count);await more.locator('summary').click();assert.equal(await page.locator('#modalRoot [data-facet="actor"]:visible').count(),4);}
  await close();
 }
 await page.evaluate(()=>{const r=rec('Season actor');r.wishlist=false;r.seasons.push({name:'Second',status:'done'});detail(r.id,0);});
 await page.locator('#modalRoot [data-action="wishtoggle"]').click();
 let series=(await snap()).records.find(r=>r.id==='Season actor');assert.equal(series.wishlist,false);assert.equal(series.seasons[0].wishlist,true);assert.equal(series.seasons[1].wishlist,undefined);assert.equal(series.seasons[0].rating,60);
 await page.locator('#modalRoot [data-action="wishtoggle"]').click();series=(await snap()).records.find(r=>r.id==='Season actor');assert.equal(series.seasons[0].wishlist,false);await close();
 // Exercise book migration, actual session editor, clearing and deletion, reload and journey points.
 await page.evaluate(()=>{db.records.push({id:'legacy',title:'Legacy book',category:'book',status:'done',rating:80,scale:100,bookHistoryInitialized:true,bookEvents:[{id:'legacy-book-legacy',rating:null,date:'2025-01-01'}],tags:[],source:[]});migrateData(db);persist();detail('legacy');});
 let legacy=(await snap()).records.find(r=>r.id==='legacy');assert.equal(legacy.bookEvents[0].rating,80);
 await page.locator('#modalRoot [data-action="booksessionnew"]').click();await page.locator('#bookSessionForm [name="rating"]').fill('0');await page.locator('#bookSessionForm [name="eventDate"]').fill('2026-01-01');await page.locator('#modalRoot button[type="submit"]').click();
 assert.equal((await snap()).records.find(r=>r.id==='legacy').rating,0);
 await page.locator('#modalRoot [data-action="booksessionnew"]').click();await page.locator('#bookSessionForm [name="eventDate"]').fill('2026-02-01');await page.locator('#modalRoot button[type="submit"]').click();assert.equal((await snap()).records.find(r=>r.id==='legacy').rating,0);
 await page.reload();await page.locator('#topAdd').waitFor();assert.equal(await page.evaluate(()=>ratingJourneyPoints(rec('legacy')).at(-1).value),0);
 await page.evaluate(()=>detail('legacy'));await page.locator('#modalRoot [data-action="booksessiondelete"]').first().click();assert.equal((await snap()).records.find(r=>r.id==='legacy').rating,0);
 await page.locator('#modalRoot [data-action="booksessiondelete"]').first().click();assert.equal((await snap()).records.find(r=>r.id==='legacy').rating,80);await close();
 await page.evaluate(()=>detail('legacy'));const beforeRubric=(await snap()).records.find(r=>r.id==='legacy').bookEvents.length;await page.locator('#modalRoot .primary-button[data-action="rubric"]').click();await page.locator('#rubricForm [data-criterion]').evaluateAll(nodes=>nodes.forEach(n=>{n.value='100';n.dispatchEvent(new Event('input',{bubbles:true}));}));await page.locator('#modalRoot button[type="submit"]').click();legacy=(await snap()).records.find(r=>r.id==='legacy');assert.equal(legacy.rating,100);assert.equal(legacy.bookEvents.length,beforeRubric+1);assert.equal(legacy.bookEvents.at(-1).rating,100);await close();
 console.log('PASS: cast 2/4/20, expand/collapse, independent season wishes, book recovery/session/zero/unscored/deletion/reload/journey');
 // Catalogue lookups are mocked, preserving source order and exact-match/no-result rules.
 const posterResults=await page.evaluate(async()=>{
  const original=window.fetch,seen=[];window.fetch=async url=>{seen.push(String(url));return {ok:true,json:async()=>String(url).includes('itunes')?{results:[]}:{query:{pages:{'-1':{missing:true}}}}};};
  try{for(const category of ['movie','tv','game','book']){const found=await findBestPoster({title:'Дилер & Witcher 3',category,releaseYear:2020});if(found)throw Error('unexpected poster');}return seen;}finally{window.fetch=original;}
 });
 for(const raw of posterResults){const u=new URL(raw);for(const key of ['q','term','titles'])if(u.searchParams.has(key))assert.equal(u.searchParams.get(key),'Дилер & Witcher 3');}
 for(const mode of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.evaluate(mode=>{go('home');db.settings.appearance.mode=mode;applyAppearance();},mode);
  assert.equal(await page.locator('.category-bar').count(),0);assert.equal(await page.locator('[data-action="pickcat"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS: title-only mocked catalogue queries, overview desktop/mobile, zero external writes and JS errors');
 await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
