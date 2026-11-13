'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MOUNTAIN='50913601';
const BLUE_EYES='89631139';
const SKY_SCOUT='30532390';
const THUNDER_KID='15510988';
const DARK_MAGICIAN='46986414';

assert.equal(getPlayableCard(MOUNTAIN)?.kind,'spell');
assert.equal(getPlayableCard(MOUNTAIN)?.field,true);
assert.equal(getEffect(MOUNTAIN)?.kind,'field');
assert.deepEqual(getEffect(MOUNTAIN)?.races,['Dragon','Winged Beast','Thunder']);
assert.equal(getEffect(MOUNTAIN)?.atk,200);
assert.equal(getEffect(MOUNTAIN)?.def,200);
assert.equal(getPlayableCard(BLUE_EYES)?.race,'Dragon');
assert.equal(getPlayableCard(SKY_SCOUT)?.race,'Winged Beast');
assert.equal(getPlayableCard(THUNDER_KID)?.race,'Thunder');
assert.equal(getPlayableCard(DARK_MAGICIAN)?.race,'Spellcaster');

const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,7);
assert.equal(normalIds.length,7,'the fixture needs seven distinct certified Normal Monsters');

function member(seat){return 'm146-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M146 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function findMonster(state,seat,uid){
  const monster=state.core.players[seat%2].monsters.find(card=>card.uid===uid);
  assert.ok(monster,'physical monster must remain on its shared team field: '+uid);
  return monster;
}
function passResponse(state){
  let passes=0;
  while(state.core.phase==='response'&&passes<4){
    const acting=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,acting).find(action=>action.kind==='pass');
    assert.ok(pass,'the current response priority must have a legal pass');
    state=tag.stepTagDuel(state,acting,pass);
    passes++;
  }
  assert.notEqual(state.core.phase,'response','response window must close');
  return state;
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
}
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
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Mountain boosts Dragons, Winged Beasts and Thunder on both shared fields after teammate activation and JSON recovery',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M146 Seat '+seat,
    cards:deck(seat===0?[MOUNTAIN,BLUE_EYES]:seat===1?[SKY_SCOUT]:seat===2?[THUNDER_KID]:[DARK_MAGICIAN])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m146-mountain-global-shared-field'});
  const before=snapshot(state);

  const dragonUid=deploy(state,0,BLUE_EYES);
  const wingedBeastUid=deploy(state,1,SKY_SCOUT);
  const thunderUid=deploy(state,2,THUNDER_KID);
  const spellcasterUid=deploy(state,3,DARK_MAGICIAN);
  assert.match(dragonUid,/^m0:/);
  assert.match(wingedBeastUid,/^m1:/);
  assert.match(thunderUid,/^m2:/);
  assert.match(spellcasterUid,/^m3:/);

  const base={
    dragon:{atk:getPlayableCard(BLUE_EYES).atk,def:getPlayableCard(BLUE_EYES).defense},
    winged:{atk:getPlayableCard(SKY_SCOUT).atk,def:getPlayableCard(SKY_SCOUT).defense},
    thunder:{atk:getPlayableCard(THUNDER_KID).atk,def:getPlayableCard(THUNDER_KID).defense},
    spellcaster:{atk:getPlayableCard(DARK_MAGICIAN).atk,def:getPlayableCard(DARK_MAGICIAN).defense}
  };
  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk);
  assert.equal(engine.atk(findMonster(state,1,wingedBeastUid),state.core),base.winged.atk);
  assert.equal(engine.atk(findMonster(state,2,thunderUid),state.core),base.thunder.atk);
  assert.equal(engine.atk(findMonster(state,3,spellcasterUid),state.core),base.spellcaster.atk);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const mountain=takeCard(state,0,MOUNTAIN);
  holder(state,0).hand.push(mountain);
  const setAction=tag.tagActions(state,member(0)).find(action=>action.kind==='setField'&&action.card===mountain.uid);
  assert.ok(setAction,'seat 0 must be able to Set Mountain in its shared Field Zone');
  state=tag.stepTagDuel(state,member(0),setAction);
  state=passResponse(state);
  assert.equal(state.core.players[0].field?.uid,mountain.uid);
  assert.equal(state.core.players[0].field?.faceUp,false);
  assert.deepEqual(tag.publicTagDuel(state).teams[0].field,{id:null,faceUp:false});
  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk,
    'a set Mountain must not apply its modifier before activation');

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical owner cannot activate the Field Spell on behalf of the team');
  const activate=tag.tagActions(state,member(2)).find(action=>action.kind==='field'&&action.card===mountain.uid);
  assert.ok(activate,'the active teammate must be able to activate the same physical Mountain');
  state=tag.stepTagDuel(state,member(2),activate);
  state=passResponse(state);

  assert.equal(state.core.players[0].field?.uid,mountain.uid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.equal(mountain.uid.startsWith('m0:'),true,'the Field Spell keeps the original physical owner');
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,MOUNTAIN);

  for(const [seat,uid,key] of [
    [0,dragonUid,'dragon'],
    [1,wingedBeastUid,'winged'],
    [2,thunderUid,'thunder']
  ]){
    const monster=findMonster(state,seat,uid);
    assert.equal(engine.atk(monster,state.core),base[key].atk+200,key+' receives Mountain ATK');
    assert.equal(engine.def(monster,state.core),base[key].def+200,key+' receives Mountain DEF');
  }
  assert.equal(engine.atk(findMonster(state,3,spellcasterUid),state.core),base.spellcaster.atk,
    'Mountain does not modify Spellcasters');
  assert.equal(engine.def(findMonster(state,3,spellcasterUid),state.core),base.spellcaster.def,
    'non-matching races keep their original DEF');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk+200);
  assert.equal(engine.atk(findMonster(state,1,wingedBeastUid),state.core),base.winged.atk+200);
  assert.equal(engine.atk(findMonster(state,2,thunderUid),state.core),base.thunder.atk+200);
  assert.equal(engine.atk(findMonster(state,3,spellcasterUid),state.core),base.spellcaster.atk);

  state=endTurn(state,2);
  state=endTurn(state,3);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,MOUNTAIN);
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
