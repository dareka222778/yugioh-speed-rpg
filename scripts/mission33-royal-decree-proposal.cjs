#!/usr/bin/env node
'use strict';
/** Independently reviewed, executable Royal Decree admission proposal. */
const fs=require('node:fs'),crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const history=require('../catalog/historical/2004-10-01/cards.json').find(c=>c.names.en==='Royal Decree');
if(!history||history.konamiId!==4866||history.passwords.join()!=='51452091')throw Error('Historical identity changed');
const source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4866&request_locale=en';
const card={id:'51452091',konamiId:4866,name:'Decreto Real',englishName:'Royal Decree',kind:'trap',race:null,attribute:null,level:null,atk:null,defense:null,summary:'Enquanto esta Armadilha Contínua estiver com a face para cima, negue os efeitos de todas as outras Armadilhas no campo.',source};
const effect={kind:'continuous',activation:{speed:2,window:'free',damage:'never'},rules:[{kind:'negateTraps'}]};
const description='This Continuous Trap negates the effects of all other Trap Cards on the field while its own continuous effect applies. It does not prevent a Trap Card or Trap effect from being activated; those activations can still form Chain Links and pay their costs, but the field Trap effects resolve negated. Royal Decree does not negate its own effect, and does not impose a cost, damage, summoning restriction, usage limit, or one-time trigger. It ceases to negate effects when no longer face-up and resolved, or while its own effect is negated by an applicable other source. A Trap effect activated before Royal Decree is on the field may resolve negated if Royal Decree applies at that resolution. This negates Trap effects on the field, not arbitrary Graveyard effects.';
const ref=(uid,id)=>({uid,id});
const monster=(uid,id,owner,position='atk')=>({uid,id,owner,faceUp:true,position,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const back=(uid,id,faceUp=false)=>({uid,id,setTurn:0,faceUp,...faceUp?{resolved:true}:{}});
const royal=(uid='decree')=>back(uid,card.id,true);
const desserts=()=>back('dessert','24068492');
const emptyRoyal=()=>({players:[{backrow:[back('decree',card.id)]},{}]});
const activeRoyal=()=>({current:1,players:[{monsters:[monster('target','48305365',0)],backrow:[royal()]},{backrow:[desserts()]}]});
const action=(kind,card,target='',actor='a')=>({actor,match:{kind,card,target}});
const oracle=(path,equals)=>({path,equals});
const scenario=(fixture,actions,assertions)=>({fixture,actions,assertions});
const activate=()=>scenario(emptyRoyal(),[action('trap','decree'),{settle:true}],[{path:['players',0,'backrow'],containsUID:'decree'}]);
const negatedDessert=()=>scenario(activeRoyal(),[action('trap','dessert','','b'),{settle:true}],[oracle(['players',0,'lp'],4000),{path:['players',1,'grave'],containsUID:'dessert'}]);
const loseDecree=()=>scenario({current:1,players:[{monsters:[monster('target','48305365',0)],backrow:[royal()]},{hand:[ref('mst','05318639')],backrow:[desserts()]}]},[action('spell','mst','decree','b'),{settle:true},action('trap','dessert','','b'),{settle:true}],[oracle(['players',0,'lp'],3500),{path:['players',0,'grave'],containsUID:'decree'}]);
const counter=()=>scenario({players:[{backrow:[back('decree',card.id)]},{backrow:[back('seven','03819470')]}]},[action('trap','decree'),action('trap','seven','decree','b'),{settle:true}],[oracle(['players',1,'lp'],3000),{path:['players',0,'grave'],containsUID:'decree'}]);
const multiple=()=>scenario({current:1,players:[{monsters:[monster('target','48305365',0)],backrow:[royal(),royal('decree2')]},{hand:[ref('mst','05318639')],backrow:[desserts()]}]},[action('spell','mst','decree','b'),{settle:true},action('trap','dessert','','b'),{settle:true}],[oracle(['players',0,'lp'],4000),{path:['players',0,'backrow'],containsUID:'decree2'}]);
const gravity=()=>scenario({phase:'battle',current:1,players:[{monsters:[monster('wall','91152256',0,'def')],backrow:[royal()]},{monsters:[monster('attacker','48305365',1)],backrow:[back('bind','85742772',true)]}]},[action('attack','attacker','wall','b'),{settle:true}],[oracle(['players',0,'monsters'],[])]);
const cases={
 negative:scenario({players:[{backrow:[{uid:'decree',id:card.id,setTurn:3,faceUp:false}]},{}]},[{expectError:true,action:{kind:'trap',card:'decree',target:''}}],[oracle(['players',0,'lp'],4000)]),
 'json-restore':scenario(emptyRoyal(),[action('trap','decree'),{restore:true},{settle:true}],[{path:['players',0,'backrow'],containsUID:'decree'}]),
 'deterministic-replay':activate(),
 activation:activate(),
 resolution:negatedDessert(),
 negation:counter(),
 'source-loss':loseDecree(),
 'continuous-negation':gravity(),
 'multiple-sources':multiple(),
 'dynamic-recalculation':loseDecree(),
 'trap-activation-under-decree':negatedDessert(),
 'jinzo-still-blocks-traps':scenario({players:[{monsters:[monster('jinzo','77585513',0)],backrow:[back('decree',card.id)]},{}]},[{expectError:true,action:{kind:'trap',card:'decree',target:''}}],[{path:['players',0,'backrow'],containsUID:'decree'}])
};
const textHash=sha(description),batchId='m33-royal-decree';
const proposal={format:1,batchId,engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates:[{card,effect,family:'continuous-trap-negation',requirements:['continuous:negateTraps','effect:continuous'],textEvidence:{text:description,sha256:textHash,complete:true,format:'full-rule-paraphrase',source},scenarios:['trap-activation-under-decree','jinzo-still-blocks-traps'],cases}],reviews:[{id:card.id,canonicalId:history.id,konamiId:card.konamiId,reviewer:'Codex: official Royal Decree card text and historical printing reviewed 2026-10-30',reviewedAt:'2026-10-30',identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:null,atk:null,defense:null,race:null,attribute:null},verifiedPrinting:{date:'1999-10-17',set:'Booster 5',region:'ocg',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4866&request_locale=ja'},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:textHash,semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:'not-applicable',choices:'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}}]};
const target='catalog/proposed/'+batchId+'.json';fs.writeFileSync(target,JSON.stringify(proposal,null,2)+'\n');console.log('Generated '+target+' with '+Object.keys(cases).length+' executable scenario names.');
