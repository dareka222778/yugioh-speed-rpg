'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const spec=require('../docs/evidence/m60-flip-cycle-research.json');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9/manifest.json'),'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'catalog/engine-v9',manifest.current+'.json'),'utf8'));
const expected={
 '15383415':{konamiId:5418,name:'Swarm of Scarabs',race:'Insect',attribute:'DARK',atk:500,defense:1000,sourceCid:'5418',date:'2003-07-18',set:'PGD-021',operation:{kind:'targetGroup',rule:{from:'monsters',action:'destroy',minimum:1,maximum:1}}},
 '41872150':{konamiId:5419,name:'Swarm of Locusts',race:'Insect',attribute:'DARK',atk:1000,defense:500,sourceCid:'5419',date:'2003-07-18',set:'PGD-022',operation:{kind:'targetGroup',rule:{from:'backrow',action:'destroy',minimum:1,maximum:1}}},
 '03510565':{konamiId:5882,name:'Stealth Bird',race:'Winged Beast',attribute:'DARK',atk:700,defense:1700,sourceCid:'5882',date:'2004-03-01',set:'IOC-068',operation:{kind:'burn',amount:1000}},
 '02326738':{konamiId:5427,name:'Des Lacooda',race:'Zombie',attribute:'EARTH',atk:500,defense:600,sourceCid:'5427',date:'2003-07-18',set:'PGD-030',operation:{kind:'draw',count:1}}
};
const byId=new Map(spec.candidates.map(candidate=>[candidate.card.id,candidate]));
const commonScenarios=['flip-summon-only','self-set-main-phase-only','self-set-once-per-turn','self-set-negation-consumes-use','self-set-json-restore','face-down-is-not-a-flip-trigger','source-removal-before-resolution','two-copies-have-independent-use-markers'];

test('M60 research covers exactly four distinct, source-linked historical cards',()=>{
 assert.equal(spec.batchId,'m60-flip-cycle');
 assert.equal(spec.candidates.length,4);
 assert.equal(new Set(spec.candidates.map(c=>c.card.id)).size,4);
 assert.equal(spec.baseRevision,manifest.current);
 for(const [id,fact] of Object.entries(expected)){
  const candidate=byId.get(id);assert.ok(candidate,'missing '+id);
  const card=candidate.card;
  assert.equal(card.konamiId,fact.konamiId);
  assert.equal(card.name,fact.name);
  assert.equal(card.race,fact.race);
  assert.equal(card.attribute,fact.attribute);
  assert.equal(card.level,3);
  assert.equal(card.atk,fact.atk);
  assert.equal(card.defense,fact.defense);
  assert.match(card.id,/^\d{8}$/);
  const source=new URL(card.source);
  assert.equal(source.protocol,'https:');
  assert.equal(source.hostname,'www.db.yugioh-card.com');
  assert.equal(source.pathname,'/yugiohdb/card_search.action');
  assert.equal(source.searchParams.get('ope'),'2');
  assert.equal(source.searchParams.get('cid'),fact.sourceCid);
  assert.equal(card.printing.date,fact.date);
  assert.equal(card.printing.set,fact.set);
  assert.equal(card.printing.region,'tcg');
  assert.ok(card.printing.date<='2004-09-30');
  assert.equal(card.printing.source,card.source);
 }
});

test('M60 passcodes are absent from the current catalog, effects, monsters and certificate map',()=>{
 for(const id of Object.keys(expected)){
  assert.equal(snapshot.cards.some(card=>card.id===id),false,'already catalogued: '+id);
  assert.equal(Object.hasOwn(snapshot.effects,id),false,'effect already exists: '+id);
  assert.equal(Object.hasOwn(snapshot.monsters,id),false,'monster definition already exists: '+id);
  assert.equal(Object.hasOwn(snapshot.certificates,id),false,'certificate already exists: '+id);
 }
});

test('each definition separates mandatory Flip Summon from the manual Main Phase self-set effect',()=>{
 for(const candidate of spec.candidates){
  assert.equal(candidate.effect.kind,'monsterEffect');
  assert.equal(candidate.monster.effect.trigger,'flip');
  assert.deepEqual(candidate.monster.effect.summons,['flip']);
  assert.deepEqual(candidate.monster.effect.operation,expected[candidate.card.id].operation);
  assert.deepEqual(candidate.monster.activation,{policy:'mandatory',window:'flip'});
  assert.deepEqual(candidate.monster.ignitionEffect.effect,{trigger:'ignition',oncePerTurn:true,operation:{kind:'setSelfFaceDown'}});
  assert.deepEqual(candidate.monster.ignitionEffect.activation,{policy:'manual',window:'main'});
  assert.equal(candidate.monster.ignitionEffect.effect.cost,undefined);
  for(const scenario of commonScenarios)assert.ok(candidate.scenarios.includes(scenario),'missing '+scenario+' for '+candidate.card.name);
  assert.ok(candidate.requirements.includes('trigger:flip'));
  assert.ok(candidate.requirements.includes('trigger:ignition'));
  assert.ok(candidate.requirements.includes('monster-operation:setSelfFaceDown'));
 }
});

test('card-specific scenario plans cover target, damage and draw edge cases',()=>{
 const scarabs=byId.get('15383415').scenarios;
 const locusts=byId.get('41872150').scenarios;
 const stealth=byId.get('03510565').scenarios;
 const lacooda=byId.get('02326738').scenarios;
 for(const s of ['target-opponent-monster','target-revalidated-at-resolution','no-legal-monster-target','destroy-only-the-selected-instance'])assert.ok(scarabs.includes(s));
 for(const s of ['target-opponent-spell-trap','target-revalidated-at-resolution','no-legal-backrow-target','set-card-identity-remains-hidden'])assert.ok(locusts.includes(s));
 for(const s of ['exactly-1000-damage','lethal-flip-damage-ends-duel','no-damage-on-normal-summon'])assert.ok(stealth.includes(s));
 for(const s of ['draw-exactly-one','empty-deck-draw-causes-deck-out','hand-limit-is-checked-at-end-phase','no-draw-on-normal-summon'])assert.ok(lacooda.includes(s));
});

test('evidence hashes are bound and the batch cannot be mistaken for admitted cards',()=>{
 assert.equal(spec.status,'research-only-blocked-on-m61-runtime');
 assert.equal(spec.admissionEligible,false);
 assert.equal(spec.certificationState,'not-reviewed-not-certified');
 assert.deepEqual(spec.reviews,[]);
 for(const candidate of spec.candidates){
  const digest=createHash('sha256').update(candidate.textEvidence.text).digest('hex');
  assert.equal(candidate.textEvidence.sha256,digest,candidate.card.name+' text evidence hash');
  assert.equal(candidate.textEvidence.complete,true);
  assert.equal(candidate.textEvidence.source,candidate.card.source);
  assert.equal(candidate.textEvidence.format,'full-rule-paraphrase');
 }
});
