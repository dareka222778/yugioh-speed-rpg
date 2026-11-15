'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {countFormulaIssues}=require('../dist/continuousRules');
const {rulesFor}=require('../dist/rulesProfile');

const BUG='42364374';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(BUG)?.englishName,'Arsenal Bug');
assert.equal(getCardStatus(BUG)?.stage,'certified');
assert.equal(getEffect(BUG)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(BUG),{
  trigger:'continuous',
  operation:{
    kind:'continuous',
    rules:[{
      kind:'modifier',
      filter:{selfOnly:true},
      atk:-1000,
      def:-1000,
      count:{
        zone:'monsters',controller:'source',races:['Insect'],faceUp:true,
        excludeSource:true,cap:1,atk:1000,def:1000
      }
    }]
  }
});

const CORE_IDS=[BUG,CELTIC_GUARDIAN];
const FILLER_IDS=[...new Set(tag.tagNormalCardIds)].filter(id=>!CORE_IDS.includes(id)).slice(0,17);
const DECK=[BUG,BUG,CELTIC_GUARDIAN,...FILLER_IDS];
assert.equal(DECK.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(FILLER_IDS).size,17);

function member(seat){return 'm237-seat-'+seat;}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M237 Seat '+seat,cards:[...DECK]}));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed});
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[2,3],'seat 2/3 must be the active physical representatives');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
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
  throw new Error('M237 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const physical=takePhysical(state,seat,id);
  const monster={...physical,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function currentMonster(state,uid){
  return state.core.players.flatMap(p=>p.monsters).find(m=>m.uid===uid);
}
function moveToTeamGrave(state,uid){
  for(const player of state.core.players){
    const index=player.monsters.findIndex(m=>m.uid===uid);
    if(index>=0){
      const [monster]=player.monsters.splice(index,1);
      player.grave.push({uid:monster.uid,id:monster.id});
      return;
    }
  }
  throw new Error('M237 monster not found on shared field: '+uid);
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
  assert.equal(cards.length,before.size,'continuous effects must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function stats(state,uid){
  const monster=currentMonster(state,uid);
  assert.ok(monster,'Arsenal Bug must remain on the shared field');
  return [engine.atk(monster,state.core),engine.def(monster,state.core)];
}

test('Arsenal Bug uses only its own team field: an opposing Insect and an allied non-Insect do not count',()=>{
  const state=createGame('m237-opponent-insect-and-allied-non-insect');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,BUG);
  const alliedNonInsect=deploy(state,2,CELTIC_GUARDIAN);
  const opposingInsect=deploy(state,1,BUG);

  assert.equal(source.uid.startsWith('m0:'),true,'the source retains the inactive partner physical UID');
  assert.equal(alliedNonInsect.uid.startsWith('m2:'),true);
  assert.equal(opposingInsect.uid.startsWith('m1:'),true);
  assert.deepEqual(stats(state,source.uid),[1000,1000]);
  assert.equal(state.core.players[0].monsters.length,2,'the allied shared field remains within three zones');
  assert.equal(state.core.players[1].monsters.length,1);
  assert.equal(tag.tagActions(state,member(0)).length,0,'the inactive physical partner cannot issue actions');
  assert.equal(tag.tagActions(state,member(2)).some(a=>a.kind==='end'),true,'the active partner retains turn control');

  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('one face-up Insect from either physical teammate restores 2000 ATK/DEF; extra Insects do not stack',()=>{
  let state=createGame('m237-shared-field-capped-insect-count');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,BUG);
  const partnerOne=deploy(state,2,BUG);
  const partnerTwo=deploy(state,2,BUG);
  const opposing=deploy(state,1,BUG);

  assert.equal(source.uid.startsWith('m0:'),true);
  assert.equal(partnerOne.uid.startsWith('m2:'),true);
  assert.equal(partnerTwo.uid.startsWith('m2:'),true);
  assert.equal(opposing.uid.startsWith('m1:'),true);
  assert.deepEqual(stats(state,source.uid),[2000,2000],
    'the partner’s face-up Insect counts through the team-shared field, while the third Insect is capped');

  moveToTeamGrave(state,partnerOne.uid);
  assert.deepEqual(stats(state,source.uid),[2000,2000],
    'one remaining allied Insect is sufficient; the count is not proportional to the number of allies');

  moveToTeamGrave(state,partnerTwo.uid);
  assert.deepEqual(stats(state,source.uid),[1000,1000],
    'when the last other allied Insect leaves, both stats immediately return to 1000');
  assert.ok(state.core.players[1].monsters.some(m=>m.uid===opposing.uid),
    'the opposing team still controls an Insect, but it cannot satisfy the source team condition');

  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('bounded source-excluding count filters reject malformed limits and preserve a strict 2v2 field model',()=>{
  const valid={
    zone:'monsters',controller:'source',races:['Insect'],faceUp:true,
    excludeSource:true,cap:1,atk:1000,def:1000
  };
  assert.deepEqual(countFormulaIssues(valid),[]);
  assert.ok(countFormulaIssues({...valid,cap:0}).includes('invalid-count-formula'));
  assert.ok(countFormulaIssues({...valid,zone:'grave'}).includes('invalid-count-formula'));
  assert.ok(countFormulaIssues({...valid,excludeSource:false}).includes('invalid-count-formula'));

  const state=createGame('m237-zone-and-identity-integrity');
  const before=inventorySnapshot(state);
  const source=deploy(state,0,BUG);
  const partner=deploy(state,2,BUG);
  assert.deepEqual(stats(state,source.uid),[2000,2000]);
  assert.ok(state.core.players.every(p=>p.monsters.length<=3));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
  assert.equal(currentMonster(state,partner.uid)?.id,BUG);
});
