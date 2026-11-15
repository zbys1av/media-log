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


 const out=path.resolve(root,'..','previews');fs.mkdirSync(out,{recursive:true});
 const snap=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 await page.evaluate(()=>{db.records.push({id:'book-comments',category:'book',title:'Книга для перевірки',mark:'GOOD',status:'done',rating:70,scale:100,tags:[],source:[],bookHistoryInitialized:true,bookEvents:[{id:'old',date:'2024-01-01',startDate:'2023-12-01',endDate:'2024-01-01',rating:40,note:'Стара нотатка'},{id:'recent',date:'2025-01-01',rating:70}]});persist();detail('book-comments');});
 assert.equal(await page.locator('#modalRoot').getByText('Стара позначка',{exact:true}).count(),0);
 assert.equal(await page.locator('#modalRoot [data-action="rubric"][data-event]').count(),2);
 await page.locator('#modalRoot [data-action="rubric"][data-event="old"]').click();
 assert.match(await page.locator('#rubricForm').innerText(),/тільки обраного прочитання/);
 await page.locator('#rubricForm [data-criterion]').evaluateAll(nodes=>nodes.forEach(n=>{n.value='95';n.dispatchEvent(new Event('input',{bubbles:true}));}));
 await page.locator('#modalRoot button[type="submit"]').click();
 let book=(await snap()).records.find(r=>r.id==='book-comments');assert.equal(book.rating,70);assert.equal(book.bookEvents.length,2);assert.equal(book.bookEvents[0].rating,95);assert.equal(book.bookEvents[0].note,'Стара нотатка');assert.equal(book.bookEvents[0].startDate,'2023-12-01');assert.equal(book.mark,'GOOD');
 await page.locator('#modalRoot [data-action="rubric"][data-event="old"]').click();assert.equal(await page.locator('#rubricForm [data-criterion]').first().inputValue(),'95');await page.locator('#modalRoot [data-action="close"]').first().click();
 await page.evaluate(()=>detail('book-comments'));await page.locator('#modalRoot [data-action="rubric"][data-event="recent"]').click();await page.locator('#rubricForm [data-criterion]').evaluateAll(nodes=>nodes.forEach(n=>{n.value='0';n.dispatchEvent(new Event('input',{bubbles:true}));}));await page.locator('#modalRoot button[type="submit"]').click();
 book=(await snap()).records.find(r=>r.id==='book-comments');assert.equal(book.rating,0);assert.equal(book.bookEvents[0].rating,95);assert.equal(book.bookEvents.length,2);
 await page.reload();await page.locator('#topAdd').waitFor();book=(await snap()).records.find(r=>r.id==='book-comments');assert.equal(book.rating,0);assert.equal(book.mark,'GOOD');
 console.log('PASS: per-reading criteria edit, saved sliders, older/current/zero scores, periods/notes/mark preserved, reload');

 // Completed works stay in the catalogue as well as the queue; upcoming works remain queue-only.
 await page.evaluate(()=>{for(const category of ['movie','game','book'])db.records.push({id:'repeat-'+category,title:'Repeat '+category,category,status:'done',rating:75,scale:100,poster:'',favorite:true,date:'2025-01-01',tags:[],source:[]});db.records.push({id:'repeat-tv',title:'Repeat TV',category:'tv',status:'',rating:75,scale:100,tags:[],source:[],seasons:[{name:'Seen',status:'done',rating:75,viewings:[{id:'view',date:'2025-01-01',rating:75}]},{name:'Upcoming',status:'planned'}]});persist();});
 for(const category of ['movie','game','book','tv']){
  const id='repeat-'+category;
  await page.evaluate(({id,category})=>detail(id,category==='tv'?0:null),{id,category});
  const before=(await snap()).records.find(r=>r.id===id);
  await page.locator('#modalRoot [data-action="wishtoggle"]').click();await page.locator('#modalRoot [data-action="close"]').first().click();
  const after=(await snap()).records.find(r=>r.id===id);assert.equal(after.rating,before.rating);assert.equal(after.status,before.status);assert.equal(after.favorite,before.favorite);assert.equal(after.date,before.date);
  await page.evaluate(category=>go(category),category);await page.locator('#globalSearch').fill('Repeat '+(category==='tv'?'TV':category));const selector=`.item-card[data-id="${id}"]${category==='tv'?'[data-season="0"]':''}`;
  assert.equal(await page.locator(selector).count(),1);assert.match(await page.locator(selector+' .repeat-label').innerText(),/Заплановано повторно/);
  if(category==='tv')assert.equal(await page.locator('.item-card[data-id="repeat-tv"][data-season="1"]').count(),0);
  await page.evaluate(()=>go('queue'));await page.locator('#globalSearch').fill('Repeat '+(category==='tv'?'TV':category));assert.equal(await page.locator(selector).count(),1);
  await page.locator(selector).click();await page.locator('#modalRoot [data-action="wishtoggle"]').click();await page.locator('#modalRoot [data-action="close"]').first().click();assert.equal(await page.locator(selector).count(),0);
  await page.evaluate(category=>go(category),category);await page.locator('#globalSearch').fill('Repeat '+(category==='tv'?'TV':category));assert.equal(await page.locator(selector).count(),1);assert.equal(await page.locator(selector+' .repeat-label').count(),0);
 }
 console.log('PASS: repeat wishes stay in both lists for movies/books/games/seasons; badges clear on removal; planned season stays queue-only');
 await page.evaluate(()=>go('queue'));const badge=page.locator('.atlas-prediction').first();assert.match(await badge.innerText(),/Шанс, що тобі сподобається/);assert.match(await badge.innerText(),/поріг|твоя оцінка від 80/);
 await page.evaluate(()=>go('atlas'));await page.locator('.atlas-network').waitFor();assert.equal(await page.locator('.atlas-node:not(.hub)').count(),data.records.length+5);
 await page.screenshot({path:path.join(out,'graph-dark.png'),fullPage:true,animations:'disabled'});
 const sizes=await page.locator('.atlas-node').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.node,degree:Number(n.dataset.degree),radius:Number(n.querySelector('.node-mark').getAttribute('r'))})));
 const actualDegrees=await page.locator('.atlas-edge').evaluateAll(edges=>{const counts={};for(const e of edges)for(const id of [e.dataset.source,e.dataset.target])counts[id]=(counts[id]||0)+1;return counts;});
 for(const node of sizes)assert.equal(node.degree,actualDegrees[node.id]||0);
 const ranked=[...sizes].sort((a,b)=>a.degree-b.degree);for(let i=1;i<ranked.length;i++){assert.ok(ranked[i].radius>=ranked[i-1].radius);if(ranked[i].degree===ranked[i-1].degree)assert.equal(ranked[i].radius,ranked[i-1].radius);}
 assert.ok(ranked.at(-1).radius>=ranked.find(n=>n.degree===1).radius*3);
 const node=page.locator('.atlas-node.hub').first();await node.locator('.node-mark').click({force:true});assert.ok(await page.locator('.atlas-edge.active').count()>0);assert.ok(await page.locator('.atlas-node.selected').count()>0);
 const selectedId=await node.getAttribute('data-node'),expectedIds=await page.locator('.atlas-edge.active').evaluateAll((edges,id)=>[...new Set([id,...edges.flatMap(e=>[e.dataset.source,e.dataset.target])])].sort(),selectedId);
 assert.deepEqual((await page.locator('.atlas-node.related').evaluateAll(nodes=>nodes.map(n=>n.dataset.node))).sort(),expectedIds);
 await page.waitForFunction(()=>[...document.querySelectorAll('.atlas-node.related text')].every(n=>Number(getComputedStyle(n).opacity)===1));
 const unrelated=page.locator('.atlas-node:not(.related)').first();await unrelated.dispatchEvent('pointerover');assert.deepEqual((await page.locator('.atlas-node.related').evaluateAll(nodes=>nodes.map(n=>n.dataset.node))).sort(),expectedIds);
 await page.locator('.atlas-network').dispatchEvent('pointerleave');
 await page.locator('.atlas-graph-wrap').screenshot({path:path.join(out,'graph-selected-neighbors.png'),animations:'disabled'});
 console.log('PASS: node sizes follow actual link counts; all selected neighbors have visible labels; selection survives pointer movement');
 await page.locator('[data-zoom="in"]').click();assert.match(await page.locator('[data-viewport]').getAttribute('transform'),/1.25/);await page.locator('[data-zoom="reset"]').click();
 const count=await page.locator('.atlas-node').count();await page.locator('[data-relation="genres"]').click();assert.ok(await page.locator('.atlas-node').count()<count);
 await page.locator('#themeToggle').click();await page.screenshot({path:path.join(out,'graph-light.png'),fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'graph-mobile.png'),fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);

 const googleStyle=await page.evaluate(async()=>{
  const original=window.google,oldConfig={...cloudConfig},root=document.createElement('div');root.id='googleCloudSignIn';document.body.append(root);let result;
  window.google={accounts:{id:{initialize:o=>{if(typeof o.callback!=='function')throw Error('Missing original sign-in callback');},renderButton:(el,o)=>{result={...o};el.innerHTML='<button>Вхід через Google</button>';}}}};
  cloudConfig.apiUrl='https://mock.invalid';cloudConfig.googleClientId='test-client';
  try{await cloudInitGoogle();return {...result,containerWidth:root.getBoundingClientRect().width};}finally{root.remove();window.google=original;Object.assign(cloudConfig,oldConfig);}
 });
 assert.equal(googleStyle.width,260);assert.equal(googleStyle.containerWidth,260);assert.equal(googleStyle.shape,'rectangular');assert.equal(googleStyle.theme,'filled_black');console.log('PASS: official Google button presentation options, compact container, original callback retained (SDK stub, no sign-in)');
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS: clearer forecast, full collection graph, selection/links, zoom, relation filter, light/dark/mobile, zero external writes');
 await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
