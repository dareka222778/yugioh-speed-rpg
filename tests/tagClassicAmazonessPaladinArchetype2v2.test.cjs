'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,engineCard,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');

const AMAZONESS_PALADIN='47480070';
const AMAZONESS_ARCHER='91869203';
assert.equal(engineCard(AMAZONESS_PALADIN)?.englishName,'Amazoness Paladin');
assert.equal(engineCard(AMAZONESS_ARCHER)?.englishName,'Amazoness Archer');
for(const id of [AMAZONESS_PALADIN,AMAZONESS_ARCHER]){
  const fingerprint=definitionFingerprint(engineCard(id),getEffect(id),{model:getEffectModel,monster:getMonsterDefinition});
  console.log('M204_CARD_FINGERPRINT',id,fingerprint);
}
assert.ok(engineCard(AMAZONESS_PALADIN)?.archetypes?.includes('Amazoness'),
  'Amazoness Paladin must expose its official archetype to continuous filters');
assert.ok(engineCard(AMAZONESS_ARCHER)?.archetypes?.includes('Amazoness'),
  'Amazoness Archer must expose its official archetype to continuous filters');
assert.equal(getMonsterEffect(AMAZONESS_PALADIN)?.trigger,'continuous');
assert.equal(getMonsterEffect(AMAZONESS_PALADIN)?.operation.kind,'continuous');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Amazoness fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm204-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M204 Seat '+seat,cards:deck([AMAZONESS_PALADIN,AMAZONESS_ARCHER])
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
  throw new Error('M204 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size,'archetype modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'archetype modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Amazoness Paladin counts its own team partner Amazoness but excludes the opposing team',()=>{
  let state=game('m204-amazoness-paladin-team-count');
  const before=inventorySnapshot(state);
  const paladin=deploy(state,0,AMAZONESS_PALADIN);
  const partnerArcher=deploy(state,2,AMAZONESS_ARCHER);
  const opposingArcher=deploy(state,3,AMAZONESS_ARCHER);
  assert.match(partnerArcher.uid,/^m2:/,'the counted Amazoness is physically owned by the inactive teammate');
  assert.match(opposingArcher.uid,/^m3:/,'the opposing Amazoness keeps its own physical identity');
  assert.equal(engine.atk(paladin,state.core),1900,
    'Paladin counts itself and the partner-owned Amazoness Archer for +200 ATK');
  partnerArcher.faceUp=false;
  partnerArcher.position='def';
  assert.equal(engine.atk(paladin,state.core),1800,
    'a face-down partner Amazoness no longer contributes to the face-up archetype count');
  assert.equal(engine.atk(opposingArcher,state.core),1400,
    'the opposing Archer does not receive or contribute to the activating team Paladin bonus');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('two Amazoness Paladins each count only the two Amazoness monsters on their own shared team',()=>{
  let state=game('m204-amazoness-paladins-both-teams');
  const before=inventorySnapshot(state);
  const bluePaladin=deploy(state,0,AMAZONESS_PALADIN);
  const blueArcher=deploy(state,2,AMAZONESS_ARCHER);
  const redPaladin=deploy(state,1,AMAZONESS_PALADIN);
  const redArcher=deploy(state,3,AMAZONESS_ARCHER);
  assert.equal(engine.atk(bluePaladin,state.core),1900,
    'the blue Paladin counts only the blue Paladin and blue partner Archer');
  assert.equal(engine.atk(redPaladin,state.core),1900,
    'the red Paladin counts only the red Paladin and red partner Archer');
  assert.equal(engine.atk(blueArcher,state.core),1400);
  assert.equal(engine.atk(redArcher,state.core),1400);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
