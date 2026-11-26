'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,enabledCardIds}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {atk,def}=require('../dist/duelEngine.js');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime.js');
const {
  RUSH_RECKLESSLY_ID,RELIABLE_GUARDIAN_ID,
  activateQuickPlayCombatBoost,resolveQuickPlayCombatBoost
}=require('../dist/quickPlayCombatBoostTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
const MONSTER=NORMALS.find(id=>getPlayableCard(id)?.kind==='monster');
assert.ok(NORMALS.length>=20,'fixtures need four physical 20-card decks');
assert.ok(MONSTER,'fixtures need at least one certified normal monster');
let sequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm648-seat-'+seat;}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M648 Seat '+seat,cards:deck()
  })),{classic:true,first,seed:'m648-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function replaceDeckCard(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.deck.findIndex(card=>getPlayableCard(card.id)?.kind==='monster');
  assert.notEqual(index,-1,'a physical deck card is available for replacement');
  const [old]=physical.deck.splice(index,1);
  state.core.players[seat%2].grave.push(old);
  return {uid:'m'+seat+':m648-card-'+(++sequence),id};
}
function addMonster(state,seat){
  const card=replaceDeckCard(state,seat,MONSTER);
  const monster={
    ...card,position:'atk',faceUp:true,entered:state.core.turn,
    changed:state.core.turn,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function addSourceToHand(state,seat,id){
  const card=replaceDeckCard(state,seat,id);
  holder(state,seat).hand.push(card);
  return card.uid;
}
function addSourceToBackrow(state,team,ownerSeat,id,setTurn){
  const card=replaceDeckCard(state,ownerSeat,id);
  state.core.players[team].backrow.push({...card,faceUp:false,setTurn});
  return card.uid;
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,cards.length,'physical UIDs must be unique');
  return result;
}
function assertConserved(state,before){
  const after=inventory(state);
  assert.equal(after.size,before.size);
  for(const [uid,id] of before)assert.equal(after.get(uid),id,'physical identity changed: '+uid);
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const player of state.core.players){
    assert.ok(player.monsters.length<=3);
    assert.ok(player.backrow.length<=3);
  }
}
function event(state,actorSeat,sourceUid,targetUid,activationId){
  return {
    activationId:activationId??'m648:'+state.core.turn+':'+sourceUid+':'+(++sequence),
    actorSeat,sourceUid,targetUid
  };
}
function activate(state,actorSeat,sourceUid,targetUid,activationId){
  return activateQuickPlayCombatBoost(state,event(state,actorSeat,sourceUid,targetUid,activationId));
}
function resolve(activation,effectNegated=false){
  return resolveQuickPlayCombatBoost(activation.state,activation.plan,effectNegated);
}
function responseWindow(state,team){
  state.core.current=1-team;state.core.priority=team;state.core.phase='response';
  state.core.chain=[{actor:1-team,card:'m'+(1-team)+':m648-response',id:NORMALS[0]}];
  state.core.pending={kind:'spell',actor:1-team,card:'m'+(1-team)+':m648-response',id:NORMALS[0]};
}

