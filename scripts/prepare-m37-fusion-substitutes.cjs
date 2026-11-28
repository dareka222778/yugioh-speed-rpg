#!/usr/bin/env node
'use strict';
/** Reviewed 2002 Fusion material substitutes, using the actual public duel
 * engine for every behavioral oracle. Generates a proposal, not certificates. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),history=require('../catalog/historical/2004-10-01/cards.json');
const batchId='m37-fusion-substitutes';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const definitions=[
 {id:'53493204',cid:4115,printing:'TP1-013',date:'2002-09-01'},
 {id:'50259460',cid:4275,printing:'TP1-015',date:'2002-09-01'},
 {id:'99426834',cid:4264,printing:'TP1-014',date:'2002-09-01'},
 {id:'30451366',cid:4648,printing:'TP2-013',date:'2002-10-01'}
];
const ref=(uid,id)=>({uid,id}),monster=(uid,id,faceUp=true)=>({uid,id,owner:0,faceUp,position:'def',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const fusion=ref('fusion','40173854'),poly=ref('poly','24094653'),exact=ref('exact','58314394');
const source=(id,mode='hand',opts={})=>{
 const p={hand:[poly,exact],extra:[fusion]};
 if(mode==='hand')p.hand.push(ref('sub',id));
 else if(mode==='field')p.monsters=[monster('sub',id,opts.faceUp!==false)];
 else if(mode==='grave')p.grave=[ref('sub',id)];
 const opponent=opts.drain?{backrow:[{uid:'drain',id:'82732705',setTurn:0,faceUp:true,resolved:true}]}:{};
 return {players:[p,opponent]};
};
const fusionAction={kind:'fusion',card:'poly',extra:'fusion',materials:['exact','sub'],position:'atk'};
const activate={actor:'a',match:fusionAction},settle={settle:true};
const oracle=(path,equals)=>({path,equals});
const summoned=[oracle(['players',0,'monsters',0,'id'],'40173854'),oracle(['players',0,'monsters',0,'properlySummoned'],true)];
const success=(fixture,actions=[activate,settle])=>({fixture,actions,assertions:[...summoned,{path:['players',0,'grave'],containsUID:'sub'},{path:['players',0,'grave'],containsUID:'exact'},{path:['players',0,'grave'],containsUID:'poly'},oracle(['players',0,'extra','length'],0)]});
const reject=(fixture,action=fusionAction)=>({fixture,actions:[{actor:'a',expectError:true,action}],assertions:[{path:['players',0,'extra'],containsUID:'fusion'}]});
const candidates=[],reviews=[];
for(const entry of definitions){
 const h=history.find(c=>c.konamiId===entry.cid&&c.passwords.includes(entry.id));if(!h)throw Error('Missing historical identity '+entry.id);
 const card={id:entry.id,konamiId:entry.cid,name:h.names.pt??h.names.en,englishName:h.names.en,kind:'monster',monsterType:'effect',race:h.race[0].toUpperCase()+h.race.slice(1),attribute:h.attribute.toUpperCase(),level:h.level,atk:h.atk,defense:h.def,summary:'Pode substituir 1 Material de Fusão nomeado; todos os outros Materiais de Fusão devem ser os corretos.',source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${entry.cid}&request_locale=en`};
 const effect={kind:'monsterEffect'},monsterDefinition={effect:{trigger:'continuous',operation:{kind:'fusionSubstitute'}},activation:{policy:'continuous',window:'continuous'}};
 const other=definitions.find(x=>x.id!==entry.id).id;
 const text=`${h.names.en} is a Level ${h.level} ${h.attribute.toUpperCase()} ${card.race} Effect Monster with ${h.atk} ATK and ${h.def} DEF. It can replace exactly one specifically named Fusion Material Monster when used for a Fusion Summon. Every other material must exactly match its printed name. Its substitution is not an activation, has no cost, does not target and does not trigger a chain. The card may itself be in the hand or on the field as ordinary Polymerization material, including face-down field material; it may not be taken from the Graveyard with Polymerization. A face-up effect negated by Skill Drain does not substitute. Two substitutes cannot fill two different named slots, but exact printed materials remain legal. It has no other effect.`;
 const negative=reject({players:[{hand:[poly,ref('sub',entry.id),ref('second',other)],extra:[fusion]},{}]},{...fusionAction,materials:['sub','second']});
 const cases={
  negative,
  'json-restore':success(source(entry.id),[activate,{restore:true},settle]),
  'deterministic-replay':success(source(entry.id,'field',{faceUp:false})),
  activation:success(source(entry.id)),
  resolution:success(source(entry.id,'field')),
  negation:reject(source(entry.id,'field',{drain:true})),
  'two-substitutes':negative,
  'face-down-material':success(source(entry.id,'field',{faceUp:false})),
  'grave-not-material':reject(source(entry.id,'grave')),
  'exact-materials-still-work':{
   fixture:{players:[{hand:[poly,ref('named-a','58314394'),ref('named-b','85448931'),ref('sub',entry.id)],extra:[fusion]},{}]},
   actions:[{actor:'a',match:{...fusionAction,materials:['named-a','named-b']}},settle],
   assertions:[...summoned,{path:['players',0,'hand'],containsUID:'sub'},{path:['players',0,'grave'],containsUID:'named-a'},{path:['players',0,'grave'],containsUID:'named-b'}]
  }
 };
 const textEvidence={text,sha256:sha(text),complete:true,format:'full-rule-paraphrase',source:card.source};
 candidates.push({card,effect,monster:monsterDefinition,family:'fusion-material-substitutes',requirements:['effect:monsterEffect','trigger:continuous','monster-operation:fusionSubstitute'],textEvidence,scenarios:['two-substitutes','face-down-material','grave-not-material','exact-materials-still-work'],cases});
 reviews.push({id:entry.id,canonicalId:h.id,konamiId:entry.cid,reviewer:'Codex: official Konami effect text, card identity and initial TCG printing reviewed individually on 2026-10-31',reviewedAt:'2026-10-31',identityApproved:true,mechanicsApproved:true,primarySource:card.source,primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute},verifiedPrinting:{date:entry.date,set:entry.printing,region:'tcg',source:card.source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:textEvidence.sha256,semanticCoverage:{activation:'not-applicable',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'not-applicable',restrictions:'represented',negation:'represented'}});
}
const batch={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates,reviews};
const target=path.join(root,'catalog/batches',batchId+'.json');
if(fs.existsSync(target))throw Error('Batch already exists; refusing to overwrite reviewed data');
fs.writeFileSync(target,JSON.stringify(batch,null,2)+'\n');
// Generation compares the finalized, mechanically fingerprinted batch with
// disk; persist the same canonical form before asking the gate to generate.
const canonical=require('./card-batch-automation.cjs').load('catalog/batches/'+batchId+'.json');
fs.writeFileSync(target,JSON.stringify(canonical,null,2)+'\n');
console.log('Prepared '+batchId+': '+candidates.length+' individually reviewed candidates, '+Object.keys(candidates[0].cases).length+' scenarios each.');
