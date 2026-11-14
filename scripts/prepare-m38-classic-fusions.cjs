#!/usr/bin/env node
'use strict';
/** Five pre-cutoff non-Effect Fusions, with a live named material plus one
 * officially reviewed Fusion substitute. A speculative complete recipe with
 * unavailable materials is never counted as an executable scenario. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),h=require('../catalog/historical/2004-10-01/cards.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const names=[
 {cid:4514,recipe:['Blast Juggler','Two-Headed King Rex'],ready:['Two-Headed King Rex'],printing:'MRD-105',date:'2002-06-26',region:'tcg',exclude:['Cyber']},
 {cid:4713,recipe:['Tainted Wisdom','Ancient Brain'],ready:['Ancient Brain'],printing:'MRD-123',date:'2002-06-26',region:'tcg'},
 {cid:6127,recipe:['Big Koala','Des Kangaroo'],ready:['Big Koala'],printing:'SOD-JP035',date:'2004-05-27',region:'ocg'},
 {cid:4448,recipe:['Fairy Dragon','Amazon of the Seas','Zone Eater'],ready:['Fairy Dragon','Amazon of the Seas'],printing:'Booster 4',date:'1999-08-26',region:'ocg'},
 {cid:4075,recipe:['Time Wizard','Baby Dragon'],ready:['Baby Dragon'],printing:'MRD-143',date:'2002-06-26',region:'tcg'}
];
const identity=n=>{const x=h.find(x=>x.names.en===n);if(!x?.passwords[0])throw Error('No historical material '+n);return x.passwords[0];};
const mat=(uid,id)=>({uid,id}),mon=(uid,id,owner=0)=>({uid,id,owner,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const extra=id=>mat('fusion',id),poly=mat('poly','24094653'),sub=mat('sub','53493204');
const action={kind:'fusion',card:'poly',extra:'fusion',position:'atk'},pick={actor:'a',match:action},settle={settle:true},assert=(path,equals)=>({path,equals});
const batch={format:1,batchId:'m38-classic-fusions',engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates:[],reviews:[]};
for(const n of names){
 const hist=h.find(x=>x.konamiId===n.cid),id=hist.passwords[0],ready=n.ready.map(identity),recipe=n.recipe.map(identity),materials=[...ready,sub.id];
 if(recipe.length!==materials.length)throw Error('Recipe cannot be tested by one substitute '+hist.names.en);
 const source=`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${n.cid}&request_locale=en`;
 const card={id,konamiId:n.cid,name:hist.names.pt??hist.names.en,englishName:hist.names.en,kind:'monster',monsterType:'fusion',race:hist.race==='seaserpent'?'Sea Serpent':hist.race.split(' ').map(x=>x[0].toUpperCase()+x.slice(1)).join(' '),attribute:hist.attribute.toUpperCase(),level:hist.level,atk:hist.atk,defense:hist.def,summary:'Fusão de '+n.recipe.join(' + ')+'. Monstro de Fusão sem efeito; exige os materiais nomeados ou um único substituto legal.',source,fusion:recipe,...n.exclude?{excludedArchetypes:n.exclude}:{}};
 const text=`${hist.names.en} is a Level ${hist.level} ${card.attribute} ${card.race} non-Effect Fusion Monster with ${hist.atk} ATK and ${hist.def} DEF. Its entire printed Fusion recipe is ${n.recipe.map(x=>'"'+x+'"').join(' + ')}. Polymerization requires exactly these named Fusion Materials in the hand or on the field, in any order. A valid Fusion Substitute may replace at most one specifically named material; every other material must be correct. The successful Fusion Monster enters from the Extra Deck, materials are sent to their physical owners' Graveyards, negated Polymerization does not consume materials, and legal space may be freed by using field materials.${n.exclude?' This card is explicitly NOT treated as a "Cyber" card regardless of its name.':''} No other effect, activation cost, trigger, or restriction is printed.`;
 const hand=[poly,...ready.map((x,i)=>mat('mat'+i,x)),sub],basic=()=>({players:[{hand:structuredClone(hand),extra:[extra(id)]},{}]});
 const success=(fixture=basic(),actions=[pick,settle])=>({fixture,actions,assertions:[assert(['players',0,'monsters',0,'id'],id),assert(['players',0,'monsters',0,'properlySummoned'],true),{path:['players',0,'grave'],containsUID:'poly'},{path:['players',0,'grave'],containsUID:'sub'},...ready.map((_,i)=>({path:['players',0,'grave'],containsUID:'mat'+i}))]});
 const reject=(fixture=basic(),a={...action,materials:[]})=>({fixture,actions:[{actor:'a',expectError:true,action:a}],assertions:[{path:['players',0,'extra'],containsUID:'fusion'}]});
 const invalid={...basic(),players:[{hand:[poly,...ready.map((x,i)=>mat('mat'+i,x)),mat('wrong','91152256')],extra:[extra(id)]},{}]};
 const twoSubs={players:[{hand:[poly,...ready.slice(0,-1).map((x,i)=>mat('mat'+i,x)),sub,mat('sub2','50259460')],extra:[extra(id)]},{}]};
 const owners=basic();owners.players[0].hand=owners.players[0].hand.filter(x=>x.uid!=='mat0');owners.players[0].monsters=[mon('mat0',ready[0],1)];
 const full=basic();full.players[0].monsters=[mon('full0','91152256'),mon('full1','91152256'),mon('full2','91152256')];
 const denied=basic();denied.players[1]={hand:[mat('discard','91152256')],backrow:[{uid:'jammer',id:'77414722',faceUp:false,setTurn:0}]};
 const cases={
  activation:success(),resolution:success(),
  negative:reject(invalid),
  'json-restore':success(basic(),[pick,{restore:true},settle]),
  'deterministic-replay':success(),
  negation:{fixture:denied,actions:[pick,{actor:'b',match:{kind:'trap',card:'jammer'}},settle],assertions:[{path:['players',0,'extra'],containsUID:'fusion'},...ready.map((_,i)=>({path:['players',0,'hand'],containsUID:'mat'+i})),{path:['players',0,'hand'],containsUID:'sub'}]},
  'exact-materials':success(),
  'illegal-materials':reject(twoSubs),
  'extra-capacity':{fixture:{players:[{},{}]},actions:[{validateDeck:[id],expectError:true}],assertions:[assert(['players',0,'monsters','length'],0)]},
  'zone-capacity':reject(full),
  'material-owner':{...success(owners),assertions:[assert(['players',0,'monsters',0,'id'],id),{path:['players',1,'grave'],containsUID:'mat0'},...ready.slice(1).map((_,i)=>({path:['players',0,'grave'],containsUID:'mat'+(i+1)})),{path:['players',0,'grave'],containsUID:'sub'}]},
  ...n.exclude?{'cyber-name-exclusion':{fixture:basic(),actions:[{restore:true}],assertions:[{rulesNameOf:id,equals:hist.names.en}]}}:{}
 };
 const textEvidence={text,format:'full-rule-paraphrase',complete:true,source,sha256:sha(text)};
 batch.candidates.push({card,effect:{kind:'fusion'},family:'non-effect-fusion-exact-recipe',requirements:['effect:fusion'],textEvidence,scenarios:n.exclude?['cyber-name-exclusion']:[],cases});
 batch.reviews.push({id,canonicalId:hist.id,konamiId:n.cid,reviewer:'Codex: reviewed full Konami official text and regional printing on 2026-10-31',reviewedAt:'2026-10-31',identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute},verifiedPrinting:{date:n.date,set:n.printing,region:n.region,source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${n.cid}&request_locale=${n.region==='ocg'?'ja':'en'}`},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:textEvidence.sha256,semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}});
}
const file=path.join(root,'catalog/batches',batch.batchId+'.json');if(fs.existsSync(file))throw Error('Refusing to overwrite existing batch');fs.writeFileSync(file,JSON.stringify(batch,null,2)+'\n');const canonical=require('./card-batch-automation.cjs').load('catalog/batches/'+batch.batchId+'.json');fs.writeFileSync(file,JSON.stringify(canonical,null,2)+'\n');console.log('Generated '+batch.batchId+' '+batch.candidates.length+' complete Fusion candidates');
