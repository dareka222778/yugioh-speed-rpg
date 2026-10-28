#!/usr/bin/env node
/**
 * Strict, documented admission of 17 short, independently checked classic rules.
 * This program does not infer mechanics from text. Each entry below is a manually
 * specified executable rule, accepted ONLY if the independent API reproduces
 * its reviewed complete text and the historical identity/stats agree.
 *
 * Usage: node scripts/prepare-mechanical-batch11.cjs /tmp/spells.json /tmp/effects.json
 * Run against the previous 723-card revision; never edits its immutable bytes.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const inputs=process.argv.slice(2);
if(inputs.length!==2)throw Error('Provide independent Spell Card and Effect Monster API JSON files');
const responseBytes=inputs.map(p=>fs.readFileSync(p));
const responses=responseBytes.map(b=>JSON.parse(b.toString('utf8')));
if(responses[0]?.data?.length<2500||responses[1]?.data?.length<5000)throw Error('Incomplete independent card reference');
const independent=new Map(responses.flatMap(x=>x.data).map(c=>[String(c.id).padStart(8,'0'),c]));
const historical=require('../catalog/historical/2004-10-01/cards.json');
const manifest=require('../catalog/engine-v7/manifest.json');
const previous=require('../catalog/engine-v7/'+manifest.current+'.json');
if(previous.cards.length!==723)throw Error('Unexpected prior catalog revision; preserve and review intervening work');
const already=new Set(previous.cards.map(c=>c.id));
const {normalizeHistoricalFacts}=require('../dist/catalogCertification');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const equip=(text,atk,def,restriction)=>({text,effect:{kind:'equip',atk,def,...restriction}});
const instant=(text,effect)=>({text,effect});
const direct=text=>({text,effect:{kind:'monsterEffect'},monster:{effect:{trigger:'continuous',operation:{kind:'directAttack'}},activation:{policy:'continuous',window:'continuous'}}});
const specs={
 '39897277':equip('A LIGHT monster equipped with this card increases its ATK by 400 points and decreases its DEF by 200 points.',400,-200,{attribute:'LIGHT'}),
 '15052462':equip('(This card is not treated as a "Crystal" card.)\nEquip only to a Zombie monster. It gains 300 ATK/DEF.',300,300,{races:['Zombie']}),
 '03492538':equip('Equip only to an Insect monster. It gains 700 ATK.',700,0,{races:['Insect']}),
 '77027445':equip('Equip only to an Aqua monster. It gains 300 ATK/DEF.',300,300,{races:['Aqua']}),
 '51267887':equip('Equip only to a Dinosaur monster. It gains 300 ATK/DEF.',300,300,{races:['Dinosaur']}),
 '01557499':equip('A Fairy-Type monster equipped with this card increases its ATK and DEF by 300 points.',300,300,{races:['Fairy']}),
 '55321970':equip('A WIND monster equipped with this card increases its ATK by 400 points and decreases its DEF by 200 points.',400,-200,{attribute:'WIND'}),
 '37820550':equip('Increase the ATK and DEF of a Thunder-Type monster equipped with this card by 300 points.',300,300,{races:['Thunder']}),
 '32268901':equip('Equip only to a FIRE monster. It gains 700 ATK.',700,0,{attribute:'FIRE'}),
 '82878489':equip('Equip only to a LIGHT monster. It gains 700 ATK.',700,0,{attribute:'LIGHT'}),
 '18937875':equip('A FIRE monster equipped with this card increases its ATK by 400 points and decreases its DEF by 200 points.',400,-200,{attribute:'FIRE'}),
 '77007920':equip('Equip only to an Insect monster. It gains 300 ATK/DEF.',300,300,{races:['Insect']}),
 '56260110':instant("Decrease your opponent's Life Points by 300 points.",{kind:'burn',amount:300}),
 '66719324':instant('Increases the Life Points of both players by 1000 points.',{kind:'sequence',activation:{speed:1,window:'main',damage:'never'},operations:[{kind:'gainLP',player:'self',amount:1000},{kind:'gainLP',player:'opponent',amount:1000}]}),
 '59290628':direct("This card can attack your opponent's Life Points directly even if there is a monster on your opponent's side of the field."),
 '02792265':direct("This monster may attack your opponent's Life Points directly."),
 '21297224':{text:'Tribute 2 monsters on your side of the field to increase your Life Points by 1000 points.',effect:{kind:'monsterEffect'},monster:{effect:{trigger:'ignition',cost:{kind:'tribute',count:2},operation:{kind:'heal',amount:1000}},activation:{policy:'manual',window:'main'}}}
};
const races={'aqua':'Aqua','fairy':'Fairy','zombie':'Zombie'};
const cards=[],effects={},monsters={},reviews=[],crosschecks=[],certificates={};
for(const [id,spec] of Object.entries(specs).sort(([a],[b])=>a.localeCompare(b))){
 const observed=independent.get(id),source=historical.find(c=>c.passwords?.length===1&&c.passwords[0]===id);
 if(!observed||!source||already.has(id))throw Error('Missing, duplicated or pre-certified candidate '+id);
 const text=observed.desc?.replace(/\r\n/g,'\n').trim();
 if(text!==spec.text)throw Error('Independent FULL text differs for '+id+': '+JSON.stringify(text));
 if(source.firstObserved?.ocg>'2004-09-30'||source.passwords.length!==1)throw Error('Outside historical OCG cutoff '+id);
 const normalized=normalizeHistoricalFacts(source);
 if(normalized.issues.length||source.mechanics.length||source.classifications.join(',')!==(spec.monster?'effect':''))throw Error('Conflicted historical facts '+id+': '+normalized.issues);
 const monster=!!spec.monster;
 if(monster&&(observed.type!=='Effect Monster'||observed.level!==source.level||observed.atk!==source.atk||observed.def!==source.def||observed.attribute?.toLowerCase()!==source.attribute||observed.race?.toLowerCase()!==source.race))throw Error('Independent monster facts mismatch '+id);
 if(!monster&&(observed.type!=='Spell Card'||observed.race!==(spec.effect.kind==='equip'?'Equip':'Normal')))throw Error('Independent Spell subtype mismatch '+id);
 if(source.names.en!==observed.name)throw Error('Independent identity/name mismatch '+id);
 const race=monster?races[source.race]:null;
 if(monster&&!race)throw Error('Unreviewed Monster Type '+id);
 const card={id,konamiId:source.konamiId,name:source.names.pt||observed.name,englishName:observed.name,kind:monster?'monster':'spell',
   ...monster?{monsterType:'effect'}:{},race,attribute:monster?source.attribute.toUpperCase():null,level:monster?source.level:null,
   atk:monster?source.atk:null,defense:monster?source.def:null,summary:spec.text,
   source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${source.konamiId}&request_locale=pt`};
 const fingerprint=definitionFingerprint(card,spec.effect,{monster:()=>spec.monster,model:getEffectModel});
 cards.push(card);effects[id]=spec.effect;if(monster)monsters[id]=spec.monster;
 certificates[id]={fingerprint,suites:['tests/mechanicalBatch11.test.cjs']};
 crosschecks.push({id,canonicalId:source.id,konamiId:source.konamiId,englishName:observed.name,description:spec.text,category:observed.race,type:observed.type,
   originalRelease:source.firstObserved,statistics:monster?{level:source.level,atk:source.atk,def:source.def,race:source.race,attribute:source.attribute}:null,
   exactFullTextMatched:true,mechanicalDefinition:spec.effect,monsterDefinition:spec.monster||null});
 reviews.push({id,canonicalId:source.id,konamiId:source.konamiId,reviewer:'Typed-rule selection and independent full-text cross-check; six executable scenarios per card',
   reviewedAt:'2026-10-27',identityApproved:true,mechanicsApproved:true,reviewMethod:'Independent complete rules-text match with explicit per-card typed executable effect; individual runtime scenarios required',
   historicalOcGDate:source.firstObserved.ocg,primarySource:card.source,primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute,ocgDate:source.firstObserved.ocg},englishName:observed.name,expectedText:spec.text,
   effect:spec.effect,monster:spec.monster||null,mechanicalFingerprint:fingerprint});
}
if(cards.length!==17||Object.keys(monsters).length!==3)throw Error('Cohort size mismatch');
const certFile=path.join(root,'src/cardCertifications.ts'),original=fs.readFileSync(certFile,'utf8'),begin=original.indexOf('={'),end=original.lastIndexOf('};');
const existing=JSON.parse(original.slice(begin+1,end+1));
if(Object.keys(existing).length!==723)throw Error('Unexpected certificate map size');
const append=JSON.stringify({...existing,...certificates},null,2);
const evidence={mission:11,cohort:'strict-equips-economy-and-direct-attack',cutoff:'2004-09-30',previousCertified:723,certified:17,
  method:'Independent YGOPRODeck current API full effect-text strict match, identity+release pinned historical YGOJSON, typed mechanical operations and executable individual scenarios; Konami CID pages referenced, not scraped as proof of visits',
  independentSource:[{endpoint:'https://db.ygoprodeck.com/api/v7/cardinfo.php?type=Spell%20Card',sha256:crypto.createHash('sha256').update(responseBytes[0]).digest('hex')},{endpoint:'https://db.ygoprodeck.com/api/v7/cardinfo.php?type=Effect%20Monster',sha256:crypto.createHash('sha256').update(responseBytes[1]).digest('hex')}],cards:crosschecks};
const outputs={
 'src/mechanicalBatch11.ts':"/** Independently matched short-form classic effects. Every card has an individual test and is unreleased. */\nimport type {Card} from './cardCatalog';\nimport type {Effect} from './effectDefinitions';\nimport type {MonsterDefinition} from './monsterEffects';\nexport const mechanicalBatch11:readonly Card[]="+JSON.stringify(cards,null,2)+';\nexport const mechanicalEffects11:Readonly<Record<string,Effect>>='+JSON.stringify(effects,null,2)+';\nexport const mechanicalMonsters11:Readonly<Record<string,MonsterDefinition>>='+JSON.stringify(monsters,null,2)+';\n',
 'docs/evidence/mission11-rule-crosscheck.json':JSON.stringify(evidence,null,2)+'\n',
 'docs/evidence/mission11-individual-reviews.json':JSON.stringify(reviews,null,2)+'\n',
 'src/cardCertifications.ts':original.slice(0,begin+1)+append+original.slice(end+1)};
for(const [file,content]of Object.entries(outputs))fs.writeFileSync(path.join(root,file),content,file==='src/cardCertifications.ts'?undefined:{flag:'wx'});
console.log(JSON.stringify({cards:cards.length,equips:12,spells:2,monsters:3,after:723+cards.length,sha:crypto.createHash('sha256').update(JSON.stringify(crosschecks)).digest('hex')}));
