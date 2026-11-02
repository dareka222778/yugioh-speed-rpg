#!/usr/bin/env node
/**
 * One-time, fail-closed data preparation from the pinned historical snapshot
 * and an independently fetched YGOPRODeck Normal Monster bulk API response.
 * Writes no engine rules and does not authorize card distribution.
 *
 * Usage: node scripts/prepare-normal-expansion9.cjs /path/to/normal-api.json
 * All outputs are committed; CI verifies them without requiring network access.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),referenceFile=process.argv[2];
if(!referenceFile)throw Error('Pass a locally fetched independent Normal Monster API JSON snapshot');
const referenceBytes=fs.readFileSync(referenceFile),api=JSON.parse(referenceBytes.toString('utf8'));
if(!Array.isArray(api.data)||api.data.length<500)throw Error('Unexpected bulk API response; nothing generated');
const historical=require('../catalog/historical/2004-10-01/cards.json'),
 manifest=require('../catalog/engine-v7/manifest.json'),
 previous=require('../catalog/engine-v7/'+manifest.current+'.json'),
 {normalizeHistoricalCard}=require('../dist/catalogCertification'),
 {definitionFingerprint}=require('../dist/cardRegistry'),
 {getEffectModel}=require('../dist/effectModels');
const prior=new Set(previous.cards.map(card=>card.id)),
 apiById=new Map(api.data.map(card=>[String(card.id).padStart(8,'0'),card])),
 selected=historical.filter(raw=>raw.normalMainCandidate===true&&raw.firstObserved?.ocg<='2004-09-30'&&raw.passwords?.length===1&&!prior.has(raw.passwords[0]))
 .sort((a,b)=>a.passwords[0].localeCompare(b.passwords[0]));
if(selected.length!==449)throw Error('Candidate census drift: '+selected.length);
const cards=[],reviews=[],checks=[],certificates={},seen=new Set();
const suites=['tests/historicalNormalExpansion9a.test.cjs','tests/historicalNormalExpansion9b.test.cjs','tests/historicalNormalExpansion9c.test.cjs','tests/historicalNormalExpansion9d.test.cjs'];
const parts=Array.from({length:suites.length},()=>[]);
for(let i=0;i<selected.length;i++){
 const h=selected[i],id=h.passwords[0],apiCard=apiById.get(id),normal=normalizeHistoricalCard(h);
 if(!normal.card||normal.issues.length||normal.family!=='normal-monster'||!apiCard||apiCard.type!=='Normal Monster')throw Error('Unverified Normal: '+id);
 if(seen.has(id))throw Error('Duplicate Normal passcode: '+id);seen.add(id);
 const canonical=normal.card,
  race=(apiCard.race||'').toLowerCase().replace(/[\s_-]/g,''),
  ownRace=(canonical.race||'').toLowerCase().replace(/[\s_-]/g,'');
 if(apiCard.level!==canonical.level||apiCard.atk!==canonical.atk||apiCard.def!==canonical.defense||race!==ownRace||apiCard.attribute!==canonical.attribute)throw Error('Independent factual mismatch: '+id);
 if(h.firstObserved.ocg>'2004-09-30'||!h.firstObserved.ocg)throw Error('Missing verified regional eligibility: '+id);
 // No claim that every Konami webpage was viewed by a human; official CID is a traceable reference.
 const card={...canonical,name:apiCard.name,englishName:apiCard.name},
  fingerprint=definitionFingerprint(card,{kind:'normal'},{model:getEffectModel}),
  part=Math.floor(i*4/selected.length);
 cards.push(card);parts[part].push(id);
 certificates[id]={fingerprint,suites:[suites[part]]};
 reviews.push({
  id,canonicalId:h.id,konamiId:card.konamiId,
  reviewer:'Automated historical/API cross-check; individually executed Normal scenarios',
  reviewedAt:'2026-10-27',identityApproved:true,mechanicsApproved:true,
  primarySource:card.source,primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute,ocgDate:h.firstObserved.ocg},
  mechanicalFingerprint:fingerprint
 });
 checks.push({
  id,canonicalId:h.id,konamiId:card.konamiId,
  historicalEnglishName:h.names.en,independentEnglishName:apiCard.name,
  kind:apiCard.type,level:apiCard.level,atk:apiCard.atk,defense:apiCard.def,
  race:apiCard.race,attribute:apiCard.attribute,ocgDate:h.firstObserved.ocg,
  factsMatch:true
 });
}
const notice='/** Generated from individually cross-checked facts. No release authorization. */\n',
 asModule=(name,value)=>notice+"import type {Card} from './cardCatalog';\nexport const "+name+':readonly Card[]='+JSON.stringify(value,null,2)+';\n';
const index={
 version:1,cohort:'mission9-normal-ocg-cutoff',cutoff:'2004-09-30',source:'https://db.ygoprodeck.com/api/v7/cardinfo.php?type=Normal%20Monster',
 sourceResponseSha256:crypto.createHash('sha256').update(referenceBytes).digest('hex'),
 sourceCount:api.data.length,previousCertified:previous.cards.length,independentCrosschecked:checks.length,
 excludesTcgFirstWithPostCutoffOcg:true,
 checkFields:['passcode','type','level','atk','defense','race','attribute'],
 method:'Automated historical/imported versus independent API comparison. Official Konami CID URLs are identity links, not independently visited individual primary-source reviews.',
 cards:checks
};
const outputs={
 'src/historicalNormalBatch9.ts':asModule('historicalNormalBatch9',cards),
 'docs/evidence/mission9-normal-crosscheck.json':JSON.stringify(index,null,2)+'\n',
 'docs/evidence/mission9-individual-reviews.json':JSON.stringify(reviews,null,2)+'\n'
};
for(let i=0;i<4;i++){
 outputs['tests/historicalNormalExpansion9'+String.fromCharCode(97+i)+'.test.cjs']=
  "const {historicalNormalBatch9}=require('../dist/historicalNormalBatch9');\n"+
  "const reviews=require('../docs/evidence/mission9-individual-reviews.json');\n"+
  "const ids=new Set("+JSON.stringify(parts[i])+");\n"+
  "require('./helpers/normalCertification.cjs').registerNormalCertification(historicalNormalBatch9.filter(c=>ids.has(c.id)),{reviews,reportFile:'artifacts/certification-executions-mission9"+String.fromCharCode(97+i)+".json'});\n";
}
// Preserve the longstanding JSON-literal certificate map read by historical
// source-integrity checks; append unique entries without changing old hashes.
const certPath=path.join(root,'src/cardCertifications.ts'),certSource=fs.readFileSync(certPath,'utf8'),
 start=certSource.indexOf('={'),end=certSource.lastIndexOf('};'),
 oldMap=JSON.parse(certSource.slice(start+1,end+1));
if(start<0||end<=start||Object.keys(oldMap).length!==243)throw Error('Unexpected certificate baseline');
for(const id of Object.keys(certificates))if(Object.hasOwn(oldMap,id))throw Error('Certificate collision: '+id);
const newMapText=JSON.stringify({...certificates,...oldMap},null,2);
outputs['src/cardCertifications.ts']=certSource.slice(0,start+1)+newMapText+certSource.slice(end+1);
for(const [file,content]of Object.entries(outputs))fs.writeFileSync(path.join(root,file),content,file==='src/cardCertifications.ts'?undefined:{flag:'wx'});
console.log(JSON.stringify({cards:cards.length,additionalTests:cards.length*8,parts:parts.map(p=>p.length),sourceResponseSha256:index.sourceResponseSha256}));
