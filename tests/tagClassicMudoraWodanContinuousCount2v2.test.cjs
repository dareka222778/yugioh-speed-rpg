'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const MUDORA='82108372';
const WODAN='42883273';
const SENJU='23401839';
const MANJU='95492061';
const NON_PLANT='91152256';
const plantNormal=[...new Set(tag.tagNormalCardIds)].find(id=>getPlayableCard(id)?.race==='Plant');
assert.ok(plantNormal,'the enabled classic catalog must include a Normal Plant for Wodan coverage');

assert.equal(getPlayableCard(MUDORA)?.englishName,'Mudora');
assert.equal(getPlayableCard(WODAN)?.englishName,'Wodan the Resident of the Forest');
assert.equal(getPlayableCard(SENJU)?.race,'Fairy');
assert.equal(getPlayableCard(MANJU)?.race,'Fairy');
assert.equal(getPlayableCard(plantNormal)?.race,'Plant');
for(const id of [MUDORA,WODAN]){
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}

const member=seat=>'m208-seat-'+seat;
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.ok(normalIds.length>=8,'the fixture requires eight enabled Normal Monsters');

function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M208 Seat '+seat,
    cards:deck([MUDORA,WODAN,SENJU,MANJU,plantNormal,NON_PLANT])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
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
  throw new Error('M208 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'continuous modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Mudora counts Fairy monsters only in its own shared team Graveyard, not the opposing Graveyard',()=>{
  let state=game('m208-mudora-own-team-grave');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,MUDORA);
  const ownFairyActive=takeCard(state,0,SENJU);
  const ownFairyPartner=takeCard(state,2,MANJU);
  const opposingFairy=takeCard(state,1,SENJU);
  state.core.players[0].grave.push(ownFairyActive,ownFairyPartner);
  state.core.players[1].grave.push(opposingFairy);

  assert.match(source.uid,/^m2:/,'Mudora retains its partner physical UID on the shared field');
  assert.match(ownFairyActive.uid,/^m0:/);
  assert.match(ownFairyPartner.uid,/^m2:/);
  assert.match(opposingFairy.uid,/^m1:/);
  assert.equal(engine.atk(source,state.core),1900,
    'two allied Fairy monsters in the team Graveyard grant +400; the opposing Fairy is excluded');

  const index=state.core.players[0].grave.findIndex(card=>card.uid===ownFairyPartner.uid);
  assert.notEqual(index,-1);
  const [returned]=state.core.players[0].grave.splice(index,1);
  holder(state,2).hand.push(returned);
  assert.equal(engine.atk(source,state.core),1700,
    'returning one partner-owned Fairy to its physical hand removes exactly 200 ATK');
  assert.ok(holder(state,2).hand.some(card=>card.uid===ownFairyPartner.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingFairy.uid),
    'the opposing Fairy remains in the opposing Graveyard without contributing');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Wodan counts face-up Plant monsters across both shared fields and ignores face-down/non-Plant cards',()=>{
  let state=game('m208-wodan-both-fields');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,WODAN);
  const alliedPlant=deploy(state,0,plantNormal);
  const opposingPlant=deploy(state,1,plantNormal);
  const hiddenPlant=deploy(state,3,plantNormal,false);
  const nonPlant=deploy(state,3,NON_PLANT);

  assert.match(source.uid,/^m2:/,'Wodan retains partner physical ownership');
  assert.equal(engine.atk(source,state.core),1100,
    'two face-up Plants on either team grant +200 ATK; hidden Plant and non-Plant are excluded');
  hiddenPlant.faceUp=true;
  hiddenPlant.position='atk';
  assert.equal(engine.atk(source,state.core),1200,
    'turning a Plant face-up adds exactly 100 ATK');
  opposingPlant.faceUp=false;
  opposingPlant.position='def';
  assert.equal(engine.atk(source,state.core),1100,
    'a face-down opposing Plant stops contributing');
  alliedPlant.faceUp=false;
  alliedPlant.position='def';
  assert.equal(engine.atk(source,state.core),1000,
    'only the remaining face-up Plant contributes');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});
