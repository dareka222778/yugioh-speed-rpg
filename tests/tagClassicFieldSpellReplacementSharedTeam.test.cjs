'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const MOUNTAIN='50913601';
const YAMI='59197169';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';

assert.equal(getPlayableCard(MOUNTAIN)?.field,true);
assert.equal(getPlayableCard(YAMI)?.field,true);
assert.equal(getEffect(MOUNTAIN)?.kind,'field');
assert.equal(getEffect(YAMI)?.kind,'field');
assert.deepEqual(getEffect(MOUNTAIN)?.races,['Dragon','Winged Beast','Thunder']);
assert.deepEqual(getEffect(YAMI)?.races,['Fiend','Spellcaster']);
assert.deepEqual(getEffect(YAMI)?.penaltyRaces,['Fairy']);

const fairy=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .find(entry=>entry.card?.kind==='monster'&&entry.card.race==='Fairy');
assert.ok(fairy,'the fixture needs a certified Fairy Normal Monster');
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,7);
assert.equal(normalIds.length,7);

function member(seat){return 'm149-seat-'+seat;}
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
  throw new Error('M149 fixture card missing from physical seat '+seat+': '+id);
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

test('replacing Mountain with Yami sends the old Field Spell to the shared Graveyard and recomputes both teams',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M149 Seat '+seat,
    cards:deck(seat===0?[MOUNTAIN,BLUE_EYES]:seat===1?[SUMMONED_SKULL]:seat===2?[YAMI,DARK_MAGICIAN]:[fairy.id])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m149-field-spell-replacement'});
  const before=snapshot(state);

  const dragonUid=deploy(state,0,BLUE_EYES);
  const fiendUid=deploy(state,1,SUMMONED_SKULL);
  const spellcasterUid=deploy(state,2,DARK_MAGICIAN);
  const fairyUid=deploy(state,3,fairy.id);
  assert.match(dragonUid,/^m0:/);
  assert.match(fiendUid,/^m1:/);
  assert.match(spellcasterUid,/^m2:/);
  assert.match(fairyUid,/^m3:/);
  const base={
    dragon:{atk:getPlayableCard(BLUE_EYES).atk,def:getPlayableCard(BLUE_EYES).defense},
    fiend:{atk:getPlayableCard(SUMMONED_SKULL).atk,def:getPlayableCard(SUMMONED_SKULL).defense},
    spellcaster:{atk:getPlayableCard(DARK_MAGICIAN).atk,def:getPlayableCard(DARK_MAGICIAN).defense},
    fairy:{atk:getPlayableCard(fairy.id).atk,def:getPlayableCard(fairy.id).defense}
  };

  const mountain=takeCard(state,0,MOUNTAIN);
  holder(state,0).hand.push(mountain);
  const mountainAction=tag.tagActions(state,member(0)).find(action=>action.kind==='field'&&action.card===mountain.uid);
  assert.ok(mountainAction,'seat 0 must be able to activate Mountain from its physical hand');
  state=tag.stepTagDuel(state,member(0),mountainAction);
  state=passResponse(state);
  assert.equal(state.core.players[0].field?.uid,mountain.uid);
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,MOUNTAIN);
  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk+200);
  assert.equal(engine.atk(findMonster(state,1,fiendUid),state.core),base.fiend.atk);

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  const yami=takeCard(state,2,YAMI);
  holder(state,2).hand.push(yami);
  assert.match(yami.uid,/^m2:/);
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive Mountain owner cannot activate the teammate Yami');
  const yamiAction=tag.tagActions(state,member(2)).find(action=>action.kind==='field'&&action.card===yami.uid);
  assert.ok(yamiAction,'the active teammate must be able to replace Mountain with Yami');
  state=tag.stepTagDuel(state,member(2),yamiAction);
  state=passResponse(state);

  assert.equal(state.core.players[0].field?.uid,yami.uid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,YAMI);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mountain.uid&&card.id===MOUNTAIN),
    'replaced Mountain must go to the shared team Graveyard with its original physical UID');
  assert.equal(mountain.uid.startsWith('m0:'),true);
  assert.equal(yami.uid.startsWith('m2:'),true);

  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk,
    'replacing Mountain removes its Dragon modifier');
  assert.equal(engine.def(findMonster(state,0,dragonUid),state.core),base.dragon.def);
  assert.equal(engine.atk(findMonster(state,1,fiendUid),state.core),base.fiend.atk+200,
    'Yami boosts the opposing Fiend too');
  assert.equal(engine.def(findMonster(state,1,fiendUid),state.core),base.fiend.def+200);
  assert.equal(engine.atk(findMonster(state,2,spellcasterUid),state.core),base.spellcaster.atk+200);
  assert.equal(engine.def(findMonster(state,2,spellcasterUid),state.core),base.spellcaster.def+200);
  assert.equal(engine.atk(findMonster(state,3,fairyUid),state.core),Math.max(0,base.fairy.atk-200));
  assert.equal(engine.def(findMonster(state,3,fairyUid),state.core),Math.max(0,base.fairy.def-200));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(findMonster(state,0,dragonUid),state.core),base.dragon.atk);
  assert.equal(engine.atk(findMonster(state,1,fiendUid),state.core),base.fiend.atk+200);
  assert.equal(engine.atk(findMonster(state,2,spellcasterUid),state.core),base.spellcaster.atk+200);
  assert.equal(engine.atk(findMonster(state,3,fairyUid),state.core),Math.max(0,base.fairy.atk-200));

  state=endTurn(state,2);
  state=endTurn(state,3);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,YAMI);
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
