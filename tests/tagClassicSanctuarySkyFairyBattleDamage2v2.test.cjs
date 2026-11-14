'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const SANCTUARY='56433456';
const MYSTICAL_ELF='15025844';
const AXE_RAIDER='48305365';

assert.equal(getPlayableCard(SANCTUARY)?.kind,'spell');
assert.equal(getPlayableCard(SANCTUARY)?.field,true);
assert.equal(getEffect(SANCTUARY)?.kind,'field');
assert.equal(getEffect(SANCTUARY)?.rules[0]?.kind,'combat');
assert.equal(getEffect(SANCTUARY)?.rules[0]?.rule?.kind,'damage');
assert.equal(getEffect(SANCTUARY)?.rules[0]?.rule?.mode,'zero');
assert.equal(getEffect(SANCTUARY)?.rules[0]?.rule?.when,'battle');
assert.equal(getPlayableCard(MYSTICAL_ELF)?.race,'Fairy');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Sanctuary fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm187-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(first,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M187 Seat '+seat,
    cards:deck([SANCTUARY,MYSTICAL_ELF,AXE_RAIDER])
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
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
  throw new Error('M187 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Sanctuary must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Sanctuary must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Field Spell response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state,activeSeat){
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(activeSeat),action));
}
function attack(state,activeSeat,attacker,target){
  const action=tag.tagActions(state,member(activeSeat)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the shared attack action');
  const inactivePartner=activeSeat===0?2:3;
  assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(inactivePartner),action),/Aguarde a vez do participante ativo/);
  return settle(tag.stepTagDuel(state,member(activeSeat),action));
}

for(const first of [0,1]){
  test('The Sanctuary in the Sky prevents battle damage to a Fairy on either opposing 2v2 team (first seat '+first+')',()=>{
    let state=game(first,'m187-sanctuary-first-'+first);
    const before=inventorySnapshot(state);
    const activeSeat=first;
    const opposingSeat=first===0?1:0;
    const fieldCard=takeCard(state,activeSeat,SANCTUARY);
    holder(state,activeSeat).hand.push(fieldCard);
    const attacker=deploy(state,activeSeat,AXE_RAIDER);
    const fairy=deploy(state,opposingSeat,MYSTICAL_ELF);
    assert.ok(attacker.uid.startsWith('m'+activeSeat+':'),
      'the attacking monster must retain the active physical seat UID');
    assert.ok(fairy.uid.startsWith('m'+opposingSeat+':'),
      'the Fairy target must retain the opposing physical seat UID');

    const activation=tag.tagActions(state,member(activeSeat)).find(action=>
      action.kind==='field'&&action.card===fieldCard.uid
    );
    assert.ok(activation,'the active teammate must be able to activate The Sanctuary in the Sky');
    const inactivePartner=activeSeat===0?2:3;
    assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
      'the inactive partner cannot execute the Field Spell activation');
    state=settle(tag.stepTagDuel(state,member(activeSeat),activation));
    assert.equal(state.core.players[activeSeat%2].field?.uid,fieldCard.uid,
      'The Sanctuary occupies the activating team shared Field Zone');

    state=startBattle(state,activeSeat);
    state=attack(state,activeSeat,attacker,fairy);
    const targetTeam=opposingSeat%2;
    assert.equal(state.core.players[targetTeam].lp,4000,
      'The Sanctuary reduces battle damage involving the opposing Fairy to zero even when that Fairy is destroyed');
    assert.equal(state.core.players[activeSeat%2].lp,4000,
      'the attacking team takes no battle damage from its winning attack');
    assert.ok(state.core.players[targetTeam].grave.some(card=>card.uid===fairy.uid&&card.id===MYSTICAL_ELF),
      'the Fairy is still destroyed by battle; only battle damage is prevented');
    assert.ok(state.core.players[activeSeat%2].monsters.some(card=>card.uid===attacker.uid),
      'the attacker survives its winning battle');
    assert.equal(tag.publicTagDuel(state).teams[targetTeam].lp,4000,
      'the public projection must show the protected shared team LP');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}
