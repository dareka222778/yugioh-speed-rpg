#!/usr/bin/env node
/** Offline factual staging only. Never imports the engine, SQLite or Discord. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const REGIONS=['tcg','ocg'],KINDS=new Set(['monster','spell','trap']);
const SOURCE='https://github.com/iconmaster5326/YGOJSON/releases/download/v1/aggregate.zip';
const REPO=path.resolve(__dirname,'..');
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function sorted(values){return [...new Set(values)].sort();}
function name(product){return product.name?.en??product.name?.ja??product.id;}
function countRegions(events,cutoff){const sets={tcg:new Set(),ocg:new Set()};for(const e of events)if(e.date<=cutoff)for(const id of e.cardIds)sets[e.region].add(id);return {tcg:sets.tcg.size,ocg:sets.ocg.size,union:new Set([...sets.tcg,...sets.ocg]).size,intersection:[...sets.tcg].filter(id=>sets.ocg.has(id)).length};}
function buildHistorical(cards,products,options={}){
 const cutoff=options.cutoff??'2004-10-01',start=options.start??'1999-01-01';
 if(!date(cutoff)||!date(start)||start>cutoff)throw Error('Invalid ISO date window');
 if(!Array.isArray(cards)||!Array.isArray(products))throw Error('Expected aggregate JSON arrays');
 const byId=new Map(),productIds=new Set(),diagnostics=[],events=new Map(),first=new Map();
 for(const c of cards){if(!c||typeof c.id!=='string'||!c.id||byId.has(c.id))throw Error('Missing or duplicate canonical card ID');byId.set(c.id,c);}
 const issue=(kind,p,extra={})=>diagnostics.push({kind,productId:p.id,productName:name(p),...extra});
 for(const p of products){
  if(!p||typeof p.id!=='string'||!p.id||productIds.has(p.id)||!Array.isArray(p.contents))throw Error('Missing/duplicate product ID or invalid contents');productIds.add(p.id);
  const locales=p.locales??{};
  for(const [blockIndex,block]of p.contents.entries()){
   if(!block||!Array.isArray(block.cards))throw Error('Product cards must be an array');
   const applicable=block.locales??Object.keys(locales);if(!Array.isArray(applicable))throw Error('Invalid product locales');
   for(const locale of applicable){
    const info=locales[locale];if(!info){issue('missing-locale-definition',p,{blockIndex,locale});continue;}
    const formats=info.formats??block.formats??[];if(!Array.isArray(formats))throw Error('Invalid regional formats');
    for(const region of REGIONS.filter(r=>formats.includes(r))){
     if(!date(info.date)){issue('missing-or-invalid-release-date',p,{blockIndex,locale,region,observedDate:info.date??null});continue;}
     const when=info.date;
     for(const printing of block.cards){if(!printing||typeof printing.card!=='string')throw Error('Printing missing canonical card reference');const c=byId.get(printing.card);if(c&&KINDS.has(c.cardType)){const f=first.get(c.id)??{};if(!f[region]||when<f[region])f[region]=when;first.set(c.id,f);}}
     if(when<start||when>cutoff)continue;
     if(!block.cards.length)issue('empty-product-content',p,{blockIndex,locale,region,date:when});
     const key=JSON.stringify([when,region,p.id]);let event=events.get(key);
     if(!event){event={date:when,region,productId:p.id,name:name(p),locales:new Set(),cardIds:new Set(),excludedTypes:new Set()};events.set(key,event);}event.locales.add(locale);
     for(const printing of block.cards){
      if(!printing||typeof printing.card!=='string')throw Error('Printing missing canonical card reference');
      const c=byId.get(printing.card);
      if(!c){issue('missing-card-metadata',p,{blockIndex,region,date:when,cardId:printing.card});continue;}
      if(!KINDS.has(c.cardType)){event.excludedTypes.add(c.cardType??'unknown');continue;}
      event.cardIds.add(c.id);
     }
    }
   }
  }
 }
 const releases=[...events.values()].map(e=>({...e,locales:sorted(e.locales),cardIds:sorted(e.cardIds),excludedTypes:sorted(e.excludedTypes)})).sort((a,b)=>a.date.localeCompare(b.date)||a.region.localeCompare(b.region)||a.productId.localeCompare(b.productId));
 const selected=new Set(releases.flatMap(e=>e.cardIds)),seen=new Set(),regionalSeen={tcg:new Set(),ocg:new Set()};
 for(const e of releases){e.newWorldCardIds=e.cardIds.filter(id=>!seen.has(id));e.newRegionalCardIds=e.cardIds.filter(id=>!regionalSeen[e.region].has(id));for(const id of e.cardIds){seen.add(id);regionalSeen[e.region].add(id);}e.coverage=e.cardIds.length?'source-membership-not-independently-verified':'empty-or-excluded-source-content';}
 const rows=[...selected].sort().map(id=>{
  const c=byId.get(id),f=first.get(id)??{};if(['passwords','monsterCardTypes','classifications'].some(key=>c[key]!==undefined&&!Array.isArray(c[key])))throw Error('Invalid card metadata arrays');const names=Object.fromEntries(['en','pt','ja'].filter(lang=>c.text?.[lang]?.name).map(lang=>[lang,c.text[lang].name]));
  if(!Object.keys(names).length)throw Error('Selected card has no usable name');
  const passwords=sorted((c.passwords??[]).map(String).filter(s=>/^\d{1,8}$/.test(s)).map(s=>s.padStart(8,'0')));
  const mechanics=sorted(c.monsterCardTypes??[]),classifications=sorted(c.classifications??[]);
  return {id,names,kind:c.cardType,passwords,konamiId:c.externalIDs?.dbID??null,ygoprodeckId:c.externalIDs?.ygoprodeck?.id??null,
   attribute:c.attribute??null,race:c.type??null,level:c.level??null,atk:c.atk??null,def:c.def??null,subcategory:c.subcategory??null,mechanics,classifications,
   firstObserved:{tcg:f.tcg??null,ocg:f.ocg??null,world:Object.values(f).sort()[0]??null},
   normalMainCandidate:c.cardType==='monster'&&classifications.includes('normal')&&!mechanics.length,
   namePTSource:names.pt?'YGOJSON text.pt; official wording not independently verified':null,
   staging:{stage:'imported',effectReview:'pending',releaseAuthorization:'not-granted-by-import'}};
 });
 const collisions=[];for(const field of ['passwords','konamiId']){const index=new Map();for(const c of rows)for(const value of field==='passwords'?c.passwords:c.konamiId===null?[]:[String(c.konamiId)]){const ids=index.get(value)??[];ids.push(c.id);index.set(value,ids);}for(const [value,ids]of index)if(ids.length>1)collisions.push({field,value,cardIds:ids});}
 // Diagnostic repetitions in regional print variants are not separate gaps.
 const gaps=[...new Map(diagnostics.map(d=>[JSON.stringify(d),d])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const emptyProducts=Object.fromEntries(REGIONS.map(region=>[region,sorted(gaps.filter(d=>d.kind==='empty-product-content'&&d.region===region).map(d=>d.productId))]));
 const previousDay=new Date(Date.parse(cutoff)-86400000).toISOString().slice(0,10);
 const report={schema:1,importerVersion:1,scope:'historical TCG/OCG factual staging; no anime inference or gameplay admission',window:{start,cutoff,inclusive:true},
  source:options.source??{},inputTotals:{cards:cards.length,products:products.length},counts:countRegions(releases,cutoff),previousDay:{date:previousDay,...countRegions(releases,previousDay)},
  normalMainCandidates:rows.filter(c=>c.normalMainCandidate).length,missingPortugueseNames:rows.filter(c=>!c.names.pt).length,
  productReleaseEvents:releases.length,emptyProductIds:emptyProducts,identityCollisions:collisions,diagnostics:gaps,
  diagnosticScope:{emptyProductContent:'within selected window',missingCardMetadata:'within selected window',missingReleaseDate:'entire input snapshot; not necessarily historical'},
  completeness:'provisional: observed source memberships; missing content/dates may omit cards',
  sameDateOrder:'stable region/product ID only; not a claim about intraday release order',
  firstObservedDates:'earliest dated TCG/OCG product membership in supplied snapshot, not independently verified first publication',
  safety:{engineFilesWritten:false,playerDatabaseOpened:false,cardsEnabled:0,cardsGranted:0,animeCatalogDerived:false}};
 return {cards:rows,releases,report};
}
const csvCell=v=>{let text=String(v??'');if(/^\s*[=+@\-]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
function outputs(result){
 const columns=['id','konamiId','passwords','nameEN','namePT','nameJA','kind','mechanics','firstTCG','firstOCG','firstWorld','normalMainCandidate'];
 const csv=[columns.join(','),...result.cards.map(c=>[c.id,c.konamiId,c.passwords.join('|'),c.names.en,c.names.pt,c.names.ja,c.kind,c.mechanics.join('|'),c.firstObserved.tcg,c.firstObserved.ocg,c.firstObserved.world,c.normalMainCandidate].map(csvCell).join(','))].join('\n')+'\n';
 const timeline=[['date','region','productId','name','observedCards','newWorldCards','newRegionalCards','coverage'].join(','),...result.releases.map(p=>[p.date,p.region,p.productId,p.name,p.cardIds.length,p.newWorldCardIds.length,p.newRegionalCardIds.length,p.coverage].map(csvCell).join(','))].join('\n')+'\n';
 return {'cards.json':JSON.stringify(result.cards)+'\n','releases.json':JSON.stringify(result.releases)+'\n','audit.json':JSON.stringify(result.report,null,2)+'\n','cards.csv':csv,'releases.csv':timeline};
}
function verifySnapshot(folder){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),expected=['audit.json','cards.csv','cards.json','releases.csv','releases.json'];
 if(manifest.schema!==1||JSON.stringify(Object.keys(manifest.files??{}).sort())!==JSON.stringify(expected))throw Error('Invalid snapshot manifest file list');
 for(const file of expected){const bytes=fs.readFileSync(path.join(folder,file));if(sha(bytes)!==manifest.files[file].sha256||bytes.length!==manifest.files[file].bytes)throw Error('Snapshot checksum mismatch: '+file);}
 const cards=JSON.parse(fs.readFileSync(path.join(folder,'cards.json'),'utf8')),releases=JSON.parse(fs.readFileSync(path.join(folder,'releases.json'),'utf8')),report=JSON.parse(fs.readFileSync(path.join(folder,'audit.json'),'utf8'));
 if(!Array.isArray(cards)||!Array.isArray(releases)||!date(report.window?.start)||!date(report.window?.cutoff)||JSON.stringify(manifest.window)!==JSON.stringify(report.window)||JSON.stringify(manifest.source)!==JSON.stringify(report.source))throw Error('Invalid snapshot structure/provenance');
 const ids=new Set(cards.map(c=>c.id)),released=new Set();if(ids.size!==cards.length||cards.some(c=>typeof c.id!=='string'||!KINDS.has(c.kind)||c.staging?.stage!=='imported'||c.staging?.releaseAuthorization!=='not-granted-by-import'))throw Error('Invalid staged card identity/status');
 const keys=new Set(),worldSeen=new Set(),regionSeen={tcg:new Set(),ocg:new Set()};let previous='';
 for(const p of releases){const key=[p.date,p.region,p.productId].join('|');if(!date(p.date)||p.date<report.window.start||p.date>report.window.cutoff||!REGIONS.includes(p.region)||keys.has(key)||key<previous||!Array.isArray(p.cardIds)||new Set(p.cardIds).size!==p.cardIds.length||p.cardIds.some(id=>!ids.has(id)))throw Error('Invalid release chronology/membership');keys.add(key);previous=key;
  if(JSON.stringify(p.newWorldCardIds)!==JSON.stringify(p.cardIds.filter(id=>!worldSeen.has(id)))||JSON.stringify(p.newRegionalCardIds)!==JSON.stringify(p.cardIds.filter(id=>!regionSeen[p.region].has(id))))throw Error('Invalid release debut counts');
  for(const id of p.cardIds){released.add(id);worldSeen.add(id);regionSeen[p.region].add(id);}
 }
 if(released.size!==ids.size||JSON.stringify(countRegions(releases,report.window.cutoff))!==JSON.stringify(report.counts)||report.safety?.cardsEnabled!==0||report.safety?.cardsGranted!==0||report.safety?.playerDatabaseOpened!==false||report.safety?.engineFilesWritten!==false)throw Error('Invalid snapshot totals/safety boundary');
 return {status:'verified',...report.counts,files:expected.length+1,completeness:report.completeness};
}
function writeSnapshot(out,result){
 out=require('./protected-output.cjs').assertStagingOutput(out,REPO);
 const files=outputs(result),manifest={schema:1,source:result.report.source,window:result.report.window,files:Object.fromEntries(Object.entries(files).map(([name,text])=>[name,{sha256:sha(Buffer.from(text)),bytes:Buffer.byteLength(text)}]))};files['manifest.json']=JSON.stringify(manifest,null,2)+'\n';
 if(fs.existsSync(out)){if(Object.keys(files).every(name=>fs.existsSync(path.join(out,name))&&fs.readFileSync(path.join(out,name),'utf8')===files[name]))return {status:'unchanged',out};throw Error('Snapshot differs: choose a new output directory; no overwrite allowed');}
 fs.mkdirSync(path.dirname(out),{recursive:true});const stage=fs.mkdtempSync(path.join(path.dirname(out),'.history-stage-'));
 try{for(const [name,text]of Object.entries(files))fs.writeFileSync(path.join(stage,name),text,{flag:'wx'});fs.renameSync(stage,out);}finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
 return {status:'created',out};
}
function main(args){
 if(args[0]==='--verify'&&args.length===2){const result=verifySnapshot(args[1]);console.log(JSON.stringify(result,null,2));return result;}
 const opts={};for(let i=0;i<args.length;i+=2){if(!['--cards','--sets','--output','--cutoff','--start','--retrieved-on','--expected-cards-sha256','--expected-sets-sha256'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: --cards cards.json --sets sets.json --output NEW_DIRECTORY [--cutoff YYYY-MM-DD] [--retrieved-on YYYY-MM-DD] [--expected-cards-sha256 HASH --expected-sets-sha256 HASH]');opts[args[i].slice(2)]=args[i+1];}
 if(!opts.cards||!opts.sets||!opts.output)throw Error('Required: --cards, --sets, --output');if(opts['retrieved-on']&&!date(opts['retrieved-on']))throw Error('Invalid retrieval date');
 const read=(file,expected)=>{const bytes=fs.readFileSync(file),hash=sha(bytes);if(expected&&hash!==expected)throw Error('Source SHA-256 mismatch');let json;try{json=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid JSON aggregate');}return {json,sha256:hash,bytes:bytes.length};};
 let cards=read(opts.cards,opts['expected-cards-sha256']),sets=read(opts.sets,opts['expected-sets-sha256']);
 const source={provider:'YGOJSON',archiveURL:SOURCE,importerSHA256:sha(fs.readFileSync(__filename)),retrievedOn:opts['retrieved-on']??null,inputs:{cards:{sha256:cards.sha256,bytes:cards.bytes},sets:{sha256:sets.sha256,bytes:sets.bytes}},note:'release asset URL is mutable; hashes identify the exact supplied snapshot'};
 const result=buildHistorical(cards.json,sets.json,{cutoff:opts.cutoff,start:opts.start,source});const written=writeSnapshot(opts.output,result);console.log(JSON.stringify({...written,...result.report.counts,diagnostics:result.report.diagnostics.length,safety:result.report.safety},null,2));return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={buildHistorical,writeSnapshot,verifySnapshot,outputs,main};
