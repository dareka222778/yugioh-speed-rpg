'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');
const {turnMonsterFaceDown}=require('../dist/classicEffects');

const AXE_RAIDER='48305365';
const GUARDIANS=[
  {id:'62340868',name:'Kazejin',atk:2400},
  {id:'98434877',name:'Suijin',atk:2500},
  {id:'25955164',name:'Sanga of the Thunder',atk:2600}
];

for(const guardian of GUARDIANS){
  const card=getPlayableCard(guardian.id);
  const effect=getMonsterEffect(guardian.id);
  assert.ok(card&&card.kind==='monster',guardian.name+' must be a certified playable Monster');
  assert.equal(card.atk,guardian.atk,guardian.name+' ATK metadata must match the official card');
  assert.equal(effect?.trigger,'quick',guardian.name+' must expose a Quick Effect');
  assert.equal(effect?.operation.kind,'guardianZeroAttack',guardian.name+' must use the guardian zero-ATK operation');
  assert.equal(getMonsterDefinition(guardian.id)?.activation.window,'opposingDamageCalculation',
    guardian.name+' must activate during opposing damage calculation');
}
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700,'Axe Raider must remain weaker than every Guardian');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==AXE_RAIDER&&getPlayableCard(id)?.kind==='monster');
assert.ok(normalIds.length>=20,'the physical Deck fixtures need twenty distinct certified Normal Monsters');

function member(seat){return 'm211-seat-'+seat;}
function deck(required=[]){
  const ids=[...required,...normalIds.filter(id=>!required.includes(id))];
  assert.ok(ids.length>=20,'each physical seat must receive a complete 20-card Deck');
  return ids.slice(0,20);
}
function game(guardianId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M211 Seat '+seat,
    cards:deck(seat===2?[AXE_RAIDER,AXE_RAIDER,AXE_RAIDER]:seat===3?[guardianId]:[])
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
  throw new Error('M211 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk',faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card Decks must contribute exactly 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all 80 physical UIDs must be unique before battle');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Guardian effects must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Guardian effects must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<24,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activeMember(state){return tag.tagDecisionMember(state).id;}
function startBattle(state){
  const actor=activeMember(state);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active teammate must be able to enter the Battle Phase');
  return settle(tag.stepTagDuel(state,actor,action));
}
function declareAttack(state,attacker,guardian){
  const actor=activeMember(state);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===guardian.uid
  );
  assert.ok(action,'the active teammate must be able to attack the partner-owned Guardian on the shared field');
  return tag.stepTagDuel(state,actor,action);
}
function endCurrentTurn(state){
  const actor=activeMember(state);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active teammate must have a legal End Phase action');
  return settle(tag.stepTagDuel(state,actor,action));
}
function flipSummon(state,guardian){
  const actor=activeMember(state);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='position'&&candidate.card===guardian.uid&&candidate.mode==='flip'
  );
  assert.ok(action,'the active teammate must be able to Flip Summon the partner-owned face-down Guardian');
  return tag.stepTagDuel(state,actor,action);
}
function reachGuardianWindow(state,guardianUid){
  const stages=[];
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the attack must reach or leave the damage-calculation window');
    const actor=activeMember(state);
    const actions=tag.tagActions(state,actor);
    stages.push(state.core.pending.stage);
    const activation=actions.find(action=>action.kind==='monsterEffect'&&action.card===guardianUid);
    if(activation)return {state,activation,stages};
    const pass=actions.find(action=>action.kind==='pass');
    assert.ok(pass,'each response priority must offer pass when the Guardian effect is unavailable');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return {state,activation:undefined,stages};
}
function activateGuardian(state,guardian,attacker,expectedDefender){
  const window=reachGuardianWindow(state,guardian.uid);
  state=window.state;
  assert.ok(window.activation,'a face-up Guardian must offer its Quick Effect during damage calculation');
  assert.ok(window.stages.includes('calculation'),'the Guardian effect must be restricted to damage calculation');
  assert.equal(state.core.pending.stage,'calculation');
  const defender=tag.tagDecisionMember(state);
  assert.equal(defender.team,1,'only the defending team receives the Guardian response priority');
  if(expectedDefender)assert.equal(defender.id,expectedDefender);
  assert.equal(window.activation.target,attacker.uid,'the effect must target the current attacking monster');
  assert.deepEqual(window.activation.discards,[],'Guardian Zero Attack has no discard cost');
  if(defender.id!==member(3)){
    assert.deepEqual(tag.tagActions(state,member(3)),[],
      'the inactive physical owner cannot activate the Guardian for the active teammate');
    const unchanged=JSON.stringify(state);
    assert.throws(()=>tag.stepTagDuel(state,member(3),window.activation),/Aguarde a vez do participante ativo\./);
    assert.equal(JSON.stringify(state),unchanged,'a rejected inactive-seat action must not mutate the battle chain');
  }
  return settle(tag.stepTagDuel(state,defender.id,window.activation));
}
function fieldMonster(state,uid){
  return state.core.players.flatMap(team=>team.monsters).find(monster=>monster.uid===uid);
}
function setup(guardianId,seed){
  let state=game(guardianId,seed);
  const before=inventorySnapshot(state);
  const attackers=[
    deploy(state,2,AXE_RAIDER),
    deploy(state,2,AXE_RAIDER),
    deploy(state,2,AXE_RAIDER)
  ];
  const guardian=deploy(state,3,guardianId);
  for(const attacker of attackers)assert.match(attacker.uid,/^m2:/,'the attackers must retain partner seat 2 physical ownership');
  assert.match(guardian.uid,/^m3:/,'the Guardian must retain inactive partner seat 3 physical ownership');
  assert.equal(guardian.faceUp,true);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attackers,guardian};
}

