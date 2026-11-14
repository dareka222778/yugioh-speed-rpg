'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const INSECT_SOLDIERS='07019529';
const PENUMBRAL_SOLDIER='64751286';
const LUMINOUS_SOLDIER='57482479';
const DARK_ARTIST='72520073';
const SPEAR_DRAGON='31553716';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const MYSTICAL_ELF='15025844';
const BATTLE_WARRIOR='55550921';

for(const id of [INSECT_SOLDIERS,PENUMBRAL_SOLDIER,LUMINOUS_SOLDIER,DARK_ARTIST]){
  assert.equal(getPlayableCard(id)?.kind,'monster');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}
assert.equal(getPlayableCard(INSECT_SOLDIERS)?.atk,1000);
assert.equal(getPlayableCard(PENUMBRAL_SOLDIER)?.atk,2100);
assert.equal(getPlayableCard(LUMINOUS_SOLDIER)?.atk,2100);
assert.equal(getPlayableCard(DARK_ARTIST)?.defense,1400);
assert.equal(getPlayableCard(SPEAR_DRAGON)?.attribute,'WIND');
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');
assert.equal(getPlayableCard(DARK_MAGICIAN)?.attribute,'DARK');
assert.equal(getPlayableCard(MYSTICAL_ELF)?.attribute,'LIGHT');
assert.equal(getPlayableCard(MYSTICAL_ELF)?.atk,800);
assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the attribute battle fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm182-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M182 Seat '+seat,cards:deck(required)
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
  throw new Error('M182 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'attribute modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'attribute modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function startBattle(state){
  const action=tag.tagActions(state,member(0)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,member(0),action));
}
function attack(state,attacker,target){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must receive the partner-aware shared attack action');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical attacker owner cannot submit the attack');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return settle(tag.stepTagDuel(state,member(0),action));
}

for(const [sourceId,name,targetId,targetName] of [
  [INSECT_SOLDIERS,'Insect Soldiers of the Sky versus WIND',SPEAR_DRAGON,'Spear Dragon'],
  [PENUMBRAL_SOLDIER,'Penumbral Soldier Lady versus LIGHT',BLUE_EYES,'Blue-Eyes White Dragon'],
  [LUMINOUS_SOLDIER,'Luminous Soldier versus DARK',DARK_MAGICIAN,'Dark Magician']
]){
  test(name+' applies its temporary ATK bonus during the shared 2v2 Damage Step',()=>{
    let state=game([sourceId,targetId],'m182-attribute-battle-'+sourceId);
    const before=inventorySnapshot(state);
    const source=deploy(state,2,sourceId,'atk');
    const target=deploy(state,3,targetId,'atk');
    assert.match(source.uid,/^m2:/,'the battle modifier source must retain inactive teammate physical ownership');
    assert.match(target.uid,/^m3:/,'the opponent target must retain inactive teammate physical ownership');
    state=startBattle(state);
    state=attack(state,source,target);

    assert.equal(state.core.players[1].lp,3900,
      'the attribute-specific ATK increase must let the source win by exactly 100 battle damage');
    assert.equal(state.core.players[0].lp,4000,'the attacking team takes no battle damage');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
      'the battle modifier source must survive the winning battle');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===targetId),
      targetName+' must be destroyed after the temporary ATK increase');
    tag.assertTagDuel(state);
    assertConserved(state,before);
  });
}

test('Dark Artist halves its DEF only when defending against a LIGHT monster',()=>{
  let state=game([DARK_ARTIST,MYSTICAL_ELF],'m182-dark-artist-light');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,MYSTICAL_ELF,'atk');
  const artist=deploy(state,3,DARK_ARTIST,'def');
  state=startBattle(state);
  state=attack(state,attacker,artist);
  assert.equal(state.core.players[0].lp,4000,
    '800 LIGHT ATK exceeds Dark Artist temporary 700 DEF, so the attacker takes no battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===artist.uid&&card.id===DARK_ARTIST),
    'Dark Artist is destroyed after its DEF is halved for the Damage Step');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Dark Artist does not halve its DEF when defending against a non-LIGHT monster',()=>{
  let state=game([DARK_ARTIST,BATTLE_WARRIOR],'m182-dark-artist-non-light');
  const before=inventorySnapshot(state);
  const attacker=deploy(state,2,BATTLE_WARRIOR,'atk');
  const artist=deploy(state,3,DARK_ARTIST,'def');
  state=startBattle(state);
  state=attack(state,attacker,artist);
  assert.equal(state.core.players[0].lp,4000-700,
    'a 700 ATK non-LIGHT attacker must receive ordinary damage against 1400 DEF');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===artist.uid),
    'Dark Artist survives when its LIGHT-only condition is not met');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===artist.uid),
    'the non-LIGHT control must not destroy Dark Artist');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
