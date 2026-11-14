'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const IRON_BLACKSMITH='73431236';
const ARSENAL_SUMMONER='94163677';
const CYCLON_LASER='05494820';
const GUARDIAN_ELMA='74367458';
const CELTIC_GUARDIAN='91152256';
const FISSURE='66788016';

assert.equal(getMonsterEffect(IRON_BLACKSMITH)?.trigger,'flip');
assert.equal(getMonsterEffect(ARSENAL_SUMMONER)?.trigger,'flip');
assert.equal(getMonsterEffect(IRON_BLACKSMITH)?.operation.kind,'searchFiltered');
assert.equal(getMonsterEffect(ARSENAL_SUMMONER)?.operation.kind,'searchFiltered');
assert.equal(getEffect(CYCLON_LASER)?.kind,'equip');
assert.equal(getPlayableCard(GUARDIAN_ELMA)?.englishName,'Guardian Elma');
assert.equal(getPlayableCard(GUARDIAN_ELMA)?.archetype,'Guardian');
assert.ok(getPlayableCard(CELTIC_GUARDIAN),'Celtic Guardian must be available as a negative search candidate');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Flip search fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm195-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M195 Seat '+seat,cards:deck(required)
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
  throw new Error('M195 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const inDeck=physical.deck.find(card=>card.id===id);
  if(inDeck)return inDeck;
  const card=takeCard(state,seat,id);
  physical.deck.push(card);
  return card;
}
function deployFaceDown(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
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
  assert.equal(cards.length,before.size,'Flip search must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Flip search must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode==='flip'
  );
  assert.ok(action,'the active teammate can Flip Summon a partner-owned face-down monster on the shared field');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical source owner cannot submit the Flip Summon');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-partner Flip Summon must not mutate the duel');
  return tag.stepTagDuel(state,member(0),action);
}
function resolveOptionalSearch(state,source,targetId,excludedId){
  const optional=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(optional.includes(source.uid),'the optional Flip trigger must include the physical source card');
  assert.ok(optional.includes('__skip__'),'the optional Flip trigger must allow the player to decline');
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:source.uid});
  const choices=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose').map(action=>action.target);
  const target=holder(state,0).deck.find(card=>card.id===targetId);
  assert.ok(target,'the valid search target must remain in the active physical Deck');
  assert.ok(choices.includes(target.uid),'the filtered Flip search must include the valid target');
  if(excludedId){
    const excluded=holder(state,0).deck.filter(card=>card.id===excludedId);
    assert.ok(excluded.length>0,'the negative control must remain in the active Deck');
    assert.ok(!choices.some(uid=>excluded.some(card=>card.uid===uid)),
      'the filtered search must exclude the invalid negative-control card');
  }
  state=tag.stepTagDuel(state,member(0),{kind:'choose',target:target.uid});
  return {state,target};
}

test('Iron Blacksmith Kotetsu searches an Equip Spell from the active physical Deck when flipped by the teammate',()=>{
  let state=game([IRON_BLACKSMITH,CYCLON_LASER,FISSURE],'m195-kotetsu');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2,IRON_BLACKSMITH);
  ensureInDeck(state,0,CYCLON_LASER);
  ensureInDeck(state,0,FISSURE);
  state=flip(state,source);
  const result=resolveOptionalSearch(state,source,CYCLON_LASER,FISSURE);
  state=result.state;
  assert.match(result.target.uid,/^m0:/,'the Equip Spell is searched from active physical seat 0 Deck');
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===CYCLON_LASER),
    'Cyclon Laser is added to the active physical player's hand');
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===result.target.uid),
    'the partner physical hand does not receive the searched card');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Arsenal Summoner searches a valid Guardian card but excludes Celtic Guardian when flipped',()=>{
  let state=game([ARSENAL_SUMMONER,GUARDIAN_ELMA,CELTIC_GUARDIAN],'m195-arsenal-summoner');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2,ARSENAL_SUMMONER);
  ensureInDeck(state,0,GUARDIAN_ELMA);
  ensureInDeck(state,0,CELTIC_GUARDIAN);
  state=flip(state,source);
  const result=resolveOptionalSearch(state,source,GUARDIAN_ELMA,CELTIC_GUARDIAN);
  state=result.state;
  assert.match(result.target.uid,/^m0:/,'Guardian Elma is searched from active physical seat 0 Deck');
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===result.target.uid&&card.id===GUARDIAN_ELMA));
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===result.target.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
