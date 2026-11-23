'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  SOLEMN_JUDGMENT_ID,
  HORN_OF_HEAVEN_ID,
  createSummonNegationSession,
  summonNegationActions,
  activateSummonNegation,
  resolveSummonNegation
}=require('../dist/summonNegationTagAdapter');

const POT='55144522';
const MAGIC_JAMMER='77414722';
const TORRENTIAL='53582587';
const SOGEN='86318356';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
const lookup=id=>{
  const c=getPlayableCard(id);
  return c?{kind:c.kind}:undefined;
};
const LOW_NORMALS=NORMALS.filter(id=>{
  const c=getPlayableCard(id);
  return c&&Number.isFinite(Number(c.level))&&Number(c.level)<=4;
});
assert.ok(LOW_NORMALS.length>=2,'the certified normal-monster pool must provide two Level 4-or-lower summons');
const COST_MONSTER=LOW_NORMALS[0];
const TARGET_MONSTER=LOW_NORMALS.find(id=>id!==COST_MONSTER);
assert.ok(TARGET_MONSTER);

function member(seat){return 'm573-seat-'+seat;}
function deck(required=[]){
  const ordered=[...new Set([...required,...NORMALS.filter(id=>!required.includes(id))])];
  return ordered.slice(0,20);
}
function create(seed){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M573 Seat '+seat,
    cards:deck(seat===1?[COST_MONSTER,MAGIC_JAMMER,TORRENTIAL]:
      seat===2?[TARGET_MONSTER,POT]:[])
  })),{classic:true,first:1,seed:'m573-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function hand(state,seat,id){
  const h=holder(state,seat);
  const found=h.hand.find(c=>c.id===id);
  if(found)return found;
  const i=h.deck.findIndex(c=>c.id===id);
  assert.ok(i>=0,'card '+id+' must be in physical seat '+seat+' deck');
  const [card]=h.deck.splice(i,1);
  h.hand.push(card);
  return card;
}
function action(state,seat,predicate,label){
  const found=tag.tagActions(state,member(seat)).find(predicate);
  assert.ok(found,'seat '+seat+' must have '+label+' in '+state.core.phase);
  return found;
}
function settleNoOptions(state){
  let guard=0;
  while(state.core.phase==='response'&&guard++<8){
    const seat=state.active[state.core.priority];
    const pass=tag.tagActions(state,member(seat)).find(a=>a.kind==='pass');
    if(!pass)break;
    state=tag.stepTagDuel(state,member(seat),pass);
  }
  assert.ok(guard<8,'response window did not settle');
  return state;
}
function setTrap(state,seat,id,label){
  const card=hand(state,seat,id);
  const set=action(state,seat,a=>a.kind==='set'&&a.card===card.uid,'Set '+id);
  const next=tag.stepTagDuel(state,member(seat),set);
  return {state:next,uid:card.uid,label};
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(c=>c.entityKind!=='token');
  const out=new Map(cards.map(c=>[c.uid,c.id]));
  assert.equal(out.size,cards.length);
  return out;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state).filter(c=>c.entityKind!=='token');
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(c=>c.uid)).size,before.size);
  for(const c of cards)assert.equal(before.get(c.uid),c.id,'physical identity changed: '+c.uid);
}
function hands(state){
  const out=[];
  for(const p of state.core.players)for(const c of p.hand)out.push(c.uid);
  for(const h of Object.values(state.reserves))for(const c of h.hand)out.push(c.uid);
  return out.sort();
}
function assertRules(state){
  const r=rulesFor(state.core);
  assert.equal(r.mainDeckMin,20);
  assert.equal(r.mainDeckMax,30);
  assert.equal(r.handLimit,6);
  assert.equal(r.handCheck,'end');
  assert.equal(r.extraDeckMax,5);
  assert.equal(r.monsterZones,3);
  assert.equal(r.spellTrapZones,3);
  for(const p of state.core.players){
    assert.ok(p.monsters.length<=3);
    assert.ok(p.backrow.length<=3);
  }
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const c of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(c.uid),'private hand UID leaked for seat '+seat);
    }
  }
}
function baseReady(seed){
  let state=create(seed);
  const cost=hand(state,1,COST_MONSTER);
  state=tag.stepTagDuel(state,member(1),action(state,1,a=>a.kind==='summon'&&a.card===cost.uid,'cost monster summon'));
  state=settleNoOptions(state);
  assert.equal(state.core.phase,'main');
  assert.ok(state.core.players[1].monsters.some(m=>m.uid===cost.uid));
  const jam= setTrap(state,1,MAGIC_JAMMER,'spell-placeholder');
  state=jam.state;
  const torr=setTrap(state,1,TORRENTIAL,'summon-placeholder');
  state=torr.state;
  tag.assertTagDuel(state);
  state=tag.stepTagDuel(state,member(1),action(state,1,a=>a.kind==='end','End Phase'));
  state=settleNoOptions(state);
  tag.assertTagDuel(state);
  assert.equal(state.core.turn,2);
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1);
  return {state,costUid:cost.uid,spellTrapUid:jam.uid,summonTrapUid:torr.uid};
}
function summonFixture(sourceId,seed){
  const f=baseReady(seed);
  const target=hand(f.state,2,TARGET_MONSTER);
  const response=tag.stepTagDuel(f.state,member(2),
    action(f.state,2,a=>a.kind==='summon'&&a.card===target.uid,'target monster summon'));
  assert.equal(response.core.phase,'response');
  assert.equal(response.core.pending.kind,'summon');
  assert.equal(response.core.pending.actor,0);
  assert.equal(response.core.priority,1);
  tag.assertTagDuel(response);
  assertPrivateHands(response);
  const source=response.core.players[1].backrow.find(c=>c.uid===f.summonTrapUid);
  assert.ok(source);
  source.id=sourceId;
  const before=inventory(response);
  return {...f,state:response,sourceUid:source.uid,targetUid:target.uid,targetId:target.id,before};
}
function spellFixture(sourceId,seed){
  const f=baseReady(seed);
  const target=hand(f.state,2,POT);
  const response=tag.stepTagDuel(f.state,member(2),
    action(f.state,2,a=>a.kind==='spell'&&a.card===target.uid,'Pot of Greed activation'));
  assert.equal(response.core.phase,'response');
  assert.equal(response.core.pending.kind,'spell');
  assert.equal(response.core.pending.actor,0);
  assert.equal(response.core.priority,1);
  tag.assertTagDuel(response);
  assertPrivateHands(response);
  const source=response.core.players[1].backrow.find(c=>c.uid===f.spellTrapUid);
  assert.ok(source);
  source.id=sourceId;
  const before=inventory(response);
  return {...f,state:response,sourceUid:source.uid,targetUid:target.uid,targetId:target.id,before};
}
function grave(state,team,card){
  return state.core.players[team].grave.some(c=>c.uid===card.uid&&c.id===card.id);
}
function activate(f,activationId,tributeUid){
  const actions=summonNegationActions(f.state,lookup);
  assert.deepEqual(actions,[{kind:'trap',card:f.sourceUid,target:''}]);
  return activateSummonNegation(
    createSummonNegationSession(f.state),f.sourceUid,activationId,lookup,tributeUid
  );
}

