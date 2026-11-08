/* Read-only derived data for the media atlas. No network, storage or mutations. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.MediaAtlasModel = model;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const categories = {movie:'Фільми', tv:'Серіали', game:'Ігри', book:'Книги'};
  const key = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g,' ').replace(/[’ʼ]/g,"'").toLocaleLowerCase('uk');
  const text = value => String(value ?? '').trim().replace(/\s+/g,' ');
  const score = value => {
    if (value?.rating == null || value.rating === '') return null;
    const n = Number(value.rating) * 100 / (Number(value.scale) || 100);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  function tokens(values, delimiter) {
    const seen = new Set();
    return values.flatMap(x => Array.isArray(x) ? x : String(x ?? '').split(delimiter)).map(text).filter(x => x && !seen.has(key(x)) && seen.add(key(x)));
  }
  function validDate(value) {
    const s = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(s + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s ? s : '';
  }
  function queuedRecord(r, seasonIndex=null) {
    return !!(r.wishlist || r.status === 'planned' || (r.category === 'tv' && (seasonIndex == null
      ? (r.seasons || []).some(s => s.status === 'planned') : r.seasons?.[seasonIndex]?.status === 'planned')));
  }
  function seasonWatched(s) {
    return !!s && (s.status === 'done' || score(s) != null || (s.viewings || []).some(v => score(v) != null || validDate(v.endDate || v.date)));
  }
  function records(raw) {
    return (raw || []).map((r, index) => {
      const seasons = r.category === 'tv' && Array.isArray(r.seasons) ? r.seasons : [];
      const releaseYears = [r.releaseYear,...seasons.map(s => s.releaseYear)].map(Number).filter(n => Number.isInteger(n) && n >= 1800 && n <= 2200);
      const item = {id:String(r.id ?? index), title:text(r.title) || 'Без назви', category:r.category || 'other',
        rating:score(r), genres:tokens([r.genre,...seasons.map(s => s.genre)], /[,/;|]+/),
        developers:r.category==='game'?tokens([r.creator], /[,;|]+/):[],
        publishers:r.category==='game'?tokens([r.publishers], /[,;|]+/):[],
        actors:['movie','tv','game'].includes(r.category)?tokens([r.actors], /[,;|]+/):[],
        ...Object.fromEntries(['directors','studios','authors'].map(role=>[role,
          ['movie','tv'].includes(r.category)?tokens([r,...seasons].flatMap(row=>role==='directors'?[row.directors,row.creator]:[row[role]]), /[,;|]+/):[]])),
        tags:tokens([r.tags || []], /[,]+/),
        favorite:!!r.favorite, wishlist:queuedRecord(r),
        year:releaseYears.length ? Math.min(...releaseYears) : null, raw:r};
      if(r.category==='book')item.authors=tokens([r.creator], /[,;|]+/);
      item.search = key([item.title,...features.flatMap(field => item[field])].join(' '));
      return item;
    });
  }
  function filter(items, state = {}) {
    const query = key(state.query).split(' ').filter(Boolean);
    return items.filter(r => (state.category === 'all' || !state.category || r.category === state.category)
      && (!state.minimum || r.rating != null && r.rating >= Number(state.minimum))
      && (state.scope !== 'favorite' || r.favorite) && (state.scope !== 'wishlist' || r.wishlist)
      && query.every(term => r.search.includes(term)));
  }
  function groups(items, field, byCategory = false) {
    const map = new Map();
    for (const r of items) for (const name of r[field] || []) {
      const id = (byCategory ? r.category + ':' : '') + key(name);
      if (!map.has(id)) map.set(id,{id,name,category:byCategory ? r.category : null,items:[]});
      map.get(id).items.push(r);
    }
    return [...map.values()].map(g => {
      const rated = g.items.filter(r => r.rating != null);
      return {...g,count:g.items.length,rated:rated.length,average:rated.length ? rated.reduce((n,r) => n+r.rating,0)/rated.length : null,
        favorites:g.items.filter(r => r.favorite).length};
    }).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name,'uk'));
  }
  function genrePairs(items, limit = 10) {
    const labels = groups(items,'genres').slice(0,limit);
    return {labels, cells:labels.flatMap((a,y) => labels.map((b,x) => ({x,y,a:a.name,b:b.name,
      items:items.filter(r => r.genres.some(v => key(v) === key(a.name)) && r.genres.some(v => key(v) === key(b.name)))})))};
  }
  function events(items) {
    const result = [];
    const add = (r,v,group,label,dateValue) => {
      const date = validDate(dateValue || v.endDate || v.date || v.startDate);
      if (date) result.push({recordId:r.id,title:r.title,category:r.category,group,label,date,rating:score(v)});
    };
    for (const r of items) {
      const raw = r.raw;
      if (raw.wishlist || raw.status === 'planned') {if(r.category !== 'tv') continue;}
      if (r.category === 'movie') {
        const list = raw.watchHistory || [];
        if (list.length) list.forEach(v => add(r,v,r.id,'Перегляд',v.date));
        else if (raw.status === 'done') add(r,raw,r.id,'Перегляд',raw.date);
      } else if (r.category === 'tv') {
        (raw.seasons || []).forEach((s,i) => {
          if (s.status === 'planned') return;
          const list = s.viewings || [], label = s.name || 'Сезон '+(i+1), group = r.id+':season:'+i;
          if (list.length) list.forEach(v => add(r,v,group,label));
          else if (s.status === 'done') add(r,s,group,label);
        });
      } else if (r.category === 'game' || r.category === 'book') {
        const list = raw[r.category === 'game' ? 'gameEvents' : 'bookEvents'] || [];
        if (list.length) list.forEach(v => add(r,v,r.id,r.category === 'game' ? 'Ігровий запис' : 'Прочитання'));
        else if (r.rating != null) add(r,raw,r.id,r.category === 'game' ? 'Ігровий запис' : 'Прочитання');
      }
    }
    return result.sort((a,b) => a.date.localeCompare(b.date));
  }
  function journeys(items) {
    const grouped = new Map();
    for (const e of events(items).filter(e => e.rating != null)) {
      if (!grouped.has(e.group)) grouped.set(e.group,[]);
      grouped.get(e.group).push(e);
    }
    return [...grouped.values()].filter(a => a.length >= 2).map(a => ({recordId:a[0].recordId,title:a[0].title,
      category:a[0].category,label:a[0].label,first:a[0],last:a.at(-1),count:a.length,delta:a.at(-1).rating-a[0].rating,events:a}))
      .sort((a,b) => Math.abs(b.delta)-Math.abs(a.delta) || b.count-a.count);
  }
  function graph(items, relation = 'all') {
    const fields = relation === 'all' ? features : [relation];
    const hubs = fields.flatMap(field => groups(items,field).map(g => ({id:'hub:'+field+':'+g.id,kind:field,label:g.name,count:g.count,itemIds:g.items.map(r => r.id)})));
    const lookup = new Map(hubs.map(h => [h.id,h]));
    const nodes = items.map(r => ({id:'record:'+r.id,kind:'record',record:r,label:r.title,rating:r.rating,category:r.category}));
    const edges = [];
    for (const n of nodes) for (const field of fields) for (const value of n.record[field] || []) {
      const hub = lookup.get('hub:'+field+':'+key(value));
      if (hub) edges.push({source:n.id,target:hub.id,kind:field});
    }
    return {nodes:[...nodes,...hubs],edges};
  }
  function hash(value) {let n=2166136261;for (const c of value) n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
  function layout(network) {
    const nodes = network.nodes.map(n => ({...n})), byId = new Map(nodes.map(n => [n.id,n]));
    const hubs = nodes.filter(n => n.kind !== 'record').sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
    // Frequent shared features sit inside; rarer features fan out deterministically.
    hubs.forEach((h,i) => {const angle=i*2.399963229728653,radius=.30+.68*Math.sqrt(i/Math.max(1,hubs.length-1));h.x=600+Math.cos(angle)*450*radius;h.y=365+Math.sin(angle)*270*radius;});
    const neighbors = new Map();
    for (const edge of network.edges) {if (!neighbors.has(edge.source)) neighbors.set(edge.source,[]);neighbors.get(edge.source).push(byId.get(edge.target));}
    for (const n of nodes.filter(n => n.kind === 'record')) {
      const links = neighbors.get(n.id) || [], seed = hash(n.id), angle = seed/4294967295*Math.PI*2;
      // Divide each role’s pull among its names so a long cast does not dominate the map.
      let xSum=0, ySum=0, total=0;
      for (const hub of links) {
        const pull=featureWeights[hub.kind]/n.record[hub.kind].length;
        xSum+=pull*hub.x;
        ySum+=pull*hub.y;
        total+=pull;
      }
      const center=total ? {x:xSum/total,y:ySum/total} : {x:600+Math.cos(angle)*520,y:365+Math.sin(angle)*320};
      n.x=600+(center.x-600)+Math.cos(angle)*(12+seed%38);
      n.y=365+(center.y-365)+Math.sin(angle)*(12+seed%38);
      n.anchor={x:n.x,y:n.y};n.linked=!!links.length;
    }
    // Deterministic, bounded spatial-grid relaxation; no perpetual force simulation.
    for (let tick=0;tick<65;tick++) {
      const grid = new Map();
      for (const n of nodes) {const k=Math.floor(n.x/36)+','+Math.floor(n.y/36);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(n);}
      for (const n of nodes.filter(n => n.kind === 'record')) {
        let dx=(n.anchor.x-n.x)*.025,dy=(n.anchor.y-n.y)*.025;
        const gx=Math.floor(n.x/36),gy=Math.floor(n.y/36);
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const other of grid.get((gx+a)+','+(gy+b))||[]) {
          if(n===other)continue;let x=n.x-other.x,y=n.y-other.y;const d=Math.hypot(x,y)||.1,min=other.kind==='record'?15:27;
          if(d<min){if(!x&&!y)x=.1;dx+=x/d*(min-d)*.14;dy+=y/d*(min-d)*.14;}
        }
        n.x=Math.max(25,Math.min(1175,n.x+dx));n.y=Math.max(25,Math.min(705,n.y+dy));
      }
    }
    return {...network,nodes};
  }
  function opinions(item) {
    const r=item.raw, rated=list => (list||[]).map(score).filter(n => n != null);
    let values=[];
    if(item.category==='tv') values=(r.seasons||[]).flatMap(s=>{const history=rated(s.viewings);return history.length?history:score(s)!=null?[score(s)]:[];});
    else values=rated(r[item.category==='movie'?'watchHistory':item.category==='game'?'gameEvents':'bookEvents']);
    if(!values.length&&item.rating!=null) values=[item.rating];
    return values;
  }
  const featureWeights = {authors:1.5, directors:1.5, developers:1.5, studios:1.1, genres:1, tags:.75, publishers:.55, actors:.16};
  const features = Object.keys(featureWeights);
  const serviceTag = /^(черга(?:\s*\(архів\))?|wishlist|watchlist|бажане|список бажаного|planned|планую|архів|archive)$/i;
  function eligible(item, field) {
    if (['directors','studios'].includes(field)) return ['movie','tv'].includes(item.category);
    if (field === 'authors') return ['book','movie','tv'].includes(item.category);
    if (field === 'actors') return ['movie','tv','game'].includes(item.category);
    if (field === 'developers' || field === 'publishers') return item.category === 'game';
    return true;
  }
  // Measure rarity in the collection. Each card counts once per role and name.
  function affinity(items) {
    const frequencies = new Map();
    for (const item of items) for (const field of features) for (const value of item[field]) {
      const id = field + ':' + key(value);
      frequencies.set(id, (frequencies.get(id) || 0) + 1);
    }
    return (a, b) => {
      const reasons = [];
      let weight = 0;
      for (const field of features) {
        const right = new Set(b[field].map(key));
        const shared = a[field].filter(name => right.has(key(name)) && !(field === 'tags' && serviceTag.test(name)));
        if (!shared.length) continue;
        const rarity = shared.reduce((sum, name) => sum + 1 - (frequencies.get(field + ':' + key(name)) || 0) / Math.max(1, items.length), 0) / shared.length;
        const overlap = shared.length / Math.sqrt(a[field].length * b[field].length);
        // Bounded per role: even a full cast contributes less than a single content tag.
        weight += featureWeights[field] * (.55 + .25 * rarity + .2 * overlap);
        reasons.push(...shared.map(value => ({field,value})));
      }
      return {weight: weight * (a.category === b.category ? 1 : .25), reasons};
    };
  }
  function related(items, target, compare = affinity(items)) {
    const results = [];
    for (const item of items) {
      if (item.id === target.id || item.wishlist) continue;
      const {weight,reasons} = compare(target,item);
      if (!weight) continue;
      const history = opinions(item);
      const rating = history.length ? history.reduce((sum,n) => sum+n,0)/history.length : null;
      const rank = .8 * (rating ?? 0) + 20 * weight / (1 + weight);
      results.push({item:item.raw, rating, reasons, rank});
    }
    return results.sort((a,b) => Number(b.rating!=null)-Number(a.rating!=null) || b.rank-a.rank || String(a.item.title).localeCompare(String(b.item.title),'uk'));
  }

  function predictor(items, compare = affinity(items)) {
    const trained=items.map(r=>{const scores=opinions(r);return {r,scores,success:scores.length?scores.filter(s=>s>=80).length/scores.length:0};}).filter(x=>x.scores.length);
    return (target, seasonIndex=null) => {
      // Exclude the target, including its own seasons/reviews: no self-prediction.
      const pool=trained.filter(x=>x.r.id!==target.id),same=pool.filter(x=>x.r.category===target.category);
      const global=(pool.reduce((s,x)=>s+x.success,0)+1)/(pool.length+2);
      const baseline=(same.reduce((s,x)=>s+x.success,0)+global*8)/(same.length+8);
      const matches=[];
      for(const item of pool){
        const {weight,reasons}=compare(target,item.r);
        if(weight>0)matches.push({...item,weight,reasons});
      }
      matches.sort((a,b)=>b.weight-a.weight);
      const evidence=matches.reduce((s,x)=>s+x.weight,0), effective=evidence?evidence*evidence/matches.reduce((s,x)=>s+x.weight*x.weight,0):0;
      // One bounded vote per previously watched season; never reuse the series average.
      const series=seasonIndex==null?null:items.find(r=>r.id===target.id && r.category==='tv');
      const previous=(series?.raw.seasons || []).slice(0,seasonIndex).filter(s=>s.status!=='planned' && seasonWatched(s)).map(s=>{
        if(score(s)!=null)return score(s);
        return (s.viewings || []).map((v,i)=>({v,i})).filter(x=>score(x.v)!=null).sort((a,b)=>String(a.v.endDate||a.v.date||a.v.startDate||'').localeCompare(String(b.v.endDate||b.v.date||b.v.startDate||''))||a.i-b.i).map(x=>score(x.v)).at(-1);
      }).filter(n=>n!=null);
      const seasonWeight=3*previous.length/(previous.length+2),seasonSuccess=previous.length?previous.filter(n=>n>=80).length/previous.length:0;
      const chance=pool.length>=5||previous.length?Math.round(100*(baseline*8+matches.reduce((s,x)=>s+x.weight*x.success,0)+seasonWeight*seasonSuccess)/(8+evidence+seasonWeight)):null;
      const strength=effective>=15&&evidence>=15?'середня':effective>=5&&evidence>=5?'обмежена':'низька';
      return {chance,personalized:matches.length>0||previous.length>0,previousSeasons:previous.length,seasonWeight,baseline:Math.round(baseline*100),strength,matches,trained:pool.length,sameCategory:same.length,
        ratingCount:pool.reduce((s,x)=>s+x.scores.length,0),effective,reason:pool.length<5?'Потрібно щонайменше 5 оцінених творів':!matches.length?'Немає спільних ознак з оціненими творами':''};
    };
  }
  return {categories,key,score,validDate,queuedRecord,seasonWatched,records,filter,groups,genrePairs,events,journeys,graph,layout,opinions,features,eligible,affinity,related,predictor};
});
