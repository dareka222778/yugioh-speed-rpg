'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');

const sourceId='70074904'; // D.D. Assailant
const normalCards=tag.tagNormalCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&Number.isInteger(card.atk));
const stronger=normalCards.filter(card=>card.atk>1700).sort((a,b)=>a.atk-b.atk)[0];
const weaker=normalCards.filter(card=>card.atk<1700).sort((a,b)=>b.atk-a.atk)[0];
assert.ok(stronger&&weaker&&stronger.id!==weaker.id,'fixtures need Normal Monsters on both sides of 1700 ATK');
const pool=[...new Set([stronger.id,weaker.id,...tag.tagNormalCardIds])].slice(0,10);
function deck(){return [sourceId,...pool.flatMap(id=>[id,id])].slice(0,20);}
assert.equal(deck().length,20);

function game(first,seed){
  const state=tag.createTagDuel(
    [0,1,2,3].map(seat=>({id:'m92-seat-'+seat,name:'M92 Seat '+seat,cards:deck()})),
    {classic:true,first,seed}
  );
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function take(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M92 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const card=take(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const member='m92-seat-'+seat;
  const action=tag.tagActions(state,member).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member,action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'response chain did not terminate');
    const member=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,member).find(action=>action.kind==='pass');
    assert.ok(pass,'current responder must have a legal pass');
    state=tag.stepTagDuel(state,member,pass);
  }
  return state;
}
function startBattle(state,seat){return settle(act(state,seat,'battle'));}
function attack(state,seat,source,target){return settle(act(state,seat,'attack',a=>a.card===source&&a.target===target));}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

for(const first of [0,2])test('D.D. Assailant attacking from inactive partner seat '+((first+2)%4)+' banishes itself and the opposing physical owner seat '+((first+1)%4),()=>{
  let state=game(first,'m92-dda-attacker-'+first);
  const sourceSeat=(first+2)%4;
  const targetSeat=(first+1)%4;
  const source=deploy(state,sourceSeat,sourceId,'atk');
  const target=deploy(state,targetSeat,stronger.id,'atk');
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'));
  assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
  const sourceAtk=engine.atk(source,state.core);
  const targetAtk=engine.atk(target,state.core);
  assert.ok(targetAtk>sourceAtk);
  tag.assertTagDuel(state);
  const before=snapshot(state);

  state=startBattle(state,first);
  state=attack(state,first,source.uid,target.uid);

  assert.ok(state.core.players[0].banished.some(card=>card.uid===source.uid),'the destroyed D.D. Assailant must be banished to its team zone');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===target.uid),'the battled opponent must be banished to its team zone');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===source.uid));
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.equal(state.core.players[0].lp,4000-(targetAtk-sourceAtk),'battle damage is still calculated before the banish effect');
  assert.equal(state.core.players[1].lp,4000);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

for(const first of [1,3])test('D.D. Assailant defending from inactive partner seat '+((first+3)%4)+' banishes the active opponent attacker',()=>{
  let state=game(first,'m92-dda-defender-'+first);
  const sourceSeat=(first+3)%4;
  const attackerSeat=first;
  const source=deploy(state,sourceSeat,sourceId,'def');
  const attacker=deploy(state,attackerSeat,stronger.id,'atk');
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'));
  assert.match(attacker.uid,new RegExp('^m'+attackerSeat+':'));
  assert.ok(engine.atk(attacker,state.core)>1600);
  tag.assertTagDuel(state);
  const before=snapshot(state);

  state=startBattle(state,first);
  state=attack(state,first,attacker.uid,source.uid);

  assert.ok(state.core.players[0].banished.some(card=>card.uid===source.uid));
  assert.ok(state.core.players[1].banished.some(card=>card.uid===attacker.uid));
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===source.uid));
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===attacker.uid));
  assert.equal(state.core.players[0].lp,4000,'attacking a Defense Position D.D. Assailant causes no battle damage here');
  assert.equal(state.core.players[1].lp,4000);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('D.D. Assailant does not banish either card when it survives battle',()=>{
  let state=game(0,'m92-dda-survives');
  const source=deploy(state,2,sourceId,'atk');
  const target=deploy(state,1,weaker.id,'atk');
  const sourceAtk=engine.atk(source,state.core);
  const targetAtk=engine.atk(target,state.core);
  assert.ok(sourceAtk>targetAtk);
  const before=snapshot(state);

  state=startBattle(state,0);
  state=attack(state,0,source.uid,target.uid);

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.ok(!state.core.players[0].banished.some(card=>card.uid===source.uid));
  assert.ok(!state.core.players[1].banished.some(card=>card.uid===target.uid));
  assert.equal(state.core.players[1].lp,4000-(sourceAtk-targetAtk));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