test('M573 cards remain unadmitted; only already-enabled placeholder cards build the engine fixtures',()=>{
  assert.equal(getPlayableCard(SOLEMN_JUDGMENT_ID),undefined);
  assert.equal(getPlayableCard(HORN_OF_HEAVEN_ID),undefined);
  assert.ok(getPlayableCard(MAGIC_JAMMER));
  assert.ok(getPlayableCard(TORRENTIAL));
  assert.ok(getPlayableCard(POT));
  assert.ok(getPlayableCard(COST_MONSTER));
  assert.ok(getPlayableCard(TARGET_MONSTER));
});

test('Solemn Judgment pays half the controller team LP and negates/destroys a Normal Summon',()=>{
  const f=summonFixture(SOLEMN_JUDGMENT_ID,'solemn-summon');
  const lp=f.state.core.players[1].lp;
  const session=activate(f,'sj-summon');
  const paid=Math.ceil(lp/2);
  assert.equal(session.duel.core.players[1].lp,lp-paid);
  const resolved=resolveSummonNegation(session,'sj-summon',lookup);
  const d=resolved.session.duel;
  assert.equal(resolved.result.paidLp,paid);
  assert.equal(resolved.result.tributePaid,false);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(grave(d,0,{uid:f.targetUid,id:f.targetId}));
  assert.ok(grave(d,1,{uid:f.sourceUid,id:SOLEMN_JUDGMENT_ID}));
  assert.ok(!d.core.players[0].monsters.some(m=>m.uid===f.targetUid));
  assertConserved(d,f.before);
  assertRules(d);
  assert.deepEqual(hands(d),hands(f.state));
});

