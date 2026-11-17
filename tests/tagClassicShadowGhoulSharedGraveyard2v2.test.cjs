'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const SHADOW_GHOUL='30778711';
const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
const SONIC_BIRD='57617178';
const FIELD_SPELLS=['18161786','19384334','45778932'];
const DIRECT_ATTACK_FILLERS=['12472242','21347810','58861941','32809211','02792265','59290628'];

assert.equal(getPlayableCard(SHADOW_GHOUL)?.englishName,'Shadow Ghoul');
assert.equal(getPlayableCard(SHADOW_GHOUL)?.atk,1600);
assert.equal(getEffect(SHADOW_GHOUL)?.kind,'monsterEffect');
const shadowEffect=getMonsterEffect(SHADOW_GHOUL);
assert.equal(shadowEffect?.trigger,'continuous');
assert.equal(shadowEffect?.operation.kind,'continuous');
assert.deepEqual(shadowEffect?.operation.rules[0],{
  kind:'modifier',filter:{selfOnly:true},atk:0,def:0,
  count:{zone:'grave',controller:'source',atk:100,def:0,cardKind:'monster'}
});
assert.equal(getPlayableCard(DARK_MAGICIAN)?.kind,'monster');
assert.equal(getPlayableCard(BLUE_EYES)?.kind,'monster');
assert.equal(getPlayableCard(SONIC_BIRD)?.kind,'monster');

const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>
  ![SHADOW_GHOUL,DARK_MAGICIAN,BLUE_EYES,SONIC_BIRD,...FIELD_SPELLS,...DIRECT_ATTACK_FILLERS].includes(id)
).slice(0,7);
assert.equal(FILLERS.length,7,'the fixture needs seven distinct certified Normal Monsters');
const POOL=[SHADOW_GHOUL,DARK_MAGICIAN,BLUE_EYES,SONIC_BIRD,...FIELD_SPELLS,...DIRECT_ATTACK_FILLERS,...FILLERS];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20,'the 20-card Deck must not duplicate card identities');

function member(seat){return 'm245-seat-'+seat;}
function deck(){return [...POOL];}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M245 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m245-shadow-ghoul-shared-graveyard'});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M245 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function moveToGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'graveyard counting must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'graveyard counting must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}

test('Shadow Ghoul counts only monster cards in its shared team Graveyard, including both physical partners',()=>{
  const state=game();
  const before=inventorySnapshot(state);
  const shadow=placeMonster(state,2,SHADOW_GHOUL);
  assert.match(shadow.uid,/^m2:/,'Shadow Ghoul retains inactive partner physical ownership');
  assert.equal(engine.atk(shadow,state.core),1600,'an empty team Graveyard gives printed ATK');

  const alliedActiveMonster=moveToGrave(state,0,DARK_MAGICIAN);
  const alliedPartnerMonster=moveToGrave(state,2,BLUE_EYES);
  const alliedSpell=moveToGrave(state,0,FIELD_SPELLS[0]);
  const opposingMonster=moveToGrave(state,1,DIRECT_ATTACK_FILLERS[0]);
  assert.match(alliedActiveMonster.uid,/^m0:/);
  assert.match(alliedPartnerMonster.uid,/^m2:/);
  assert.match(opposingMonster.uid,/^m1:/);

  assert.equal(state.core.players[0].grave.length,3);
  assert.equal(state.core.players[1].grave.length,1);
  assert.equal(engine.atk(shadow,state.core),1800,
    'two allied Graveyard monsters add 200 ATK; the Spell and opposing monster do not count');

  const additionalAlliedMonster=moveToGrave(state,2,SONIC_BIRD);
  assert.match(additionalAlliedMonster.uid,/^m2:/);
  assert.equal(engine.atk(shadow,state.core),1900,
    'a new monster sent by the inactive partner updates the continuous count immediately');

  const removed=state.core.players[0].grave.splice(
    state.core.players[0].grave.findIndex(card=>card.uid===alliedActiveMonster.uid),1
  )[0];
  holder(state,0).hand.push(removed);
  assert.equal(engine.atk(shadow,state.core),1800,
    'moving an allied monster out of the shared Graveyard immediately removes its 100 ATK contribution');

  const publicState=tag.publicTagDuel(state);
  assert.equal(publicState.teams[0].graveCount,3);
  assert.equal(publicState.teams[1].graveCount,1);
  assertConserved(state,before);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
