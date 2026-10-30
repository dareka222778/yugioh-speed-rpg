#!/usr/bin/env node
'use strict';
/** Four independently identified RDS cards; one shared exact continuous mechanic. */
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const history=require('../catalog/historical/2004-10-01/cards.json');
const releases=require('../catalog/historical/2004-10-01/releases.json');
const names=[
 ['Eagle Eye','Olho de Águia','53693416','Winged Beast','WIND'],
 ['Creeping Doom Manta','Arraia da Destruição','52571838','Fish','WATER'],
 ['Invasion of Flames','Invasão das Chamas','26082229','Pyro','FIRE'],
 ['Tactical Espionage Expert','Especialista em Espionagem Tática','89698120','Warrior','EARTH']
];
const record=(uid,id)=>({uid,id});
const monster=(uid,id,owner)=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const trap=(uid,id='04206964',faceUp=false)=>({uid,id,setTurn:0,faceUp,...faceUp?{resolved:true}:{}});
const summon=(uid='summoned',actor='a')=>({actor,match:{kind:'summon',card:uid,position:'atk',tributes:[]}});
const trapAction=(uid='hole',target='summoned',actor='b')=>({actor,match:{kind:'trap',card:uid,target}});
const rejected=(uid='hole',target='summoned',actor='b')=>({actor,expectError:true,action:{kind:'trap',card:uid,target}});
const oracle=(path,equals)=>({path,equals});
const spec=(fixture,actions,assertions)=>({fixture,actions,assertions});
function createCases(id){
 const base=()=>({players:[{hand:[record('summoned',id)]},{backrow:[trap('hole')]}]});
 const blocked=()=>spec(base(),[summon(),rejected(),{settle:true}],[
  {path:['players',0,'monsters'],containsUID:'summoned'},
  {path:['players',1,'backrow'],containsUID:'hole'},
  oracle(['phase'],'main')
 ]);
 // With all responses prohibited, the engine closes the empty response
 // window immediately; no artificial pending summon is left dangling.
 const before=()=>spec(base(),[summon()],[oracle(['pending','kind'],'none'),oracle(['phase'],'main'),{path:['players',0,'monsters'],containsUID:'summoned'},{path:['players',1,'backrow'],containsUID:'hole'}]);
 const negated=()=>spec({players:[{hand:[record('summoned',id)]},{backrow:[trap('hole'),trap('drain','82732705',true)]}]},
  [summon(),trapAction(),{settle:true}],[
   {path:['players',0,'grave'],containsUID:'summoned'},
   {path:['players',1,'grave'],containsUID:'hole'}
  ]);
 const unrelated=()=>spec({current:1,players:[{monsters:[monster('older',id,0)],backrow:[trap('hole')]},{hand:[record('summoned','48305365')]}]},
  [summon('summoned','b'),trapAction('hole','summoned','a'),{settle:true}],[
   {path:['players',1,'grave'],containsUID:'summoned'},
   {path:['players',0,'monsters'],containsUID:'older'}
  ]);
 return {
  negative:spec(base(),[summon(),rejected()],[{path:['players',1,'backrow'],containsUID:'hole'}]),
  'json-restore':spec(base(),[summon(),{restore:true},rejected(),{settle:true}],[{path:['players',0,'monsters'],containsUID:'summoned'}]),
  'deterministic-replay':blocked(),
  activation:before(),
  resolution:blocked(),
  negation:negated(),
  'source-loss':unrelated(),
  'continuous-negation':negated(),
  'multiple-sources':spec({players:[{hand:[record('summoned',id)],monsters:[monster('older',id,0)]},{backrow:[trap('hole')]}]},
   [summon(),rejected(),{settle:true}],[{path:['players',0,'monsters'],containsUID:'older'},{path:['players',0,'monsters'],containsUID:'summoned'}]),
  'dynamic-recalculation':unrelated(),
  'non-normal-summon-scope':unrelated()
 };
}
const description='When this monster itself is successfully Normal Summoned, neither player can activate Trap Cards in the immediate response window to that Normal Summon. The prohibition does not apply to Flip Summons, Special Summons, other monsters being summoned, or later chain windows. It has no activation, cost, target, secondary operation or duration beyond the specified summoning window. Monster-effect negation stops this restriction while the source is face-up.';
const candidates=[],reviews=[],date='2026-10-30';
for(const [englishName,name,id,race,attribute] of names){
 const h=history.find(x=>x.names.en===englishName),print=releases.find(x=>x.region==='ocg'&&x.date==='2004-08-05'&&x.name==='Rise of Destiny'&&x.cardIds.includes(h?.id));
 if(!h||h.passwords.length!==1||h.passwords[0]!==id||!print||h.firstObserved.world!=='2004-08-05')throw Error('Historical identity or RDS printing mismatch: '+englishName);
 const source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid='+h.konamiId+'&request_locale=en';
 const card={id,konamiId:h.konamiId,name,englishName,kind:'monster',monsterType:'effect',race,attribute,level:3,atk:1300,defense:1200,summary:'Quando este monstro é Invocado por Invocação-Normal, nenhum jogador pode ativar Armadilhas em resposta a essa Invocação.',source};
 const effect={kind:'monsterEffect'};
 const monsterDefinition={effect:{trigger:'continuous',operation:{kind:'continuous',rules:[{kind:'preventActivation',cardKind:'trap',controller:'both',window:'ownNormalSummon'}]}},activation:{policy:'continuous',window:'continuous'}};
 const textHash=sha(description),cases=createCases(id);
 candidates.push({card,effect,monster:monsterDefinition,family:'normal-summon-trap-lock',requirements:['effect:monsterEffect','trigger:continuous','monster-operation:continuous','continuous:preventActivation'],textEvidence:{text:description,sha256:textHash,complete:true,format:'full-rule-paraphrase',source},scenarios:['non-normal-summon-scope'],cases});
 reviews.push({id,canonicalId:h.id,konamiId:h.konamiId,reviewer:'Codex: RDS 2004 OCG printing and exact one-sentence effect reviewed',reviewedAt:date,identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:3,atk:1300,defense:1200,race,attribute},verifiedPrinting:{date:'2004-08-05',set:'Rise of Destiny',region:'ocg',source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:textHash,semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}});
}
const batchId='m34-summon-trap-lock';
const proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates,reviews};
fs.writeFileSync('catalog/proposed/'+batchId+'.json',JSON.stringify(proposal,null,2)+'\n');
console.log('Generated '+batchId+': '+candidates.length+' exact RDS cards and '+Object.keys(candidates[0].cases).length+' scenario types each.');