test('Solemn Judgment negates a Spell Card activation and destroys the activated card',()=>{
  const f=spellFixture(SOLEMN_JUDGMENT_ID,'solemn-spell');
  const lp=f.state.core.players[1].lp;
  const session=activate(f,'sj-spell');
  assert.equal(session.duel.core.players[1].lp,lp-Math.ceil(lp/2));
  const resolved=resolveSummonNegation(session,'sj-spell',lookup);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(resolved.session.duel.core.pendingNegated);
  assert.ok(grave(resolved.session.duel,0,{uid:f.targetUid,id:POT}));
  assert.ok(grave(resolved.session.duel,1,{uid:f.sourceUid,id:SOLEMN_JUDGMENT_ID}));
  assertConserved(resolved.session.duel,f.before);
  assert.deepEqual(hands(resolved.session.duel),hands(f.state));
});

test('Solemn Judgment can negate the top Spell chain link, not an unrelated lower link',()=>{
  const f=spellFixture(SOLEMN_JUDGMENT_ID,'solemn-chain');
  const state=structuredClone(f.state);
  state.core.pending={kind:'none'};
  state.core.chain=[{actor:0,card:f.targetUid,id:POT,target:''}];
  state.core.phase='response';
  state.core.priority=1;
  const chainFixture={...f,state};
  const session=activate(chainFixture,'sj-chain');
  const resolved=resolveSummonNegation(session,'sj-chain',lookup);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.session.duel.core.chain.length,1);
  assert.equal(resolved.session.duel.core.chain[0].negated,true);
  assert.ok(grave(resolved.session.duel,0,{uid:f.targetUid,id:POT}));
  assertConserved(resolved.session.duel,f.before);
});

test('Solemn Judgment handles a Field Spell in the separate Field Zone',()=>{
  const f=spellFixture(SOLEMN_JUDGMENT_ID,'solemn-field');
  const p=f.state.core.players[0];
  const i=p.backrow.findIndex(c=>c.uid===f.targetUid);
  assert.ok(i>=0);
  const [fieldSpell]=p.backrow.splice(i,1);
  fieldSpell.id=SOGEN;
  fieldSpell.faceUp=true;
  p.field=fieldSpell;
  f.state.core.pending={kind:'field',actor:0,card:fieldSpell.uid};
  f.before=inventory(f.state);
  const session=activate(f,'sj-field');
  const resolved=resolveSummonNegation(session,'sj-field',lookup);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.session.duel.core.players[0].field,null);
  assert.ok(grave(resolved.session.duel,0,{uid:fieldSpell.uid,id:SOGEN}));
  assertConserved(resolved.session.duel,f.before);
});

test('Horn of Heaven tributes one team-controlled monster at activation and negates the summon',()=>{
  const f=summonFixture(HORN_OF_HEAVEN_ID,'horn-summon');
  const session=activate(f,'horn-summon',f.costUid);
  assert.ok(grave(session.duel,1,{uid:f.costUid,id:COST_MONSTER}),
    'the tribute cost is paid immediately to the team Graveyard');
  assert.ok(session.duel.core.players[0].monsters.some(m=>m.uid===f.targetUid));
  const resolved=resolveSummonNegation(session,'horn-summon',lookup);
  const d=resolved.session.duel;
  assert.equal(resolved.result.tributePaid,true);
  assert.equal(resolved.result.paidLp,0);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.ok(grave(d,0,{uid:f.targetUid,id:f.targetId}));
  assert.ok(grave(d,1,{uid:f.sourceUid,id:HORN_OF_HEAVEN_ID}));
  assertConserved(d,f.before);
  assertRules(d);
  assert.deepEqual(hands(d),hands(f.state));
});

