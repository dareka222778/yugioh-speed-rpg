#!/usr/bin/env node
'use strict';
/** Newdoria: mandatory after-battle-destruction targeted destroy. */
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const history=require('../catalog/historical/2004-10-01/cards.json').find(h=>h.names.en==='Newdoria');
if(!history||history.konamiId!==5484||history.passwords.join()!=='04335645')throw Error('Historical Newdoria identity changed');
const id='04335645',source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5484&request_locale=en';
const text='If this card is destroyed by battle and sent to the GY: Target 1 monster on the field; destroy that target.';
const card={id,konamiId:5484,name:'Newdoria',englishName:'Newdoria',kind:'monster',monsterType:'effect',race:'Fiend',attribute:'DARK',level:4,atk:1200,defense:800,summary:'Se for destruído por batalha e enviado ao Cemitério: escolha 1 monstro no campo como alvo; destrua-o.',source};
const effect={kind:'monsterEffect'};
const monsterDefinition={effect:{trigger:'onBattleDestroyed',operation:{kind:'singleCard',rule:{from:'monsters',controller:'both',action:'destroy',kind:'monster'}}},activation:{policy:'mandatory',window:'battleDestroyed'}};
const m=(uid,id,owner,position='atk')=>({uid,id,owner,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const r=(uid,id)=>({uid,id});
const battle=(extra={})=>({phase:'battle',players:[{monsters:[m('attacker','89631139',0),...extra.own??[]],...extra.p0},{monsters:[m('newdoria',id,1),...extra.other??[]],...extra.p1}]});
const attack={actor:'a',match:{kind:'attack',card:'attacker',target:'newdoria'}};
const choice={actor:'b',match:{kind:'choose',target:'attacker'}};
const oracle=(path,equals)=>({path,equals});
const result=()=>({fixture:battle(),actions:[attack,{settle:true},choice,{settle:true}],assertions:[{path:['players',1,'grave'],containsUID:'newdoria'},{path:['players',0,'grave'],containsUID:'attacker'},oracle(['players',0,'monsters'],[])]});
const cases={
 negative:{fixture:battle(),actions:[{actor:'b',expectError:true,action:{kind:'choose',target:'attacker'}}],assertions:[oracle(['players',0,'lp'],4000)]},
 'json-restore':{fixture:battle(),actions:[attack,{restore:true},{settle:true},{restore:true},choice,{settle:true}],assertions:[{path:['players',0,'grave'],containsUID:'attacker'}]},
 'deterministic-replay':result(),activation:result(),resolution:result(),negation:result(),
 'target-activation':result(),'target-resolution':result(),'target-zone-change':result(),'target-unavailable':result(),
 'trigger-timing':{fixture:{players:[{hand:[r('hole','53129443')]},{monsters:[m('newdoria',id,1)]}]},actions:[{actor:'a',match:{kind:'spell',card:'hole'}},{settle:true}],assertions:[{path:['players',1,'grave'],containsUID:'newdoria'},oracle(['phase'],'main')]},
 'no-battle-no-trigger':{fixture:{players:[{hand:[r('hole','53129443')]},{monsters:[m('newdoria',id,1)]}]},actions:[{actor:'a',match:{kind:'spell',card:'hole'}},{settle:true}],assertions:[oracle(['phase'],'main')]}
};
const desc='After this monster is destroyed specifically by battle and placed in its owner Graveyard, its mandatory Trigger Effect activates in a separate post-damage chain. Its owner selects exactly one currently legal monster anywhere on the field as the target at activation. When the effect resolves, if the target is still the same physical monster in the same legal zone, destroy it and send it to its physical owner Graveyard. The effect does not trigger on effect destruction, has no activation cost, is not optional, and does not need Newdoria to remain on the field. Monster-effect negation on the field (e.g. Skill Drain) does not negate a monster effect activated in the Graveyard; destruction immunity can still protect a target. The source has no other effect.';
const batchId='m35-newdoria-battle-target';
const proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates:[{card,effect,monster:monsterDefinition,family:'battle-destruction-target',requirements:['effect:monsterEffect','trigger:onBattleDestroyed','monster-operation:singleCard'],textEvidence:{text:desc,complete:true,format:'full-rule-paraphrase',sha256:sha(desc),source},scenarios:['no-battle-no-trigger'],cases}],reviews:[{id,canonicalId:history.id,konamiId:5484,reviewer:'Konami official card details; Newdoria post-battle mandatory trigger verified',reviewedAt:'2026-10-30',identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:4,atk:1200,defense:800,race:'Fiend',attribute:'DARK'},verifiedPrinting:{date:'2002-05-16',region:'ocg',set:'Pharaonic Guardian',source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:sha(desc),semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'represented',choices:'represented',operations:'represented',duration:'not-applicable',restrictions:'represented',negation:'represented'}}]};
fs.writeFileSync('catalog/proposed/'+batchId+'.json',JSON.stringify(proposal,null,2)+'\n');
console.log('Generated '+batchId);
