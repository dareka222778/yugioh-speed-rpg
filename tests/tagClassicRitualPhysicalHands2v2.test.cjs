'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const BLACK_LUSTER_RITUAL='55761792';
const BLACK_LUSTER_SOLDIER='05405694';
const ritualSpell=getPlayableCard(BLACK_LUSTER_RITUAL);
const ritualMonster=getPlayableCard(BLACK_LUSTER_SOLDIER);
assert.ok(ritualSpell&&ritualSpell.kind==='spell','Black Luster Ritual must be playable');
assert.ok(ritualMonster&&ritualMonster.kind==='monster'&&ritualMonster.monsterType==='ritual',
  'Black Luster Soldier must be a playable Ritual Monster');
assert.equal(getEffect(BLACK_LUSTER_RITUAL)?.kind,'ritualSummon');
assert.equal(getEffect(BLACK_LUSTER_RITUAL)?.ritual.monsterId,BLACK_LUSTER_SOLDIER);
assert.equal(getEffect(BLACK_LUSTER_RITUAL)?.ritual.minimumLevel,8);

const levelFour=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.level===4&&Number.isInteger(entry.card.atk));
assert.ok(levelFour.length>=2,'the fixture needs two certified Level 4 Normal Monsters');
const [materialA,materialB]=levelFour;
assert.notEqual(materialA.id,materialB.id);
const normalIds=[...new Set([materialA.id,materialB.id,...levelFour.map(entry=>entry.id)])].slice(0,7);
assert.equal(normalIds.length,7);

function member(seat){return 'm154-seat-'+seat;}
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
  throw new Error('M154 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the Ritual');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Ritual Summon must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Ritual response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function choose(state,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='choose'&&candidate.target===target
  );
  assert.ok(action,'active seat 0 must be offered Ritual choice '+target);
  return tag.stepTagDuel(state,member(0),action);
}
function setup({activeHasRitual,partnerHasRitual,seed}){
  const players=[0,1,2,3].map(seat=>{
    const required=seat===0
      ?[BLACK_LUSTER_RITUAL,...activeHasRitual?[BLACK_LUSTER_SOLDIER]:[],materialA.id]
      :seat===2
        ?[...partnerHasRitual?[BLACK_LUSTER_SOLDIER]:[],materialB.id]
        :[];
    return {id:member(seat),name:'M154 Seat '+seat,cards:deck(required)};
  });
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const before=inventorySnapshot(state);
  const spell=takeCard(state,0,BLACK_LUSTER_RITUAL);
  holder(state,0).hand.push(spell);
  let activeMonster;
  if(activeHasRitual){
    activeMonster=takeCard(state,0,BLACK_LUSTER_SOLDIER);
    holder(state,0).hand.push(activeMonster);
  }
  let partnerMonster;
  if(partnerHasRitual){
    partnerMonster=takeCard(state,2,BLACK_LUSTER_SOLDIER);
    holder(state,2).hand.push(partnerMonster);
  }
  const fieldA=deploy(state,0,materialA.id);
  const fieldB=deploy(state,2,materialB.id);
  state.core.turn=3;
  assert.match(spell.uid,/^m0:/,'the Ritual Spell must retain active seat 0 physical ownership');
  if(activeMonster)assert.match(activeMonster.uid,/^m0:/);
  if(partnerMonster)assert.match(partnerMonster.uid,/^m2:/,'the partner Ritual Monster must remain in seat 2 private hand');
  assert.match(fieldA.uid,/^m0:/);
  assert.match(fieldB.uid,/^m2:/,'the inactive partner field material must retain its physical UID');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,spell,activeMonster,partnerMonster,fieldA,fieldB};
}

test('active teammate Ritual Summons Black Luster Soldier using shared-field materials without borrowing the partner private hand',()=>{
  const {state:initial,before,spell,activeMonster,partnerMonster,fieldA,fieldB}=setup({
    activeHasRitual:true,partnerHasRitual:true,seed:'m154-active-ritual-physical-hands'
  });
  assert.ok(!JSON.stringify(tag.publicTagDuel(initial)).includes(spell.uid),
    'the Ritual Spell UID must remain private before activation');
  assert.ok(!JSON.stringify(tag.publicTagDuel(initial)).includes(partnerMonster.uid),
    'the inactive partner Ritual Monster UID must remain private');
  assert.ok(tag.tagMemberHand(initial,member(2)).some(card=>card.uid===partnerMonster.uid));
  assert.ok(tag.tagActions(initial,member(2)).length===0,
    'inactive partner seat 2 cannot submit actions during seat 0 turn');

  const spellAction=tag.tagActions(initial,member(0)).find(action=>
    action.kind==='spell'&&action.card===spell.uid
  );
  assert.ok(spellAction,'active seat 0 may activate its own Black Luster Ritual');
  let state=settle(tag.stepTagDuel(initial,member(0),spellAction));
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'ritual');
  assert.deepEqual(state.core.choice.targets,[activeMonster.uid],
    'the Ritual monster choice must come only from active seat 0 hand, not partner seat 2 hand');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive partner cannot choose the Ritual Monster on behalf of the active seat');

  state=choose(state,activeMonster.uid);
  assert.equal(state.core.ritual.stage,'materials');
  assert.ok(state.core.choice.targets.includes(fieldA.uid));
  assert.ok(state.core.choice.targets.includes(fieldB.uid),
    'a monster physically owned by inactive seat 2 is usable from the shared team field');
  assert.ok(!state.core.choice.targets.includes(partnerMonster.uid),
    'the inactive partner Ritual Monster in hand is not a material candidate');
  state=choose(state,fieldA.uid);
  state=choose(state,fieldB.uid);
  assert.deepEqual(state.core.choice.targets,['__ritual_commit__','__ritual_undo__']);
  state=choose(state,'__ritual_commit__');
  assert.deepEqual(state.core.choice.targets,['__ritual_atk__','__ritual_def__']);
  state=choose(state,'__ritual_atk__');
  state=settle(state);

  const summoned=state.core.players[0].monsters.find(card=>card.uid===activeMonster.uid);
  assert.ok(summoned,'Black Luster Soldier must enter the shared field with its original physical UID');
  assert.equal(summoned.id,BLACK_LUSTER_SOLDIER);
  assert.equal(summoned.properlySummoned,true);
  assert.equal(summoned.position,'atk');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'the active seat Ritual Spell enters the shared Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fieldA.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fieldB.uid),
    'the inactive partner field material enters the shared Graveyard with its m2 UID');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerMonster.uid),
    'the inactive partner keeps its own Ritual Monster in its private hand');
  assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===partnerMonster.uid));
  assert.ok(!tag.tagMemberHand(state,member(0)).some(card=>card.uid===spell.uid));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('active seat cannot activate Black Luster Ritual using only the inactive partner private Ritual Monster',()=>{
  const {state,before,spell,partnerMonster}=setup({
    activeHasRitual:false,partnerHasRitual:true,seed:'m154-partner-private-ritual-unavailable'
  });
  const actions=tag.tagActions(state,member(0));
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===spell.uid),
    'the Ritual Spell must not be offered without its named Ritual Monster in active seat 0 hand');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive partner cannot activate its private Ritual Monster');
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===partnerMonster.uid));
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(0),{kind:'spell',card:spell.uid}));
  assert.equal(JSON.stringify(state),unchanged,'rejected Ritual activation must not mutate hands, field or inventory');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
