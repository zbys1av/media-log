const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../atlas-model.js');
const fixture=(id,category='movie',extra={})=>({id,title:id,category,rating:null,scale:100,tags:[],seasons:[],watchHistory:[],...extra});
test('all cards, isolated nodes, season union, unique genre membership and zero scores',()=>{
 const raw=[fixture('a','tv',{genre:'Drama / drama',seasons:[{genre:'Drama, Sci-Fi',creator:'A, B'},{genre:'Drama',creator:'B'}]}),fixture('b','book',{rating:0}),fixture('c','movie',{rating:'invalid'})];
 const before=JSON.stringify(raw),items=M.records(raw),graph=M.graph(items);
 assert.deepEqual(items[0].genres,['Drama','Sci-Fi']);assert.deepEqual(items[0].directors,['A','B']);assert.equal(items[1].rating,0);assert.equal(items[2].rating,null);
 assert.equal(graph.nodes.filter(n=>n.kind==='record').length,3);assert.equal(graph.edges.length,4);assert.equal(M.groups(items,'genres')[0].count,1);
 assert.equal(M.filter(items,{minimum:1}).length,0);assert.equal(JSON.stringify(raw),before);
});
test('category-specific averages, pair intersections, strict dates, histories without duplicate fallback',()=>{
 const items=M.records([fixture('a','movie',{genre:'Drama, Action',rating:100,status:'done',date:'2025-05-01',watchHistory:[{date:'2024-02-29',rating:60,scale:100},{date:'2025-05-01',rating:100,scale:100},{date:'2025-02-30',rating:99}]}),fixture('b','book',{genre:'Drama',rating:20}),fixture('c','movie',{genre:'Action',rating:0})]);
 const drama=M.groups(items,'genres',true).filter(g=>g.name==='Drama');assert.deepEqual(drama.map(g=>g.average).sort((a,b)=>a-b),[20,100]);
 const pairs=M.genrePairs(items).cells.find(c=>c.a==='Drama'&&c.b==='Action');assert.equal(pairs.items.length,1);
 assert.equal(M.events(items).length,2);assert.equal(M.journeys(items)[0].delta,40);assert.equal(M.validDate('2025-02-30'),'');
});
test('series histories are compared within each season, not between seasons',()=>{
 const items=M.records([fixture('tv','tv',{rating:80,seasons:[{name:'S1',viewings:[{date:'2023-01-01',rating:80},{date:'2024-01-01',rating:90}]},{name:'S2',rating:10,status:'done',date:'2025-01-01'}]})]);
 assert.equal(M.journeys(items).length,1);assert.equal(M.journeys(items)[0].delta,10);assert.deepEqual(M.opinions(items[0]),[80,90,10]);
});
test('recommendations follow taste, exclude own ratings/IMDb, and reveal missing evidence',()=>{
 const raw=Array.from({length:16},(_,i)=>fixture('rated'+i,'movie',{rating:i<8?95:35,genre:i<8?'Sci-Fi':'Horror',creator:i<8?'Liked director':'Other director'}));
 raw.push(fixture('target-good','movie',{genre:'Sci-Fi',creator:'Liked director',rating:1,imdb:{rating:10}}),fixture('target-bad','movie',{genre:'Horror',creator:'Other director'}),fixture('unknown'));
 let items=M.records(raw),predict=M.predictor(items),good=predict(items[16]);assert.ok(good.chance>predict(items[17]).chance);assert.equal(predict(items[18]).personalized,false);assert.equal(predict(items[18]).chance,predict(items[18]).baseline);assert.ok(good.chance>0&&good.chance<100);assert.ok(good.matches.every(m=>m.r.id!=='target-good'));
 raw[16].rating=100;raw[16].imdb.rating=0;items=M.records(raw);assert.equal(M.predictor(items)(items[16]).chance,good.chance);
 assert.equal(M.predictor(items.slice(0,3))(items[16]).chance,null);
});
test('archive/wishlist tags do not create spurious taste connections',()=>{
 const items=M.records([...Array.from({length:8},(_,i)=>fixture('r'+i,'movie',{rating:95,tags:['Черга (архів)']})),fixture('target','movie',{tags:['Черга (архів)']})]);
 const p=M.predictor(items)(items.at(-1));assert.equal(p.matches.length,0);assert.equal(p.personalized,false);assert.equal(p.chance,p.baseline);
});
test('repeated identical ratings do not give a title extra influence',()=>{
 const raw=Array.from({length:8},(_,i)=>fixture('r'+i,'movie',{rating:i<4?90:20,genre:'Drama'}));raw.push(fixture('q','movie',{genre:'Drama'}));
 const first=M.records(raw),p=M.predictor(first)(first.at(-1));raw[0].watchHistory=Array.from({length:30},()=>({rating:90,scale:100}));const next=M.records(raw),after=M.predictor(next)(next.at(-1));assert.equal(after.chance,p.chance);assert.ok(after.ratingCount>p.ratingCount);
});
test('role-specific connections, searchable credits and rating-first related records',()=>{
 const cast=['Олена','Марія','Олексій'];
 const items=M.records([
  fixture('target','game',{creator:'First Studio',publishers:'North',actors:cast,genre:'Adventure',tags:['Mystery']}),
  fixture('developer','game',{creator:'first studio',rating:70}),
  fixture('publisher','game',{publishers:['north'],gameEvents:[{rating:40},{rating:100}]}),
  fixture('tag','game',{tags:['Mystery'],rating:70}),
  fixture('genre','game',{genre:'Adventure',rating:70}),
  fixture('cast','game',{actors:cast,rating:70}),
  fixture('loved','game',{actors:['Марія'],rating:99}),
  fixture('unrated','game',{creator:'First Studio'}),
  fixture('unrelated','game',{creator:'North',rating:100}),
  fixture('planned','game',{actors:cast,status:'planned',rating:100})
 ]);
 const target=items[0],results=M.related(items,target);
 assert.deepEqual(results.map(x=>x.item.id),['loved','developer','genre','tag','publisher','cast','unrated']);
 assert.equal(results.find(x=>x.item.id==='publisher').rating,70);
 assert.deepEqual(M.filter(items,{query:'north олена first'}),[target]);
 assert.deepEqual(M.graph([target],'developers').edges.map(e=>e.target),['hub:developers:first studio']);
 assert.deepEqual(M.graph([target],'directors').edges,[]);
 assert.deepEqual(M.groups(items,'publishers').map(g=>g.count),[2]);
 const p=M.predictor(items)(target);
 assert.deepEqual(p.matches.find(m=>m.r.id==='publisher').reasons,[{field:'publishers',value:'North'}]);
 assert.ok(!p.matches.some(m=>m.r.id==='unrelated'));
 for(const feature of ['developer','genre','tag']){
  assert.ok(p.matches.find(m=>m.r.id===feature).weight>p.matches.find(m=>m.r.id==='cast').weight);
 }
});
test('each credit can raise or lower the wishlist forecast from personal history',()=>{
 for(const [field,value] of [['creator','Studio A'],['actors',['Actor A']],['publishers',['Publisher A']]]){
  const history=Array.from({length:20},(_,i)=>fixture('r'+i,'game',i<10?{[field]:value,rating:100}:{rating:20}));
  const items=M.records([...history,fixture('wishlist','game',{[field]:value,wishlist:true})]);
  const high=M.predictor(items)(items.at(-1));
  assert.ok(high.chance>high.baseline);
  history.forEach(r=>{r.rating=120-r.rating;});
  const reversed=M.records([...history,items.at(-1).raw]),low=M.predictor(reversed)(reversed.at(-1));
  assert.ok(low.chance<low.baseline);
 }
});
test('screen roles stay distinct, seasons count once, and authors connect to books',()=>{
 const [series,book,film]=M.records([
  fixture('series','tv',{creator:'Unassigned',authors:['Writer'],seasons:[
   {directors:['Director'],studios:['Studio']},{directors:['Director'],authors:['Writer']}] }),
  fixture('novel','book',{creator:'Writer',studios:['discard'],actors:['discard']}),
  fixture('film','movie',{directors:['Writer'],studios:['Studio']})
 ]);
 const compare=M.affinity([series,book,film]);
 assert.deepEqual(series.directors,['Unassigned','Director']);
 assert.deepEqual(series.authors,['Writer']);
 assert.deepEqual(book.directors,[]);
 assert.deepEqual(book.studios,[]);
 assert.deepEqual(compare(series,book).reasons,[{field:'authors',value:'Writer'}]);
 assert.deepEqual(compare(series,film).reasons,[{field:'studios',value:'Studio'}]);
 assert.deepEqual(M.filter([series,book,film],{query:'director writer studio'}),[series]);
});
test('real collection: no mutation or lost nodes; deterministic finite positions and predictions',()=>{
 const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data.json'))),before=JSON.stringify(raw),items=M.records(raw.records),graph=M.graph(items),layout=M.layout(graph),predict=M.predictor(items);
 assert.equal(graph.nodes.filter(n=>n.kind==='record').length,raw.records.length);assert.ok(layout.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));assert.deepEqual(layout,M.layout(graph));
 for(const r of items.filter(r=>r.wishlist)){const p=predict(r);assert.ok(p.chance===null||p.chance>=0&&p.chance<=100);}
 assert.equal(JSON.stringify(raw),before);
});
