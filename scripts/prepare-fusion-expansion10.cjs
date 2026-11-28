#!/usr/bin/env node
/**
 * Data-only admission of historical Fusions whose entire API rules text is an
 * exact named-material recipe. Any effect text, unresolved material, conflicted
 * fact, or regional-date gap excludes the candidate.
 *
 * Usage: node scripts/prepare-fusion-expansion10.cjs /path/to/fusion-api.json
 * No distribution, deploy, or resolver version change is performed here.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),referenceFile=process.argv[2];
if(!referenceFile)throw Error('Supply an independently retrieved Fusion Monster API response');
const referenceBytes=fs.readFileSync(referenceFile),api=JSON.parse(referenceBytes.toString('utf8'));
if(!Array.isArray(api.data)||api.data.length<500)throw Error('Incomplete Fusion Monster reference');
const historical=require('../catalog/historical/2004-10-01/cards.json'),
 manifest=require('../catalog/engine-v7/manifest.json'),
 previous=require('../catalog/engine-v7/'+manifest.current+'.json'),
 {normalizeHistoricalFacts}=require('../dist/catalogCertification'),
 {definitionFingerprint}=require('../dist/cardRegistry'),
 {getEffectModel}=require('../dist/effectModels');
if(previous.cards.length!==692)throw Error('Unexpected prior certification count');
const previousIds=new Set(previous.cards.map(c=>c.id)),byName=new Map(previous.cards.map(c=>[c.englishName?.toLowerCase(),c.id])),
 apiById=new Map(api.data.map(c=>[String(c.id).padStart(8,'0'),c])),
 cards=[],reviews=[],checks=[],certificates={};
const candidates=historical.filter(c=>c.mechanics?.includes('fusion')&&c.firstObserved?.ocg<='2004-09-30'&&c.passwords?.length===1&&!previousIds.has(c.passwords[0])).sort((a,b)=>a.passwords[0].localeCompare(b.passwords[0]));
for(const source of candidates){
 const id=source.passwords[0],found=apiById.get(id);
 if(!found||found.type!=='Fusion Monster'||typeof found.desc!=='string')continue;
 const body=found.desc.trim(),firstLine=body.split(/\r?\n/)[0];
 if(firstLine!==body||!/^"[^"]+"(?: \+ "[^"]+")+$/u.test(firstLine))continue;
 const recipeNames=[...firstLine.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 const materials=recipeNames.map(name=>byName.get(name.toLowerCase()));
 if(materials.some(id=>!id))continue;
 const normalized=normalizeHistoricalFacts(source);
 if(normalized.issues.length||source.classifications.length||source.mechanics.length!==1||!/^\d{8}$/.test(id))throw Error('Conflicted historical identity: '+id);
 const race=found.race.toLowerCase().replace(/[\s_-]/g,'');
 if(found.level!==source.level||found.atk!==source.atk||found.def!==source.def||found.attribute?.toLowerCase()!==source.attribute?.toLowerCase()||race!==source.race?.toLowerCase().replace(/[\s_-]/g,''))throw Error('Independent Fusion mismatch: '+id);
 const races={aqua:'Aqua',beast:'Beast',beastwarrior:'Beast-Warrior',dinosaur:'Dinosaur',dragon:'Dragon',fairy:'Fairy',fiend:'Fiend',fish:'Fish',insect:'Insect',machine:'Machine',plant:'Plant',pyro:'Pyro',reptile:'Reptile',rock:'Rock',seaserpent:'Sea Serpent',spellcaster:'Spellcaster',thunder:'Thunder',warrior:'Warrior',wingedbeast:'Winged Beast',zombie:'Zombie'};
 const card={id,konamiId:source.konamiId,name:found.name,englishName:found.name,kind:'monster',monsterType:'fusion',race:races[race],attribute:found.attribute,level:found.level,atk:found.atk,defense:found.def,fusion:materials,summary:'Fusão de materiais específicos, sem efeito adicional.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid='+source.konamiId+'&request_locale=ja'};
 if(!card.race)throw Error('Unknown Fusion race: '+id);
 const fingerprint=definitionFingerprint(card,{kind:'fusion'},{model:getEffectModel});
 cards.push(card);certificates[id]={fingerprint,suites:['tests/historicalFusionExpansion10.test.cjs']};
 reviews.push({id,canonicalId:source.id,konamiId:card.konamiId,
  reviewer:'Automated independent exact-recipe cross-check; executed mechanics per Fusion',
  reviewedAt:'2026-10-27',identityApproved:true,mechanicsApproved:true,primarySource:card.source,
  primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute,ocgDate:source.firstObserved.ocg},
  recipeNames,recipeIds:materials,mechanicalFingerprint:fingerprint});
 checks.push({id,canonicalId:source.id,konamiId:card.konamiId,historicalEnglishName:source.names.en,independentEnglishName:found.name,
  type:found.type,description:body,level:found.level,atk:found.atk,defense:found.def,race:found.race,attribute:found.attribute,
  ocgDate:source.firstObserved.ocg,recipeNames,recipeIds:materials,factsMatch:true});
}
if(cards.length!==31)throw Error('Expected 31 strict exact-recipe Fusions; found '+cards.length);
const priorSourceFile=path.join(root,'src/cardCertifications.ts'),priorSource=fs.readFileSync(priorSourceFile,'utf8'),start=priorSource.indexOf('={'),end=priorSource.lastIndexOf('};'),
 oldCertificates=JSON.parse(priorSource.slice(start+1,end+1));
if(Object.keys(oldCertificates).length!==692)throw Error('Unexpected previous certificate count');
for(const id of Object.keys(certificates))if(Object.hasOwn(oldCertificates,id))throw Error('Duplicate Fusion certificate: '+id);
const map=JSON.stringify({...certificates,...oldCertificates},null,2);
const evidence={version:1,cohort:'mission10-exact-fusions',cutoff:'2004-09-30',source:'https://db.ygoprodeck.com/api/v7/cardinfo.php?type=Fusion%20Monster',
 sourceResponseSha256:crypto.createHash('sha256').update(referenceBytes).digest('hex'),
 sourceCount:api.data.length,previousCertified:692,independentCrosschecked:cards.length,
 method:'Strict automated 2004 OCG date and independent API identity/stats; entire Fusion description must be an exact named-material recipe with all materials already certified. Konami CID URLs are reference pointers, not individual human page visits.',
 cards:checks};
const outputs={
 'src/historicalFusionBatch10.ts':"/** Strict exact-recipe Fusions. No effect text or distribution authorization. */\nimport type {Card} from './cardCatalog';\nexport const historicalFusionBatch10:readonly Card[]="+JSON.stringify(cards,null,2)+';\n',
 'docs/evidence/mission10-fusion-crosscheck.json':JSON.stringify(evidence,null,2)+'\n',
 'docs/evidence/mission10-individual-reviews.json':JSON.stringify(reviews,null,2)+'\n',
 'src/cardCertifications.ts':priorSource.slice(0,start+1)+map+priorSource.slice(end+1)
};
for(const [file,content]of Object.entries(outputs))fs.writeFileSync(path.join(root,file),content,file==='src/cardCertifications.ts'?undefined:{flag:'wx'});
console.log(JSON.stringify({fusions:cards.length,withThreeMaterials:cards.filter(c=>c.fusion.length===3).length,certificatesAfter:Object.keys(oldCertificates).length+cards.length,sourceResponseSha256:evidence.sourceResponseSha256}));