test('Horn of Heaven requires a monster on the shared team field and cannot tribute a monster from the opposing team',()=>{
  const f=summonFixture(HORN_OF_HEAVEN_ID,'horn-cost-validation');
  const session=createSummonNegationSession(f.state);
  assert.throws(()=>activateSummonNegation(session,f.sourceUid,'horn-no-cost',lookup),/exige Tributar/);
  assert.throws(()=>activateSummonNegation(session,f.sourceUid,'horn-opponent-cost',lookup,f.targetUid),
    /campo compartilhado da equipe/);
  const empty=structuredClone(f.state);
  const i=empty.core.players[1].monsters.findIndex(m=>m.uid===f.costUid);
  const [cost]=empty.core.players[1].monsters.splice(i,1);
  empty.core.players[1].grave.push({uid:cost.uid,id:cost.id});
  assert.deepEqual(summonNegationActions(empty,lookup),[],
    'Horn of Heaven is not offered without a team-controlled monster to Tribute');
  assert.deepEqual(session.duel,f.state,'invalid costs do not mutate the original session');
});

test('Horn of Heaven cannot respond to a Spell activation or a Flip Summon',()=>{
  const spell=spellFixture(HORN_OF_HEAVEN_ID,'horn-not-spell');
  assert.deepEqual(summonNegationActions(spell.state,lookup),[]);
  const flip=summonFixture(HORN_OF_HEAVEN_ID,'horn-not-flip');
  const changed=structuredClone(flip.state);
  changed.core.pending.kind='flip';
  assert.deepEqual(summonNegationActions(changed,lookup),[]);
  const solemn=summonFixture(SOLEMN_JUDGMENT_ID,'solemn-flip');
  const flipSolemn=structuredClone(solemn.state);
  flipSolemn.core.pending.kind='flip';
  assert.deepEqual(summonNegationActions(flipSolemn,lookup),[{kind:'trap',card:solemn.sourceUid,target:''}]);
});

test('Solemn Judgment is unavailable when the team cannot pay half its LP',()=>{
  const f=summonFixture(SOLEMN_JUDGMENT_ID,'solemn-low-lp');
  f.state.core.players[1].lp=1;
  assert.deepEqual(summonNegationActions(f.state,lookup),[]);
  const session=createSummonNegationSession(f.state);
  assert.throws(()=>activateSummonNegation(session,f.sourceUid,'sj-low-lp',lookup),/não está legal/);
});

test('activation costs are not refunded when Solemn Judgment or Horn of Heaven is itself negated',()=>{
  const solemn=summonFixture(SOLEMN_JUDGMENT_ID,'solemn-cost-not-refunded');
  const lp=solemn.state.core.players[1].lp;
  const sj=activate(solemn,'sj-cost-not-refunded');
  const afterSj=resolveSummonNegation(sj,'sj-cost-not-refunded',lookup,{sourceActivationNegated:true});
  assert.equal(afterSj.session.duel.core.players[1].lp,lp-Math.ceil(lp/2));
  assert.ok(afterSj.session.duel.core.players[0].monsters.some(m=>m.uid===solemn.targetUid));
  assert.equal(afterSj.result.targetActivationNegated,false);
  const horn=summonFixture(HORN_OF_HEAVEN_ID,'horn-cost-not-refunded');
  const hoh=activate(horn,'horn-cost-not-refunded',horn.costUid);
  const afterHoh=resolveSummonNegation(hoh,'horn-cost-not-refunded',lookup,{sourceActivationNegated:true});
  assert.ok(grave(afterHoh.session.duel,1,{uid:horn.costUid,id:COST_MONSTER}));
  assert.ok(afterHoh.session.duel.core.players[0].monsters.some(m=>m.uid===horn.targetUid));
  assert.equal(afterHoh.result.targetActivationNegated,false);
});

test('Solemn Judgment rejects duplicate activation IDs and stale target resolution',()=>{
  const f=summonFixture(SOLEMN_JUDGMENT_ID,'solemn-stale');
  const session=activate(f,'sj-stale');
  assert.throws(()=>activateSummonNegation(session,f.sourceUid,'sj-stale',lookup),/ausente ou duplicado/);
  const stale=structuredClone(session);
  stale.duel.core.pendingNegated=true;
  const resolved=resolveSummonNegation(stale,'sj-stale',lookup);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.ok(resolved.result.sourceSentToGrave);
  assertConserved(resolved.session.duel,f.before);
});