for(const guardianSpec of GUARDIANS){
  test(guardianSpec.name+' regains Guardian Zero Attack only after being set and legally Flip Summoned by its active teammate',()=>{
    const {state:initial,before,attackers,guardian}=setup(guardianSpec.id,'m211-reset-'+guardianSpec.id);
    let state=startBattle(initial);

    // First use consumes the face-up activation while the active defender is the Guardian owner's partner.
    state=declareAttack(state,attackers[0],guardian);
    assert.equal(state.core.phase,'response','the first attack must open a response sequence');
    state=activateGuardian(state,guardian,attackers[0],member(1));
    assert.equal(fieldMonster(state,guardian.uid)?.guardianUsed,true,'the first activation must consume the face-up use');
    assert.equal(state.core.players[0].lp,4000-guardianSpec.atk,
      'the attacking team takes battle damage from the Guardian after its attacker is reduced to zero');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===attackers[0].uid&&card.id===AXE_RAIDER),
      'the zero-ATK partner-owned attacker is destroyed by battle into the correct shared Graveyard');
    assert.ok(fieldMonster(state,guardian.uid),'the Guardian survives its first protected battle');

    // Exercise the exact runtime transition used by Book of Moon and position-changing effects.
    const currentGuardian=fieldMonster(state,guardian.uid);
    assert.ok(currentGuardian);
    turnMonsterFaceDown(currentGuardian);
    assert.equal(currentGuardian.faceUp,false);
    assert.equal(currentGuardian.position,'def');
    assert.equal(Object.hasOwn(currentGuardian,'guardianUsed'),false,
      'the face-down transition must clear the once-while-face-up marker');
    const hiddenProjection=JSON.stringify(tag.publicTagDuel(state));
    assert.ok(!hiddenProjection.includes(guardianSpec.id),'a Set Guardian identity must remain hidden in the public projection');
    assert.ok(!hiddenProjection.includes(guardian.uid),'a Set Guardian UID must remain hidden in the public projection');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));

    // A second attack while Set proves the Quick Effect is unavailable and does not reveal the card.
    state=declareAttack(state,attackers[1],guardian);
    const hiddenWindow=reachGuardianWindow(state,guardian.uid);
    assert.ok(hiddenWindow.stages.includes('calculation'));
    assert.equal(hiddenWindow.activation,undefined,'a face-down Guardian cannot activate its Quick Effect');
    state=hiddenWindow.state;
    assert.equal(state.core.phase,'battle','the attack resolves normally without a hidden Guardian activation');
    assert.equal(fieldMonster(state,guardian.uid)?.faceUp,false,'the Guardian remains Set after the attack');
    assert.ok(fieldMonster(state,attackers[1].uid),'Axe Raider survives attacking a higher-DEF Set Guardian');
    assert.equal(state.core.players[0].lp,4000-guardianSpec.atk,'the Set Guardian causes no extra battle damage');
    assert.equal(state.core.players[1].lp,4000,'the defending team remains undamaged');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));

    // The next turn belongs to seat 1, which may Flip Summon the physical seat 3 Guardian.
    state=endCurrentTurn(state);
    assert.equal(state.core.turn,4);
    assert.equal(activeMember(state),member(1),'the defending partner must receive the next turn');
    state=flipSummon(state,guardian);
    assert.equal(fieldMonster(state,guardian.uid)?.faceUp,true,'the legal Flip Summon reveals the Guardian');
    assert.equal(fieldMonster(state,guardian.uid)?.position,'atk','Flip Summon places the Guardian face-up in Attack Position');
    assert.equal(fieldMonster(state,guardian.uid)?.guardianUsed,undefined,
      'the Guardian remains eligible after the face-down reset and Flip Summon');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));

    // The opposing active seat rotates to seat 2; it attacks with the third partner-owned Axe Raider.
    state=endCurrentTurn(state);
    assert.equal(state.core.turn,5);
    assert.equal(activeMember(state),member(2));
    state=startBattle(state);
    state=declareAttack(state,attackers[2],guardian);
    state=activateGuardian(state,guardian,attackers[2],member(1));
    assert.equal(fieldMonster(state,guardian.uid)?.guardianUsed,true,
      'the same face-up Guardian can consume its reset use again');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===attackers[2].uid&&card.id===AXE_RAIDER),
      'the second zero-ATK attacker is destroyed after the reset effect activates');
    assert.equal(state.core.players[0].lp,4000-(2*guardianSpec.atk),
      'the attacking team receives the Guardian battle damage on both successful activations');
    assert.equal(state.core.players[1].lp,4000,'the defending team takes no battle damage');
    assert.equal(fieldMonster(state,guardian.uid)?.faceUp,true,'the Guardian remains face-up after the second activation');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}
