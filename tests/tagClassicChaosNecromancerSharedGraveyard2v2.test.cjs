'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const CHAOS_NECROMANCER='01434352';
const MONSTER_REBORN='83764718';
const normalIds=[...new Set(tag.tagNormalCardIds)].slice(0,8);
assert.ok(normalIds.length>=8,'the fixture requires eight enabled Normal Monsters');

assert.equal(getPlayableCard(CHAOS_NECROMANCER)?.englishName,'Chaos Necromancer');
assert.equal(getPlayableCard(CHAOS_NECROMANCER)?.atk,0);
assert.equal(getPlayableCard(CHAOS_NECROMANCER)?.defense,0);
assert.equal(getPlayableCard(MONSTER_REBORN)?.kind,'spell');
assert.equal(getEffect(CHAOS_NECROMANCER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(CHAOS_NECROMANCER),{
  trigger:'continuous',
  operation:{kind:'continuous',rules:[{
    kind:'modifier',
    filter:{selfOnly:true},
    atk:0,
    def:0,
    count:{zone:'grave',controller:'source',cardKind:'monster',atk:300,def:0}
  }]}
});

const member=seat=>'m214-seat-'+seat;
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M214 Seat '+seat,
    cards:deck([CHAOS_NECROMANCER,MONSTER_REBORN])
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
  throw new Error('M214 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Chaos Necromancer must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Chaos Necromancer must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Chaos Necromancer counts Monster Cards in its shared team Graveyard, including its partner, but excludes opposing and non-Monster cards',()=>{
  let state=game('m214-chaos-necromancer-shared-grave');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,CHAOS_NECROMANCER);
  const activeMonster=putInGrave(state,0,normalIds[0]);
  const partnerMonster=putInGrave(state,2,normalIds[1]);
  const opposingMonster=putInGrave(state,1,normalIds[2]);
  const spell=putInGrave(state,0,MONSTER_REBORN);

  assert.match(source.uid,/^m2:/,'the face-up source keeps the inactive partner physical UID');
  assert.match(activeMonster.uid,/^m0:/);
  assert.match(partnerMonster.uid,/^m2:/);
  assert.match(opposingMonster.uid,/^m1:/);
  assert.equal(engine.atk(source,state.core),600,
    'two allied Monster Cards in the shared team Graveyard grant 600 ATK; the opposing monster and allied Spell do not count');

  const partnerIndex=state.core.players[0].grave.findIndex(card=>card.uid===partnerMonster.uid);
  assert.notEqual(partnerIndex,-1);
  const [returnedPartner]=state.core.players[0].grave.splice(partnerIndex,1);
  holder(state,2).hand.push(returnedPartner);
  assert.equal(engine.atk(source,state.core),300,
    'returning the partner-owned Monster Card to its physical hand removes exactly 300 ATK');

  const activeIndex=state.core.players[0].grave.findIndex(card=>card.uid===activeMonster.uid);
  assert.notEqual(activeIndex,-1);
  const [returnedActive]=state.core.players[0].grave.splice(activeIndex,1);
  holder(state,0).hand.push(returnedActive);
  assert.equal(engine.atk(source,state.core),0,
    'moving the final allied Monster Card out of the team Graveyard resets ATK to zero');

  const laterMonster=putInGrave(state,2,normalIds[3]);
  assert.match(laterMonster.uid,/^m2:/);
  assert.equal(engine.atk(source,state.core),300,
    'a later partner-owned Monster Card entering the shared Graveyard adds exactly 300 ATK');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingMonster.uid),
    'the opposing Monster Card remains in the opposing Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'the allied Spell remains in the team Graveyard without contributing ATK');

  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Chaos Necromancer continuous ATK is inactive while Set and recalculates when turned face-up',()=>{
  let state=game('m214-chaos-necromancer-face-up');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,CHAOS_NECROMANCER,false);
  const activeMonster=putInGrave(state,0,normalIds[0]);
  const partnerMonster=putInGrave(state,2,normalIds[1]);

  assert.match(source.uid,/^m0:/);
  assert.equal(engine.atk(source,state.core),0,
    'a Set Chaos Necromancer does not apply its continuous ATK effect');
  source.faceUp=true;
  source.position='atk';
  assert.equal(engine.atk(source,state.core),600,
    'turning the source face-up applies 300 ATK for each allied Monster Card in the shared Graveyard');
  source.faceUp=false;
  source.position='def';
  assert.equal(engine.atk(source,state.core),0,
    'turning the source face-down stops the continuous modifier immediately');

  assert.ok(state.core.players[0].grave.some(card=>card.uid===activeMonster.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===partnerMonster.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
