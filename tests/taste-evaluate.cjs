// Exact original algorithm is retained as an evaluation reference and optional fallback.
const fs=require('node:fs'),path=require('node:path'),T=require('../taste-model.js'),M=require('../atlas-model.js');
const root=path.resolve(__dirname,'..'),raw=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8')).records;
const before=JSON.stringify(raw),artifact=T.train(raw),rows=artifact.rows;
const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const ids=[...new Set(rows.map(r=>r.group))].sort((a,b)=>hash(a)-hash(b)||a.localeCompare(b)),foldOf=new Map(ids.map((id,i)=>[id,i%3])),oldPredictions=[];
for(let fold=0;fold<3;fold++){
 const training=raw.filter(r=>foldOf.has(T.groupId(r))&&foldOf.get(T.groupId(r))!==fold),test=rows.filter(r=>foldOf.get(r.group)===fold);
 for(const row of test){const source=raw.find(r=>String(r.id)===row.id),target=structuredClone(source);if(row.seasonIndex!=null){target.seasons=(target.seasons||[]).slice(0,row.seasonIndex+1);const current=target.seasons[row.seasonIndex];current.rating=null;current.viewings=[];target.rating=null;
   if(row.firstDate)for(let i=0;i<row.seasonIndex;i++){const se=target.seasons[i],events=(se.viewings||[]).filter(v=>{const d=v.endDate||v.date||'';return d&&d<row.firstDate;});if((se.viewings||[]).length){se.viewings=events;const last=events.filter(v=>M.score(v)!=null).sort((a,b)=>String(a.endDate||a.date||'').localeCompare(String(b.endDate||b.date||''))).at(-1);se.rating=last?.rating??null;se.scale=last?.scale||100;}else if(!((se.endDate||se.date)&&String(se.endDate||se.date)<row.firstDate))se.rating=null;}
  }
  const items=M.records([...training,target]),predict=M.legacyPredictor(items),base=items.at(-1),entry=row.seasonIndex==null?base:M.records([{...target,...target.seasons[row.seasonIndex],id:target.id,seasons:[],category:'tv'}])[0],p=predict(entry,row.seasonIndex);
  if(p.chance!=null)oldPredictions.push({row,rating:0,probability:p.chance/100});
 }
}
const original=T.metrics(oldPredictions);original.mae=null;original.rmse=null;original.maeSE=null;original.name='Точний початковий predictor()';
const report={version:T.VERSION,recordCount:raw.length,trainingRows:rows.length,chosenModel:artifact.pipeline.model.type,seasonAmount:artifact.pipeline.seasonAmount,seasonValidationCount:artifact.pipeline.seasonValidationCount,calibration:artifact.pipeline.calibrator,grouped:{...artifact.report,models:{legacy:original,...artifact.report.models}},notes:['Для старої системи MAE/RMSE недоступні: вона не прогнозувала оцінку.','Ідентичні зовнішні групові фолди; усі перегляди та сезони твору мають спільну групу.','Для старого сезонного прогнозу цільовий і пізніші сезони приховані; прогнозний рядок використовує метадані цільового сезону.','Значення Precision@10/NDCG@10 — ретроспективні, не перевірка майбутнього списку бажаного.','Хронологічна перевірка має окремі результати і може показувати погіршення.']};
if(JSON.stringify(raw)!==before)throw Error('Input mutated');
const output=path.resolve(process.argv[2]||path.join(root,'..','taste-evaluation.json'));fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log('Model\tMAE\tBrier\tUnique works');for(const [name,m] of Object.entries(report.grouped.models))console.log(`${name}\t${m.mae==null?'N/A':m.mae.toFixed(3)}\t${m.brier.toFixed(4)}\t${m.groups}`);
console.log('Chosen:',report.chosenModel,'season weight:',report.seasonAmount);console.log('Saved:',output);
