const test=require('node:test'),assert=require('node:assert/strict'),M=require('../atlas-model.js');
const record=(id,extra={})=>({id,title:id,category:'tv',...extra});
const history=()=>Array.from({length:12},(_,i)=>record('history'+i,{rating:i%2?30:90}));
function forecast(seasons,index=2,extra={}){const items=M.records([...history(),record('target',{seasons,...extra})]);return M.predictor(items)(items.at(-1),index);}
test('future seasons use one bounded vote per watched previous season, without changing the base forecast',()=>{
 const high=forecast([{rating:90},{rating:95},{status:'planned'}]),low=forecast([{rating:20},{rating:35},{status:'planned'}]);
 const empty=forecast([{},{},{status:'planned'}]);assert.ok(high.chance>empty.chance);assert.ok(low.chance<empty.chance);assert.equal(high.previousSeasons,2);
 assert.ok(high.seasonWeight>forecast([{rating:90},{},{status:'planned'}]).seasonWeight);
 const many=forecast(Array.from({length:101},()=>({rating:95})),100);assert.ok(many.seasonWeight<3);assert.ok(many.seasonWeight/(8+many.seasonWeight)<.28);
 const items=M.records([...history(),record('target',{seasons:[{status:'planned'}]})]),predict=M.predictor(items);assert.deepEqual(predict(items.at(-1),0),predict(items.at(-1)));
});
test('target/future ratings, planned ratings, series average and repeated viewings do not add season weight',()=>{
 const base=[{rating:90,viewings:[{rating:90}]},{rating:95},{status:'planned'},{rating:0}];
 const expected=forecast(base);assert.deepEqual(forecast(base,2,{rating:0}),expected);assert.deepEqual(forecast(base,2,{rating:100}),expected);
 const duplicated=structuredClone(base);duplicated[0].viewings=Array.from({length:20},()=>({rating:90}));assert.deepEqual(forecast(duplicated),expected);
 const changed=structuredClone(base);changed[2].rating=0;changed[3].rating=100;assert.deepEqual(forecast(changed),expected);
 assert.equal(forecast([{rating:99,status:'planned'},{status:'planned'}],1).previousSeasons,0);
});
test('rating another completed season refreshes the next forecast and handles legacy histories',()=>{
 const seasons=[{rating:20},{status:'planned'},{status:'planned'}],before=forecast(seasons);seasons[1]={status:'done',viewings:[{rating:100,date:'2026-01-01'}]};
 const after=forecast(seasons);assert.equal(after.previousSeasons,2);assert.ok(after.chance>before.chance);
 assert.equal(M.seasonWatched({status:'done'}),true);assert.equal(M.seasonWatched({rating:0}),true);assert.equal(M.seasonWatched({status:'planned',viewings:[]}),false);
 const raw=structuredClone(seasons);forecast(seasons);assert.deepEqual(seasons,raw);
});
test('wishlist membership shares manual, planned and season rules without mutating raw records',()=>{
 for(const category of ['movie','game','book','tv']){const raw={category,status:'planned',wishlist:false};assert.ok(M.queuedRecord(raw));assert.ok(M.records([raw])[0].wishlist);assert.equal(raw.wishlist,false);raw.status='done';assert.equal(M.queuedRecord(raw),false);raw.wishlist=true;assert.ok(M.queuedRecord(raw));}
 const raw={category:'tv',seasons:[{status:'done'},{status:'planned'}]};assert.ok(M.queuedRecord(raw));assert.equal(M.queuedRecord(raw,0),false);assert.equal(M.queuedRecord(raw,1),true);
});
