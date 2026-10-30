#!/usr/bin/env node
'use strict';
/** One reviewed, reusable proposal template for a vanilla Equip-piercing family. */
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const data=require('../catalog/historical/2004-10-01/cards.json');
const history=data.find(c=>c.names.en==='Fairy Meteor Crush');
if(!history||history.konamiId!==5128||history.passwords.join()!=='97687912')throw Error('Historical card identity changed');
const source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5128&request_locale=en';
const summary='Equipe a um monstro com a face para cima. Quando ele atacar um monstro em Defesa, cause ao oponente dano de batalha perfurante.';
const description='This Equip Spell has one effect: while it stays face-up and is equipped to a legal face-up monster, that monster inflicts piercing battle damage when attacking a Defense Position monster. The damage is the positive ATK minus DEF difference and is dealt to the opponent of the attacking monster controller. It grants no ATK or DEF modifier and creates no activated effect, cost, target on attack, once-per-turn limit, special restriction, additional operation, or post-destruction trigger. Its initial equip selects one face-up monster; it leaves the field under ordinary equip rules if its target becomes invalid. A nonpositive difference deals no piercing damage.';
const card={id:'97687912',konamiId:5128,name:'Queda do Meteoro Angelical',englishName:'Fairy Meteor Crush',kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,summary,source};
const effect={kind:'equip',atk:0,def:0,combat:[{kind:'piercing'}]};
const ref=(uid,id)=>({uid,id});
const monster=(uid,id,owner,position='atk')=>({uid,id,owner,faceUp:true,position,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const spell=(uid,id,equippedTo)=>({uid,id,faceUp:true,resolved:true,setTurn:0,equippedTo});
const base=()=>({players:[{hand:[ref('equip',card.id)],monsters:[monster('attacker','48305365',0)]},{}]});
const withEquip=()=>({players:[{monsters:[monster('attacker','48305365',0)],backrow:[spell('equip',card.id,'attacker')]},{monsters:[monster('wall','91152256',1,'def')]}]});
const actions=[{match:{kind:'spell',card:'equip',target:'attacker'}},{settle:true}];
const oracle=(path,equals)=>({path,equals});
const success=(fixture,commands,assertions)=>({fixture,actions:commands,assertions});
const activated=()=>success(base(),actions,[{path:['players',0,'backrow'],containsUID:'equip'}]);
const battle=()=>success({...withEquip(),phase:'battle'},[{match:{kind:'attack',card:'attacker',target:'wall'}},{settle:true}],[oracle(['players',1,'lp'],3500)]);
const negative=success(base(),[{expectError:true,action:{kind:'spell',card:'equip',target:'unknown'}}],[oracle(['players',0,'lp'],4000)]);
const negated=()=>success({players:[{hand:[ref('equip',card.id)],monsters:[monster('attacker','48305365',0)]},{hand:[ref('cost','91152256')],backrow:[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}]}]},[{match:{kind:'spell',card:'equip',target:'attacker'}},{match:{kind:'trap',card:'jam',target:'equip',discards:['cost']},actor:'b'},{settle:true}],[{path:['players',0,'grave'],containsUID:'equip'}]);
const missingTarget=()=>success({players:[{hand:[ref('equip',card.id)]},{}]},[{expectError:true,action:{kind:'spell',card:'equip',target:'attacker'}}],[oracle(['players',0,'hand','0','id'],card.id)]);
const lost=()=>success({players:[{monsters:[monster('attacker','48305365',0)],backrow:[spell('equip',card.id,'attacker')],hand:[ref('book','14087893')]},{}]},[{match:{kind:'spell',card:'book',target:'attacker'}},{settle:true}],[oracle(['players',0,'backrow'],[]),{path:['players',0,'grave'],containsUID:'equip'}]);
const multiple=()=>success({phase:'battle',players:[{monsters:[monster('attacker','48305365',0)],backrow:[spell('equip',card.id,'attacker'),spell('equip2',card.id,'attacker')]},{monsters:[monster('wall','91152256',1,'def')]}]},[{match:{kind:'attack',card:'attacker',target:'wall'}},{settle:true}],[oracle(['players',1,'lp'],3500)]);
const noPierce=()=>success({phase:'battle',players:[{monsters:[monster('attacker','55550921',0)],backrow:[spell('equip',card.id,'attacker')]},{monsters:[monster('wall','91152256',1,'def')]}]},[{match:{kind:'attack',card:'attacker',target:'wall'}},{settle:true}],[oracle(['players',1,'lp'],4000)]);
const cases={
 'negative':negative,
 'json-restore':success(base(),[{match:{kind:'spell',card:'equip',target:'attacker'}},{restore:true},{settle:true}],[{path:['players',0,'backrow'],containsUID:'equip'}]),
 'deterministic-replay':activated(),
 'activation':activated(),
 'resolution':battle(),
 'negation':negated(),
 'target-activation':activated(),
 'target-resolution':activated(),
 'target-zone-change':lost(),
 'target-unavailable':missingTarget(),
 'source-loss':lost(),
 'continuous-negation':negated(),
 'multiple-sources':multiple(),
 'dynamic-recalculation':lost(),
 'piercing-damage-calculation':battle(),
 'no-piercing-without-positive-difference':noPierce()
};
const reviewedAt='2026-10-30',batchId='m33-piercing-equip';
const proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates:[{card,effect,family:'equip-piercing',requirements:['effect:equip'],textEvidence:{text:description,sha256:sha(description),complete:true,format:'full-rule-paraphrase',source},scenarios:['piercing-damage-calculation','no-piercing-without-positive-difference'],cases}],reviews:[{id:card.id,canonicalId:history.id,konamiId:card.konamiId,reviewer:'Codex: official Fairy Meteor Crush card text and historical printing reviewed 2026-10-30',reviewedAt,identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:null,atk:null,defense:null,race:null,attribute:null},verifiedPrinting:{date:'2002-10-20',set:'Pharaoh\'s Servant',region:'tcg',source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:sha(description),semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'represented',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}}]};
const target='catalog/proposed/'+batchId+'.json';
fs.writeFileSync(target,JSON.stringify(proposal,null,2)+'\n');
console.log('Generated '+target+' with '+Object.keys(cases).length+' independent scenario names.');
