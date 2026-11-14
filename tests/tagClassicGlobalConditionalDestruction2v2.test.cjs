'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const NEEDLE_CEILING='38411870';
const REALLY_ETERNAL_REST='28121403';
const DISARMAMENT='20727787';
const SOUL_TAKER='81510157';
const EQUIP='01435851';
const MIRROR_FORCE='44095762';
const TORRENTIAL_TRIBUTE='53582587';

for(const [id,name] of [
  [NEEDLE_CEILING,'Needle Ceiling'],
  [REALLY_ETERNAL_REST,'Really Eternal Rest'],
  [DISARMAMENT,'Disarmament'],
  [SOUL_TAKER,'Soul Taker']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'conditionalDestruction');
}
assert.equal(getEffect(NEEDLE_CEILING)?.minFieldMonsters,4);
assert.equal(getEffect(NEEDLE_CEILING)?.faceUp,true);
assert.equal(getEffect(REALLY_ETERNAL_REST)?.equipped,true);
assert.equal(getEffect(DISARMAMENT)?.zone,'equipSpells');
assert.equal(getEffect(SOUL_TAKER)?.opponentGainOnDestroy,1000);
assert.equal(getPlayableCard(EQUIP)?.kind,'spell');
assert.equal(getEffect(EQUIP)?.kind,'equip');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the conditional destruction fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm201-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M201 Seat '+seat,cards:deck(required)
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
  throw new Error('M201 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takeCard(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setBackrow(state,seat,id){
  const card=takeCard(state,seat,id);
  const setCard={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(setCard);
  return setCard;
}
function attachEquip(state,seat,monster,id=EQUIP){
  const card=takeCard(state,seat,id);
  const equip={...card,faceUp:true,setTurn:0,resolved:true,equippedTo:monster.uid};
  state.core.players[seat%2].backrow.push(equip);
  return equip;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the global Trap response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,seat).find(candidate=>candidate.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,pass);
  }
  return state;
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
  assert.equal(cards.length,before.size,'conditional destruction must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'conditional destruction must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function activatePartnerTrap(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='trap'&&candidate.card===source.uid
  );
  assert.ok(action,'active seat 0 can activate a partner-owned Set Trap on the shared backrow');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical Trap owner cannot independently activate the shared Trap');
  return settle(tag.stepTagDuel(state,member(0),action));
}

test('Needle Ceiling destroys every face-up monster across both teams at the exact four-monster threshold',()=>{
  let state=game([NEEDLE_CEILING],'m201-needle-ceiling-global');
  const source=setBackrow(state,2,NEEDLE_CEILING);
  const own=deploy(state,0,normalIds[0]);
  const partner=deploy(state,2,normalIds[1]);
  const opponent=deploy(state,1,normalIds[2]);
  const hiddenOpponent=deploy(state,3,normalIds[3],{faceUp:false,position:'def'});
  const before=inventorySnapshot(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(source.id)&&!publicBefore.includes(source.uid),
    'the partner-owned Set Trap remains hidden before activation');
  state=activatePartnerTrap(state,source);
  assert.deepEqual(state.core.players[0].monsters,[],
    'both face-up allied monsters are destroyed by the global Trap');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[hiddenOpponent.uid],
    'the face-down opposing monster survives the face-up-only destruction');
  for(const card of [own,partner])assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid));
  assert.ok(state.core.players[1].grave.some(entry=>entry.uid===opponent.uid));
  assert.ok(state.core.players[0].grave.some(entry=>entry.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Needle Ceiling cannot be activated with only three monsters on the shared 2v2 field',()=>{
  let state=game([NEEDLE_CEILING],'m201-needle-ceiling-below-threshold');
  const source=setBackrow(state,2,NEEDLE_CEILING);
  deploy(state,0,normalIds[0]);
  deploy(state,1,normalIds[1]);
  deploy(state,3,normalIds[2]);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='trap'&&action.card===source.uid),
    'the fourth-monster threshold counts the shared field and is not met');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===source.uid),
    'an ineligible Needle Ceiling remains Set');
  tag.assertTagDuel(state);
});

test('Really Eternal Rest destroys equipped monsters from both teams but preserves un-equipped monsters',()=>{
  let state=game([REALLY_ETERNAL_REST,EQUIP],'m201-really-eternal-rest');
  const source=setBackrow(state,2,REALLY_ETERNAL_REST);
  const ownEquipped=deploy(state,0,normalIds[0]);
  const allyUnEquipped=deploy(state,2,normalIds[1]);
  const opponentUnEquipped=deploy(state,1,normalIds[2]);
  const opponentEquipped=deploy(state,3,normalIds[3]);
  const ownEquip=attachEquip(state,0,ownEquipped);
  const opponentEquip=attachEquip(state,3,opponentEquipped);
  const before=inventorySnapshot(state);
  state=activatePartnerTrap(state,source);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===ownEquipped.uid),
    'the allied equipped monster is destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentEquipped.uid),
    'the opposing equipped monster is destroyed');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===ownEquip.uid),
    'the allied Equip Spell leaves the field with its equipped monster');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentEquip.uid),
    'the opposing Equip Spell leaves the field with its equipped monster');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===allyUnEquipped.uid),
    'an un-equipped partner-owned monster survives');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentUnEquipped.uid),
    'an un-equipped opposing monster survives');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Disarmament destroys Equip Spells on both teams without destroying their equipped monsters',()=>{
  let state=game([DISARMAMENT,EQUIP,MIRROR_FORCE,TORRENTIAL_TRIBUTE],'m201-disarmament-global');
  const source=setBackrow(state,2,DISARMAMENT);
  const ownMonster=deploy(state,0,normalIds[0]);
  const opponentMonster=deploy(state,3,normalIds[1]);
  const ownEquip=attachEquip(state,0,ownMonster);
  const opponentEquip=attachEquip(state,3,opponentMonster);
  const ownSet=setBackrow(state,0,MIRROR_FORCE);
  const opponentSet=setBackrow(state,1,TORRENTIAL_TRIBUTE);
  const before=inventorySnapshot(state);
  state=activatePartnerTrap(state,source);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===ownEquip.uid&&card.id===EQUIP),
    'the allied Equip Spell is destroyed');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentEquip.uid&&card.id===EQUIP),
    'the opposing Equip Spell is destroyed');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ownMonster.uid),
    'Disarmament does not destroy the allied equipped monster');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opponentMonster.uid),
    'Disarmament does not destroy the opposing equipped monster');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===ownSet.uid),
    'an ordinary allied Set Trap survives');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===opponentSet.uid),
    'an ordinary opposing Set Trap survives');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Soul Taker can target either opposing physical seat and grants 1000 LP to the shared opposing team',()=>{
  let state=game([SOUL_TAKER],'m201-soul-taker-team-lp');
  const source=ensureInHand(state,0,SOUL_TAKER);
  const ally=deploy(state,2,normalIds[0]);
  const firstOpponent=deploy(state,1,normalIds[1]);
  const secondOpponent=deploy(state,3,normalIds[2]);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.ok(actions.some(action=>action.target===firstOpponent.uid));
  assert.ok(actions.some(action=>action.target===secondOpponent.uid));
  assert.ok(!actions.some(action=>action.target===ally.uid));
  const before=inventorySnapshot(state);
  state=settle(tag.stepTagDuel(state,member(0),actions.find(action=>action.target===secondOpponent.uid)));
  assert.equal(state.core.players[1].lp,5000,
    'the opposing shared team gains exactly 1000 LP after its monster is destroyed');
  assert.equal(state.core.players[0].lp,4000,'the activating team LP is unchanged');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===secondOpponent.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===firstOpponent.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});
