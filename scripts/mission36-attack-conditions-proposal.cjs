#!/usr/bin/env node
'use strict';
/** Two independently reviewed 2004-eligible passive attack restrictions. */
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const history=require('../catalog/historical/2004-10-01/cards.json');
const releases=require('../catalog/historical/2004-10-01/releases.json');
const cards=[
 {id:'80233946',englishName:'Gora Turtle',cid:5411,name:'Tartaruga Gora',race:'Aqua',attribute:'WATER',level:3,atk:1100,defense:1100,summary:'Enquanto esta carta estiver com a face para cima no campo, monstros com 1900 ou mais de ATK não podem declarar ataques.',sourceText:'As long as this card remains face-up on the field, monsters with an ATK equal to 1900 or more cannot declare an attack.',rules:[{kind:'preventAttack',filter:{controller:'both',minimumCurrentAtk:1900},declarationOnly:true}]},
 {id:'03366982',englishName:"Alligator's Sword Dragon",cid:5003,name:'Dragão Espada do Jacaré',race:'Dragon',attribute:'WIND',level:5,atk:1700,defense:1500,summary:'Fusão de Baby Dragon e Alligator\'s Sword. Pode atacar diretamente se todos os monstros com a face para cima do oponente forem TERRA, ÁGUA ou FOGO.',sourceText:'"Baby Dragon" + "Alligator\'s Sword". This card can attack your opponent directly if the only face-up monsters they control are EARTH, WATER, or FIRE.',fusion:['88819587','64428736'],rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'direct',condition:'faceUpAttributesOnly',attributes:['EARTH','WATER','FIRE']}}]}
];
const m=(uid,id,owner,position='atk',faceUp=true,atkBoost=0)=>({uid,id,owner,position,faceUp,entered:0,changed:0,attacked:0,atkBoost,defBoost:0});
const spell=(uid,id='04206964',faceUp=false)=>({uid,id,setTurn:0,faceUp,...faceUp?{resolved:true}:{}});
const go=uid=>({actor:'a',match:{kind:'attack',card:uid},absentKeys:['target']});
const refuse=uid=>({actor:'a',expectError:true,action:{kind:'attack',card:uid}});
const o=(path,equals)=>({path,equals});
const goraCases=()=>{
 const source=m('turtle','80233946',0),strong=m('strong','89631139',0),drain=spell('drain','82732705',true);
 const f=(own=[source,strong],enemy=[],backrow=[])=>({phase:'battle',players:[{monsters:own},{monsters:enemy,backrow}]});
 const blocked=()=>({fixture:f(),actions:[refuse('strong')],assertions:[o(['players',1,'lp'],4000)]});
 const allowed=()=>({fixture:f([source]),actions:[go('turtle'),{settle:true}],assertions:[o(['players',1,'lp'],2900)]});
 return {negative:{fixture:f(),actions:[{actor:'a',expectError:true,action:{kind:'attack',card:'ghost'}}],assertions:[o(['players',1,'lp'],4000)]},
  'json-restore':{fixture:f([source]),actions:[go('turtle'),{restore:true},{settle:true}],assertions:[o(['players',1,'lp'],2900)]},
  'deterministic-replay':allowed(),activation:blocked(),resolution:allowed(),negation:{fixture:f(undefined,[],[drain]),actions:[go('strong'),{settle:true}],assertions:[o(['players',1,'lp'],1000)]},
  'source-loss':{fixture:f([strong]),actions:[go('strong'),{settle:true}],assertions:[o(['players',1,'lp'],1000)]},
  'continuous-negation':{fixture:f(undefined,[],[drain]),actions:[go('strong'),{settle:true}],assertions:[o(['players',1,'lp'],1000)]},
  'multiple-sources':{fixture:f([source,m('second','80233946',0),strong]),actions:[refuse('strong')],assertions:[o(['players',1,'lp'],4000)]},
  'dynamic-recalculation':{fixture:f([source,m('strong','80233946',0,'atk',true,900)]),actions:[refuse('strong')],assertions:[o(['players',1,'lp'],4000)]},
  'attacking-high-atk':blocked(),'weak-monster-allowed':allowed(),
  'face-down-source':{fixture:f([m('turtle','80233946',0,'def',false),strong]),actions:[go('strong'),{settle:true}],assertions:[o(['players',1,'lp'],1000)]},
  'dynamic-current-atk':{fixture:f([source,m('strong','80233946',0,'atk',true,799)]),actions:[go('strong'),{settle:true}],assertions:[o(['players',1,'lp'],2101)]},
  'dynamic-threshold-block':{fixture:f([source,m('strong','80233946',0,'atk',true,900)]),actions:[refuse('strong')],assertions:[o(['players',1,'lp'],4000)]}};
};
const alligatorCases=()=>{
 const dragon=m('dragon','03366982',0),water=m('water','80233946',1),hiddenDark=m('hidden','04335645',1,'def',false),dark=m('dark','04335645',1),drain=spell('drain','82732705',true);
 const fusionCase={fixture:{players:[{hand:[{uid:'poly',id:'24094653'},{uid:'mat0',id:'88819587'},{uid:'mat1',id:'64428736'}],extra:[{uid:'fusion',id:'03366982'}]},{}]},actions:[{actor:'a',match:{kind:'fusion',card:'poly',extra:'fusion',position:'atk'}},{settle:true}],assertions:[o(['players',0,'monsters',0,'id'],'03366982'),o(['players',0,'monsters',0,'properlySummoned'],true),{path:['players',0,'grave'],containsUID:'mat0'},{path:['players',0,'grave'],containsUID:'mat1'}]};
 const f=(opponent=[water,hiddenDark],backrow=[spell('set')],source=dragon)=>({phase:'battle',players:[{monsters:[source]},{monsters:opponent,backrow}]});
 const allowed=()=>({fixture:f(),actions:[go('dragon'),{settle:true}],assertions:[o(['players',1,'lp'],2300),{path:['players',1,'monsters'],containsUID:'hidden'}]});
 const blocked=()=>({fixture:f([dark]),actions:[refuse('dragon')],assertions:[o(['players',1,'lp'],4000)]});
 return {negative:{fixture:f(),actions:[{actor:'a',expectError:true,action:{kind:'attack',card:'missing'}}],assertions:[o(['players',1,'lp'],4000)]},
  'json-restore':{fixture:f(),actions:[go('dragon'),{restore:true},{settle:true}],assertions:[o(['players',1,'lp'],2300)]},
  'deterministic-replay':allowed(),activation:allowed(),resolution:allowed(),
  negation:{fixture:f([water],[drain]),actions:[refuse('dragon')],assertions:[o(['players',1,'lp'],4000)]},
  'continuous-negation':{fixture:f([water],[drain]),actions:[refuse('dragon')],assertions:[o(['players',1,'lp'],4000)]},
  'source-loss':{fixture:f([water],[],m('dragon','03366982',0,'def',false)),actions:[refuse('dragon')],assertions:[o(['players',1,'lp'],4000)]},
  'multiple-sources':{fixture:{phase:'battle',players:[{monsters:[dragon,m('dragon2','03366982',0)]},{lp:10000,monsters:[water]}]},actions:[go('dragon'),{settle:true},go('dragon2'),{settle:true}],assertions:[o(['players',1,'lp'],6600)]},
  'dynamic-recalculation':blocked(),
  'exact-fusion-materials':fusionCase,
  'face-up-ineligible':blocked(),
  'spell-and-hidden-monsters':allowed(),
  'no-face-up-opponent':{fixture:f([hiddenDark]),actions:[go('dragon'),{settle:true}],assertions:[o(['players',1,'lp'],2300)]},
  'face-down-source':{fixture:f([water],[],m('dragon','03366982',0,'def',false)),actions:[refuse('dragon')],assertions:[o(['players',1,'lp'],4000)]}};
};
const candidates=[],reviews=[];
for(const x of cards){
 const h=history.find(v=>v.names.en===x.englishName);if(!h||h.konamiId!==x.cid||h.passwords.join()!==x.id)throw Error('Historical identity mismatch '+x.englishName);
 const printing=releases.filter(r=>r.cardIds.includes(h.id)&&r.date<='2004-09-30').sort((a,b)=>a.date.localeCompare(b.date))[0];if(!printing)throw Error('No historical printing '+x.englishName);
 const src=`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${x.cid}&request_locale=en`;
 const card={id:x.id,konamiId:x.cid,name:x.name,englishName:x.englishName,kind:'monster',monsterType:x.fusion?'fusion':'effect',race:x.race,attribute:x.attribute,level:x.level,atk:x.atk,defense:x.defense,summary:x.summary,source:src,...x.fusion?{fusion:x.fusion}:{}};
 const monster={effect:{trigger:'continuous',operation:{kind:'continuous',rules:x.rules}},activation:{policy:'continuous',window:'continuous'}};
 const evidence=x.sourceText+' The persistent, face-up source is required; the effect is disabled by monster-effect negation. Attack declarations are validated against current field state. Previous declared attacks are not retroactively cancelled. '+(x.fusion?'The exact Fusion Materials are Baby Dragon and Alligator\'s Sword. Opposing face-down monsters and Spell/Trap Cards do not disqualify a direct attack; only face-up monsters with other Attributes do.':'The threshold applies to both players using current ATK, including modifications; 1899 ATK can attack and 1900 ATK cannot.');
 candidates.push({card,effect:{kind:'monsterEffect'},monster,family:'continuous-attack-conditions',requirements:['effect:monsterEffect','trigger:continuous','monster-operation:continuous',x.fusion?'continuous:combat':'continuous:preventAttack'],textEvidence:{text:evidence,sha256:hash(evidence),complete:true,format:'full-rule-paraphrase',source:src},scenarios:x.fusion?['face-up-ineligible','spell-and-hidden-monsters','no-face-up-opponent','exact-fusion-materials']:['attacking-high-atk','weak-monster-allowed','face-down-source','dynamic-current-atk','dynamic-threshold-block'],cases:x.fusion?alligatorCases():goraCases()});
 reviews.push({id:x.id,canonicalId:h.id,konamiId:x.cid,reviewer:'Official Konami card details and eligible historical OCG or TCG printing reviewed',reviewedAt:'2026-10-30',identityApproved:true,mechanicsApproved:true,primarySource:src,primaryFacts:{level:x.level,atk:x.atk,defense:x.defense,race:x.race,attribute:x.attribute},verifiedPrinting:{date:printing.date,region:printing.region,set:printing.name,source:src},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:hash(evidence),semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}});
}
const batchId='m36-passive-attack-conditions',proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates,reviews};
fs.writeFileSync('catalog/proposed/'+batchId+'.json',JSON.stringify(proposal,null,2)+'\n');
console.log('Generated',batchId,candidates.length);
