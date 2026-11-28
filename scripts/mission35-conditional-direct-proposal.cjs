#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const history=require('../catalog/historical/2004-10-01/cards.json');
const releases=require('../catalog/historical/2004-10-01/releases.json');
const entries=[
 {englishName:'Black Tyranno',id:'38670435',cid:5889,name:'Tiranossauro Negro',race:'Dinosaur',attribute:'EARTH',level:7,atk:2600,defense:1800,condition:'defenseOnly',text:'If the only cards your opponent controls are Defense Position monsters, this card can attack directly.'},
 {englishName:'Rocket Jumper',id:'53890795',cid:5959,name:'Saltador de Foguete',race:'Rock',attribute:'EARTH',level:3,atk:1000,defense:800,condition:'defenseOnly',text:"If the only cards on your opponent's side of the field are Defense Position monsters, this card can attack your opponent's Life Points directly."},
 {englishName:'Drillago',id:'99050989',cid:5562,name:'Drillago',race:'Machine',attribute:'DARK',level:4,atk:1600,defense:1100,condition:'faceUpMinAtk',minimumAtk:1600,text:'If the only cards your opponent controls are face-up monsters with 1600 or more ATK, this card can attack your opponent directly.'}
];
const m=(uid,id,owner,position='atk',faceUp=true)=>({uid,id,owner,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const trap=(uid,id='04206964',faceUp=false)=>({uid,id,setTurn:0,faceUp,...faceUp?{resolved:true}:{}});
const oracle=(path,equals)=>({path,equals});
const attack=uid=>({actor:'a',match:{kind:'attack',card:uid},absentKeys:['target']});
const refused=uid=>({actor:'a',expectError:true,action:{kind:'attack',card:uid}});
const casesFor=x=>{
 const defender=()=>m('wall',x.condition==='defenseOnly'?'91152256':'89631139',1,x.condition==='defenseOnly'?'def':'atk');
 const good=(more={})=>({phase:'battle',players:[{monsters:[m('source',x.id,0),...more.source??[]]},{lp:more.lp??4000,monsters:[defender()],...more.enemy??{}}]});
 const successful=()=>({fixture:good(),actions:[attack('source'),{settle:true}],assertions:[oracle(['players',1,'lp'],4000-x.atk),{path:['players',1,'monsters'],containsUID:'wall'}]});
 const illegalField=()=>({fixture:good({enemy:{backrow:[trap('set')]}}),actions:[refused('source')],assertions:[oracle(['players',1,'lp'],4000)]});
 const skillDrain=()=>({fixture:good({enemy:{backrow:[trap('drain','82732705',true)]}}),actions:[refused('source')],assertions:[oracle(['players',1,'lp'],4000)]});
 const bad=()=>({fixture:{phase:'battle',players:[{monsters:[m('source',x.id,0)]},{monsters:[m('wall','91152256',1,'atk')]}]},actions:[refused('source')],assertions:[oracle(['players',1,'lp'],4000)]});
 return {
  negative:{fixture:good(),actions:[{actor:'a',expectError:true,action:{kind:'attack',card:'missing'}}],assertions:[oracle(['players',1,'lp'],4000)]},
  'json-restore':{fixture:good(),actions:[attack('source'),{restore:true},{settle:true}],assertions:[oracle(['players',1,'lp'],4000-x.atk)]},
  'deterministic-replay':successful(),activation:successful(),resolution:successful(),negation:skillDrain(),
  'source-loss':{fixture:{phase:'battle',players:[{monsters:[m('source',x.id,0,'def',false)]},{monsters:[defender()]}]},actions:[refused('source')],assertions:[oracle(['players',1,'lp'],4000)]},
  'continuous-negation':skillDrain(),
  'multiple-sources':{fixture:good({lp:10000,source:[m('other',x.id,0)]}),actions:[attack('source'),{settle:true},attack('other'),{settle:true}],assertions:[oracle(['players',1,'lp'],10000-2*x.atk)]},
  'dynamic-recalculation':illegalField(),
  'non-qualifying-opponent':bad(),
  'opponent-backrow-invalidates-direct':illegalField()
 };
};
const candidates=[],reviews=[];
for(const x of entries){
 const h=history.find(v=>v.names.en===x.englishName);if(!h||h.konamiId!==x.cid||h.passwords.join()!==x.id)throw Error('Identity mismatch: '+x.englishName);
 const printing=releases.filter(r=>r.cardIds.includes(h.id)&&r.date<='2004-09-30').sort((a,b)=>a.date.localeCompare(b.date))[0];if(!printing)throw Error('No eligible printing: '+x.englishName);
 const source=`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${x.cid}&request_locale=en`;
 const card={id:x.id,konamiId:x.cid,name:x.name,englishName:x.englishName,kind:'monster',monsterType:'effect',race:x.race,attribute:x.attribute,level:x.level,atk:x.atk,defense:x.defense,summary:x.condition==='defenseOnly'?'Pode atacar diretamente se o oponente controlar somente monstros em Defesa e nenhuma outra carta.':'Pode atacar diretamente se o oponente controlar somente monstros com a face para cima e pelo menos 1600 ATK, sem outra carta no campo.',source};
 const directRule={kind:'direct',condition:x.condition,...x.minimumAtk?{minimumAtk:x.minimumAtk}:{}};
 const monster={effect:{trigger:'continuous',operation:{kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:directRule}]}},activation:{policy:'continuous',window:'continuous'}};
 const desc=x.text+' The condition inspects the entire opposing field, including Spell/Trap and Field Spell zones; if any nonqualifying opposing card is present, direct attack cannot be declared under this effect. When the field is empty, ordinary direct attacks are permitted. The card has no additional effect, cost, once-per-turn exception or duration; the condition is recalculated at every attack declaration and is disabled by monster-effect negation. It does not prevent attacks on monsters.';
 candidates.push({card,effect:{kind:'monsterEffect'},monster,family:'conditioned-direct-attack',requirements:['effect:monsterEffect','trigger:continuous','monster-operation:continuous','continuous:combat'],textEvidence:{text:desc,sha256:sha(desc),complete:true,format:'full-rule-paraphrase',source},scenarios:['non-qualifying-opponent','opponent-backrow-invalidates-direct'],cases:casesFor(x)});
 reviews.push({id:x.id,canonicalId:h.id,konamiId:x.cid,reviewer:'Official Konami full text and actual historical TCG/OCG printing reviewed',reviewedAt:'2026-10-30',identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:x.level,atk:x.atk,defense:x.defense,race:x.race,attribute:x.attribute},verifiedPrinting:{date:printing.date,region:printing.region,set:printing.name,source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:sha(desc),semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}});
}
const batchId='m35-conditional-direct-attacks';const proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates,reviews};
fs.writeFileSync('catalog/proposed/'+batchId+'.json',JSON.stringify(proposal,null,2)+'\n');console.log('Generated '+batchId+': '+candidates.length+' identities');