test('both Quick-Play cards remain outside the playable catalogue and certification allowlist',()=>{
  assert.equal(getPlayableCard(RUSH_RECKLESSLY_ID),undefined);
  assert.equal(getPlayableCard(RELIABLE_GUARDIAN_ID),undefined);
  assert.equal(enabledCardIds.includes(RUSH_RECKLESSLY_ID),false);
  assert.equal(enabledCardIds.includes(RELIABLE_GUARDIAN_ID),false);
});
test('Rush Recklessly adds exactly 700 ATK until the current turn expires',()=>{
  const state=create(0,'rush-atk'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const beforeAtk=atk(monster,state.core),beforeDef=def(monster,state.core);
  const result=resolve(activate(state,0,source,monster.uid));
  assert.equal(result.applied,true);
  assert.equal(atk(result.state.core.players[0].monsters[0],result.state.core),beforeAtk+700);
  assert.equal(def(result.state.core.players[0].monsters[0],result.state.core),beforeDef);
});
test('The Reliable Guardian adds exactly 700 DEF and does not change ATK',()=>{
  const state=create(0,'guardian-def'),monster=addMonster(state,0),source=addSourceToHand(state,0,RELIABLE_GUARDIAN_ID);
  const beforeAtk=atk(monster,state.core),beforeDef=def(monster,state.core);
  const result=resolve(activate(state,0,source,monster.uid));
  assert.equal(result.applied,true);
  assert.equal(atk(result.state.core.players[0].monsters[0],result.state.core),beforeAtk);
  assert.equal(def(result.state.core.players[0].monsters[0],result.state.core),beforeDef+700);
});
test('a Quick-Play Spell may target a face-up monster controlled by the opposing team',()=>{
  const state=create(0,'opposing-monster'),monster=addMonster(state,1),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const before=atk(monster,state.core);
  const result=resolve(activate(state,0,source,monster.uid));
  assert.equal(result.applied,true);
  assert.equal(atk(result.state.core.players[1].monsters[0],result.state.core),before+700);
});
test('a face-down monster is not a legal activation-time target',()=>{
  const state=create(0,'face-down-target'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  monster.faceUp=false;
  assert.throws(()=>activate(state,0,source,monster.uid),/face-up/);
});
test('a missing monster cannot be selected',()=>{
  const state=create(0,'missing-target'),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  assert.throws(()=>activate(state,0,source,'m0:missing-monster'),/face-up/);
});
test('activation from hand is legal during the active team Main Phase',()=>{
  const state=create(0,'hand-main'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  assert.equal(activate(state,0,source,monster.uid).status,'activated');
});
test('activation from hand is legal during the active team Battle Phase',()=>{
  const state=create(0,'hand-battle'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  state.core.phase='battle';
  assert.equal(activate(state,0,source,monster.uid).status,'activated');
});
test('activation from hand is not legal during the opponent turn',()=>{
  const state=create(0,'hand-opponent'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  responseWindow(state,1);
  assert.throws(()=>activate(state,0,source,monster.uid),/prioridade legal/);
});
test('a Set Quick-Play Spell cannot be activated in the same turn it was Set',()=>{
  const state=create(0,'set-same-turn'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,0,0,RUSH_RECKLESSLY_ID,state.core.turn);
  assert.throws(()=>activate(state,0,source,monster.uid),/turno posterior/);
});
test('a Set Quick-Play Spell can respond during the opponent turn after a prior turn Set',()=>{
  const state=create(0,'set-response'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,0,0,RUSH_RECKLESSLY_ID,state.core.turn-1);
  responseWindow(state,1);
  assert.equal(activate(state,0,source,monster.uid).status,'activated');
});
test('a Set Quick-Play Spell owned by the inactive teammate returns to the original owner team Graveyard',()=>{
  const state=create(0,'teammate-source'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,0,2,RELIABLE_GUARDIAN_ID,state.core.turn-1);
  const activation=activate(state,0,source,monster.uid),result=resolve(activation);
  assert.equal(result.state.core.players[0].grave.some(card=>card.uid===source),true);
  assert.equal(result.state.core.players[1].grave.some(card=>card.uid===source),false);
});
test('a Quick-Play Spell in the opposing backrow cannot be activated by this team',()=>{
  const state=create(0,'opposing-source'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,1,1,RUSH_RECKLESSLY_ID,state.core.turn-1);
  assert.throws(()=>activate(state,0,source,monster.uid),/adversária/);
});
test('a stat-modifying Quick-Play Spell may respond in the Damage Step before calculation',()=>{
  const state=create(0,'damage-before'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  state.core.phase='battle';state.core.damageStep=true;
  state.core.pending={kind:'attack',actor:0,card:monster.uid,stage:'damage'};
  assert.equal(activate(state,0,source,monster.uid).status,'activated');
});
test('the same Quick-Play Spell cannot activate after Damage Calculation',()=>{
  const state=create(0,'damage-after'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  state.core.phase='battle';state.core.damageStep=true;
  state.core.pending={kind:'attack',actor:0,card:monster.uid,stage:'calculation'};
  assert.throws(()=>activate(state,0,source,monster.uid),/prioridade legal/);
});
test('a target removed before resolution receives no modifier and the Spell still resolves',()=>{
  const state=create(0,'target-removed'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const activation=activate(state,0,source,monster.uid);
  state.core.players[0].monsters=state.core.players[0].monsters.filter(card=>card.uid!==monster.uid);
  state.core.players[0].grave.push(monster);
  synchronizeCardLifetimes(state.core);
  const result=resolveQuickPlayCombatBoost(state,activation.plan);
  assert.equal(result.status,'resolved');assert.equal(result.applied,false);
});
test('a target that leaves and re-enters the field cannot be retargeted by the old activation',()=>{
  const state=create(0,'target-epoch'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const activation=activate(state,0,source,monster.uid);
  state.core.players[0].monsters=state.core.players[0].monsters.filter(card=>card.uid!==monster.uid);
  state.core.players[0].grave.push(monster);synchronizeCardLifetimes(state.core);
  state.core.players[0].grave=state.core.players[0].grave.filter(card=>card.uid!==monster.uid);
  state.core.players[0].monsters.push(monster);synchronizeCardLifetimes(state.core);
  const before=atk(monster,state.core);
  const result=resolveQuickPlayCombatBoost(state,activation.plan);
  assert.equal(result.applied,false);
  assert.equal(atk(result.state.core.players[0].monsters[0],result.state.core),before);
});
test('a target turned face-down before resolution does not receive the modifier',()=>{
  const state=create(0,'target-face-down-resolution'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const activation=activate(state,0,source,monster.uid);
  monster.faceUp=false;
  const result=resolve(activation);
  assert.equal(result.applied,false);
});
test('negation consumes no modifier and leaves the target stats unchanged',()=>{
  const state=create(0,'negated'),monster=addMonster(state,0),source=addSourceToHand(state,0,RELIABLE_GUARDIAN_ID);
  const before=def(monster,state.core),activation=activate(state,0,source,monster.uid);
  const result=resolve(activation,true);
  assert.equal(result.status,'negated');assert.equal(result.applied,false);
  assert.equal(def(result.state.core.players[0].monsters[0],result.state.core),before);
});
test('two separate Rush Recklessly activations stack without replacing each other',()=>{
  const state=create(0,'stacked'),monster=addMonster(state,0);
  const first=addSourceToHand(state,0,RUSH_RECKLESSLY_ID),second=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const before=atk(monster,state.core);
  const one=resolve(activate(state,0,first,monster.uid));
  const two=resolve(activate(one.state,0,second,monster.uid));
  assert.equal(atk(two.state.core.players[0].monsters[0],two.state.core),before+1400);
});
test('the modifier expires when the duel advances to the next turn',()=>{
  const state=create(0,'expiry'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const before=atk(monster,state.core),result=resolve(activate(state,0,source,monster.uid));
  const boosted=result.state.core.players[0].monsters[0];
  assert.equal(atk(boosted,result.state.core),before+700);
  result.state.core.turn++;
  assert.equal(atk(boosted,result.state.core),before);
});
test('a forged target or stat cannot alter the stored activation plan',()=>{
  const state=create(0,'forged-plan'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const activation=activate(state,0,source,monster.uid);
  assert.throws(()=>resolveQuickPlayCombatBoost(activation.state,{...activation.plan,targetUid:'m0:other'}),/Plano de Quick-Play/);
  assert.throws(()=>resolveQuickPlayCombatBoost(activation.state,{...activation.plan,stat:'def'}),/Plano de Quick-Play/);
});
test('a duplicate activation identifier is rejected',()=>{
  const state=create(0,'duplicate-activation'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const id='m648:duplicate:'+source;
  activate(state,0,source,monster.uid,id);
  assert.throws(()=>activate(state,0,source,monster.uid,id),/já foi registrada/);
});
test('the same resolution cannot apply twice',()=>{
  const state=create(0,'duplicate-resolution'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const activation=activate(state,0,source,monster.uid),first=resolve(activation);
  const second=resolveQuickPlayCombatBoost(first.state,activation.plan);
  assert.equal(second.status,'duplicate');assert.equal(second.applied,false);
  assert.equal(second.state,first.state);
});
test('activation and resolution preserve all physical UIDs and do not mutate the input',()=>{
  const state=create(0,'conservation'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const before=inventory(state),original=JSON.stringify(state);
  const activation=activate(state,0,source,monster.uid),result=resolve(activation);
  assert.equal(JSON.stringify(state),original);
  assertConserved(result.state,before);assertRules(result.state);
});
test('the Field Zone remains separate from the three shared Spell/Trap Zones',()=>{
  const state=create(0,'field-zone'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,0,0,RUSH_RECKLESSLY_ID,state.core.turn-1);
  state.core.players[0].field={uid:'m0:m648-field',id:NORMALS[1],faceUp:true,setTurn:state.core.turn};
  assert.equal(activate(state,0,source,monster.uid).status,'activated');
});
test('hand overflow remains an End Phase responsibility and the adapter never discards',()=>{
  const state=create(0,'hand-overflow'),monster=addMonster(state,0);
  const source=addSourceToBackrow(state,0,0,RUSH_RECKLESSLY_ID,state.core.turn-1);
  const player=holder(state,0);
  while(player.hand.length<7){
    const card=player.deck.shift();assert.ok(card);player.hand.push(card);
  }
  const before=player.hand.map(card=>card.uid);
  const result=resolve(activate(state,0,source,monster.uid));
  assert.deepEqual(holder(result.state,0).hand.map(card=>card.uid),before);
  assert.equal(rulesFor(result.state.core).handCheck,'end');
});
test('a hand activation fails when all three shared Spell/Trap Zones are occupied',()=>{
  const state=create(0,'full-backrow'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  for(let i=0;i<3;i++){
    const card=replaceDeckCard(state,0,NORMALS[i]);
    state.core.players[0].backrow.push({...card,faceUp:false,setTurn:state.core.turn});
  }
  assert.throws(()=>activate(state,0,source,monster.uid),/Zona de Magias\/Armadilhas livre/);
});
test('the adapter does not consume the persisted duel random stream or publish private IDs',()=>{
  const state=create(0,'no-rng'),monster=addMonster(state,0),source=addSourceToHand(state,0,RUSH_RECKLESSLY_ID);
  const counter=state.core.random.counter,log=JSON.stringify(state.core.log);
  const result=resolve(activate(state,0,source,monster.uid));
  assert.equal(result.state.core.random.counter,counter);
  assert.equal(JSON.stringify(result.state.core.log),log);
});
test('the rules profile retains deck 20–30, hand 6 at End Phase, zones 3+3 and Extra 5',()=>{
  const state=create(0,'rules'),rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
});
