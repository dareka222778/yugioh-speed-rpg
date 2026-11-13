'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const POLYMERIZATION='24094653';
const MYSTICAL_SAND='32751480';
const GIANT_SOLDIER='13039848';
const ANCIENT_ELF='93221206';

assert.equal(getPlayableCard(POLYMERIZATION)?.kind,'spell');
assert.equal(getEffect(POLYMERIZATION)?.kind,'polymerization');
assert.equal(getPlayableCard(MYSTICAL_SAND)?.monsterType,'fusion');
assert.equal(getEffect(MYSTICAL_SAND)?.kind,'fusion');
assert.deepEqual(getPlayableCard(MYSTICAL_SAND)?.fusion,[GIANT_SOLDIER,ANCIENT_ELF]);
assert.equal(getPlayableCard(GIANT_SOLDIER)?.monsterType,'normal');
assert.equal(getPlayableCard(ANCIENT_ELF)?.monsterType,'normal');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==GIANT_SOLDIER&&id!==ANCIENT_ELF)
  .slice(0,7);
assert.equal(normalIds.length,7);
function member(seat){return 'm151-seat-'+seat;}
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
  throw new Error('M151 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,81,'four 20-card decks plus one physical Extra Deck card');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,81);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Polymerization uses the active team shared field, preserves physical owners and excludes partner hand/opponent field',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M151 Seat '+seat,
    cards:deck(seat===0?[POLYMERIZATION,GIANT_SOLDIER]:seat===2?[ANCIENT_ELF]:seat===3?[GIANT_SOLDIER]:[]),
    extra:seat===0?[MYSTICAL_SAND]:[]
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m151-polymerization-shared-field'});
  const before=snapshot(state);
  assert.equal(state.core.players[0].extra.length,1);
  const polymerization=takeCard(state,0,POLYMERIZATION);
  holder(state,0).hand.push(polymerization);
  const activeMaterialUid=deploy(state,0,GIANT_SOLDIER);
  const partnerMaterialUid=deploy(state,2,ANCIENT_ELF);
  const opponentMaterialUid=deploy(state,3,GIANT_SOLDIER);
  const partnerHandMaterial=takeCard(state,2,ANCIENT_ELF);
  holder(state,2).hand.push(partnerHandMaterial);
  const fusion=state.core.players[0].extra.find(card=>card.id===MYSTICAL_SAND);
  assert.ok(fusion);
  assert.match(polymerization.uid,/^m0:/);
  assert.match(activeMaterialUid,/^m0:/);
  assert.match(partnerMaterialUid,/^m2:/);
  assert.match(opponentMaterialUid,/^m3:/);
  assert.match(partnerHandMaterial.uid,/^m2:/);
  assert.match(fusion.uid,/^m0:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const actions=tag.tagActions(state,member(0));
  const exact=actions.find(action=>
    action.kind==='fusion'&&action.card===polymerization.uid&&action.extra===fusion.uid&&
    action.position==='atk'&&
    [...action.materials].sort().join('|')===[activeMaterialUid,partnerMaterialUid].sort().join('|')
  );
  assert.ok(exact,'active seat must be able to fuse its own material with the inactive partner field material');
  assert.ok(!actions.some(action=>action.kind==='fusion'&&action.card===polymerization.uid&&action.materials.includes(partnerHandMaterial.uid)),
    'the inactive partner private hand is not a Polymerization material pool');
  assert.ok(!actions.some(action=>action.kind==='fusion'&&action.card===polymerization.uid&&action.materials.includes(opponentMaterialUid)),
    'the opposing team field is not a legal material pool');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive partner cannot execute Polymerization on behalf of the active seat');

  state=tag.stepTagDuel(state,member(0),exact);
  const summoned=state.core.players[0].monsters.find(card=>card.uid===fusion.uid);
  assert.ok(summoned,'Mystical Sand must leave the Extra Deck and enter the active shared field');
  assert.equal(summoned.id,MYSTICAL_SAND);
  assert.equal(state.core.players[0].extra.some(card=>card.uid===fusion.uid),false);
  for(const uid of [polymerization.uid,activeMaterialUid,partnerMaterialUid]){
    assert.ok(state.core.players[0].grave.some(card=>card.uid===uid),
      'Polymerization and both physical materials must go to the shared team Graveyard: '+uid);
  }
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentMaterialUid),
    'the opponent field material must remain untouched');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerHandMaterial.uid),
    'the partner private hand copy must remain in that physical seat hand');
  assert.equal(engine.atk(summoned,state.core),getPlayableCard(MYSTICAL_SAND).atk);
  assert.equal(engine.def(summoned,state.core),getPlayableCard(MYSTICAL_SAND).defense);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fusion.uid));
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerHandMaterial.uid));
  assertConserved(state,before);
});
