'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const BUSTER_BLADER='78193831';
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
const dragonNormal=[...new Set(tag.tagNormalCardIds)].find(id=>getPlayableCard(id)?.race==='Dragon');
const nonDragonNormal=[...new Set(tag.tagNormalCardIds)].find(id=>getPlayableCard(id)?.race&&getPlayableCard(id)?.race!=='Dragon');
assert.ok(normalIds.length>=8,'the fixture requires eight enabled Normal Monsters');
assert.ok(dragonNormal,'the enabled classic catalog must include a Normal Dragon for Buster Blader coverage');
assert.ok(nonDragonNormal,'the enabled classic catalog must include a non-Dragon Normal Monster');

assert.equal(getPlayableCard(BUSTER_BLADER)?.englishName,'Buster Blader');
assert.equal(getPlayableCard(BUSTER_BLADER)?.atk,2600);
assert.equal(getPlayableCard(BUSTER_BLADER)?.race,'Warrior');
assert.equal(getEffect(BUSTER_BLADER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(BUSTER_BLADER),{
  trigger:'continuous',
  operation:{kind:'continuous',rules:[
    {kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'monsters',controller:'opponent',races:['Dragon'],faceUp:true,atk:500,def:0}},
    {kind:'modifier',filter:{selfOnly:true},atk:0,def:0,count:{zone:'grave',controller:'opponent',races:['Dragon'],cardKind:'monster',atk:500,def:0}}
  ]}
});

const member=seat=>'m215-seat-'+seat;
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M215 Seat '+seat,
    cards:deck([BUSTER_BLADER,dragonNormal,nonDragonNormal])
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
  throw new Error('M215 fixture card missing from physical seat '+seat+': '+id);
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
function putInGrave(state,seat,id){
  const card=takeCard(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
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
  assert.equal(cards.length,before.size,'Buster Blader must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Buster Blader must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Buster Blader counts Dragons controlled or held in the Graveyards of both opposing seats only',()=>{
  let state=game('m215-buster-opposing-dragon-count');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,BUSTER_BLADER);
  const opponentFieldDragon=deploy(state,1,dragonNormal);
  const opponentHiddenDragon=deploy(state,3,dragonNormal,false);
  const opponentFieldNonDragon=deploy(state,1,nonDragonNormal);
  const alliedFieldDragon=deploy(state,0,dragonNormal);
  const opponentGraveDragon1=putInGrave(state,1,dragonNormal);
  const opponentGraveDragon3=putInGrave(state,3,dragonNormal);
  const alliedGraveDragon=putInGrave(state,2,dragonNormal);
  const opponentGraveNonDragon=putInGrave(state,3,nonDragonNormal);

  assert.match(source.uid,/^m2:/,'Buster Blader preserves the inactive partner physical UID');
  assert.match(opponentFieldDragon.uid,/^m1:/);
  assert.match(opponentHiddenDragon.uid,/^m3:/);
  assert.match(opponentGraveDragon1.uid,/^m1:/);
  assert.match(opponentGraveDragon3.uid,/^m3:/);
  assert.equal(state.core.players[1].monsters.length,3,'the opposing team must respect its three Monster Zones');
  assert.equal(state.core.players[0].monsters.length,2,'the allied team must respect its three Monster Zones');

  assert.equal(engine.atk(source,state.core),4100,
    'one face-up opposing field Dragon plus two opposing Graveyard Dragons grant 1500; face-down, allied and non-Dragon cards are excluded');
  opponentHiddenDragon.faceUp=true;
  opponentHiddenDragon.position='atk';
  assert.equal(engine.atk(source,state.core),4600,
    'revealing the second opposing field Dragon adds exactly 500 ATK');

  const fieldIndex=state.core.players[1].monsters.findIndex(card=>card.uid===opponentFieldDragon.uid);
  assert.notEqual(fieldIndex,-1);
  const [movedToGrave]=state.core.players[1].monsters.splice(fieldIndex,1);
  state.core.players[1].grave.push(movedToGrave);
  assert.equal(engine.atk(source,state.core),4600,
    'moving a counted Dragon from the opposing field to its Graveyard preserves one count instead of double-counting it');

  const graveIndex=state.core.players[1].grave.findIndex(card=>card.uid===opponentGraveDragon1.uid);
  assert.notEqual(graveIndex,-1);
  const [returnedToHand]=state.core.players[1].grave.splice(graveIndex,1);
  holder(state,1).hand.push(returnedToHand);
  assert.equal(engine.atk(source,state.core),4100,
    'returning one opposing Dragon from the Graveyard to its physical hand removes exactly 500 ATK');

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedFieldDragon.uid),
    'the allied field Dragon remains outside Buster Blader counting');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedGraveDragon.uid),
    'the allied Graveyard Dragon remains outside Buster Blader counting');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentFieldNonDragon.uid),
    'the opposing non-Dragon field monster does not contribute');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentGraveNonDragon.uid),
    'the opposing non-Dragon Graveyard monster does not contribute');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Buster Blader continuous bonus is inactive while Set and returns when face-up',()=>{
  let state=game('m215-buster-set-reset');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,BUSTER_BLADER,false);
  putInGrave(state,1,dragonNormal);
  putInGrave(state,3,dragonNormal);

  assert.equal(engine.atk(source,state.core),2600,
    'a Set Buster Blader keeps its printed ATK without applying the continuous bonus');
  source.faceUp=true;
  source.position='atk';
  assert.equal(engine.atk(source,state.core),3600,
    'turning Buster Blader face-up applies 500 ATK for each opposing Graveyard Dragon');
  source.faceUp=false;
  source.position='def';
  assert.equal(engine.atk(source,state.core),2600,
    'turning the source face-down immediately stops the continuous bonus');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});
