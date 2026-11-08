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
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','atlas.js','atlas-model.js','atlas.css','cloud-config.js'].includes(name))return route.abort();
  let body=fs.readFileSync(path.join(root,name),'utf8');if(name==='index.html')body=body.replace(/(<script[^>]*id="initialData"[^>]*>)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(data)+b);
  return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key,data});
 await page.goto('http://ux.test');await page.locator('#topAdd').waitFor();console.log('Loaded synthetic library');
 const action=(name)=>page.locator(`#modalRoot [data-action="${name}"]`).first();
 const save=()=>page.locator('#modalRoot button[type="submit"]').click();
 const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 const field=(name)=>page.locator(`#modalRoot [name="${name}"]`);
 const tab=(name)=>page.locator(`#modalRoot [data-editor-tab="${name}"]`).click();
 const close=()=>action('close').click();
 const discard=()=>page.locator('[data-discard="discard"]').click();
 const open=async(title)=>{await page.locator('[data-go="home"]').first().evaluate(el=>el.click());await page.locator('#globalSearch').fill(title);await page.locator('.item-card').filter({hasText:title}).first().click();};
 // Clean close and backdrop, then dirty close/Escape retaining the original DOM.
 await page.locator('#topAdd').click();console.log('Testing clean modal');await page.locator('.modal-backdrop').click({position:{x:2,y:2}});assert.equal(await page.locator('#recordForm').count(),1);await close();assert.equal(await page.locator('#modalRoot form').count(),0);
 await page.locator('#topAdd').click();await field('title').fill('Unsaved');await page.keyboard.press('Escape');await page.locator('[data-discard="keep"]').click();assert.equal(await field('title').inputValue(),'Unsaved');await close();await page.keyboard.press('Escape');assert.equal(await field('title').inputValue(),'Unsaved');await page.keyboard.press('Control+n');await page.locator('[data-discard="keep"]').click();assert.equal(await field('title').inputValue(),'Unsaved');await close();await discard();
 // Create TV and immediately enter its optional first season.
 await page.locator('[data-go="tv"]').first().click();await page.locator('#topAdd').click();await field('title').fill('UX series');await field('addFirstSeason').check();await save();await page.locator('#seasonForm').waitFor();
 assert.equal(await page.locator('#discardPrompt').count(),0);await field('name').fill('First season');await field('releaseYear').fill('2025');await field('seasonStatus').selectOption('dropped');await field('droppedAtEpisode').fill('6');
 await tab('dates');await field('startDate').fill('2025-02-02');await field('endDate').fill('2025-01-01');await field('rating').fill('80');await save();assert.equal(await page.locator('#seasonForm').count(),1);await field('endDate').fill('2025-02-05');
 await tab('actors');await field('actors').fill('Test Actor');await tab('main');assert.equal(await field('name').inputValue(),'First season');await save();await action('seasonedit').waitFor();
 let saved=await snapshot(),series=saved.records.find(r=>r.title==='UX series');assert.equal(series.rating,80);assert.equal(series.seasons[0].droppedAtEpisode,6);assert.equal(series.seasons[0].actors[0].toLowerCase(),'test actor');
 assert.equal(await page.locator('#modalRoot [data-action="seasonedit"]').count(),1);
 // Edit context, add/edit/delete independent rewatch, preserve first score.
 await action('seasonedit').click();await field('name').fill('Renamed season');await save();assert.match(await page.locator('.detail-title').innerText(),/Renamed season/);
 await action('seasonviewnew').click();await field('startDate').fill('2026-02-01');await field('endDate').fill('2026-02-03');await field('rating').fill('90');await save();
 series=(await snapshot()).records.find(r=>r.title==='UX series');assert.deepEqual(series.seasons[0].viewings.map(v=>v.rating),[80,90]);assert.equal(series.rating,90);
 await action('seasonviewedit').click();await field('rating').fill('95');await save();series=(await snapshot()).records.find(r=>r.title==='UX series');assert.deepEqual(series.seasons[0].viewings.map(v=>v.rating),[80,95]);
 await action('seasonviewdelete').click();series=(await snapshot()).records.find(r=>r.title==='UX series');assert.deepEqual(series.seasons[0].viewings.map(v=>v.rating),[80]);assert.equal(series.rating,80);
 // Failed storage write leaves form values and allows retry without duplicate records.
 await close();await page.locator('#topAdd').click();await field('title').fill('Storage retry');await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};});await save();assert.equal(await page.locator('#recordForm').count(),1);assert.equal(await field('title').inputValue(),'Storage retry');await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);await save();assert.equal((await snapshot()).records.filter(r=>r.title==='Storage retry').length,1);await close();
 // Exact actor matching, including seasons/plans, excludes director names.
 await open('Actor movie');await page.locator('#modalRoot [data-facet="actor"]').click();assert.match(await page.locator('.insight-callout').innerText(),/4 записів/);assert.equal(await page.locator('.item-card[data-id="Director only"]').count(),0);assert.ok(await page.locator('.item-card[data-id="Season actor"]').count());await page.locator('[data-action="clearactor"]').click();assert.ok(await page.locator('.item-card[data-id="Director only"]').count());
 await open('Director only');await page.locator('#modalRoot [data-facet="creator"]').click();assert.ok(await page.locator('.item-card[data-id="Director only"]').count());
 // Shared protection also covers movie, game, book, tracker and settings editors.
 for(const cat of ['movie','game','book']){await page.locator(`[data-go="${cat}"]`).first().click();await page.locator('#topAdd').click();await field('title').fill('Keep '+cat);await close();await page.locator('[data-discard="keep"]').click();assert.equal(await field('title').inputValue(),'Keep '+cat);await close();await discard();}
 await open('UX series');await action('fromrecordtracker').click();await field('title').fill('Tracker draft');await page.keyboard.press('Escape');await discard();
 await open('UX series');await action('fromrecordtracker').click();await save();let tracked=(await snapshot()).trackers.find(t=>t.recordId===series.id);assert.ok(tracked);await page.locator(`[data-action="trackerepisode"][data-id="${tracked.id}"]`).first().click();tracked=(await snapshot()).trackers.find(t=>t.id===tracked.id);assert.equal(tracked.seasons[0].watched.length,1);
 await open('UX series');await action('seasonnew').click();await tab('dates');await field('rating').fill('60');await save();series=(await snapshot()).records.find(r=>r.title==='UX series');assert.equal(series.seasons.length,2);assert.equal(series.rating,70);await action('seasonedit').click();await field('name').fill('');await tab('actors');await save();assert.equal(await page.locator('[data-editor-pane="main"]').isVisible(),true);await field('name').fill('Second season');await save();await close();
 await page.locator('[data-go="settings"]').first().click();await page.locator('[data-action="settingstab"][data-tab="ratings"]').click();await page.locator('[data-action="moodnew"]').click();await field('moodName').fill('Custom');await close();await discard();
 // Layout in both themes; screenshots contain only synthetic records.
 const out=process.env.UX_ARTIFACTS||path.join(root,'..','ux-previews');fs.mkdirSync(out,{recursive:true});
 await open('UX series');await page.screenshot({path:path.join(out,'desktop-dark.png'),animations:'disabled'});await close();await page.locator('#themeToggle').click();await page.setViewportSize({width:390,height:844});await open('UX series');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await page.locator('.modal-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await page.screenshot({path:path.join(out,'mobile-light.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);assert.equal(writes,0);console.log('PASS: modal guards, TV/season creation/editing, validation/retry, rewatches, actor/director facets, shared editors, mobile/themes, zero external writes.');
 await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
