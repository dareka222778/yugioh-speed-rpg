'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const DARK_ELF='21417692';
const TOLL='82003859';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';
const FIXED_NORMALS=[BLUE_EYES,DARK_MAGICIAN,CELTIC_GUARDIAN,MYSTICAL_ELF];
const FIXED=[DARK_ELF,TOLL,...FIXED_NORMALS];
for(const id of FIXED)assert.ok(getPlayableCard(id),'M253 card must already be certified and playable: '+id);
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster'&&!FIXED_NORMALS.includes(id));
const FILLERS=NORMALS.slice(0,14);
assert.equal(FILLERS.length,14,'the fixture needs fourteen additional certified Normal Monsters');
const POOL=[...FIXED,...FILLERS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm253-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first=0){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M253 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(tag.tagDecisionMember(state).id,member(first));
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
  throw new Error('M253 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,options={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,
    owner:seat%2,
    faceUp:options.faceUp!==false,
    position:options.position??'atk',
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'M253 response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activateToll(state){
  const source=putInHand(state,0,TOLL);
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid
  );
  assert.ok(action,'Toll must be activatable by the active teammate');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.ok(state.core.players[0].backrow.some(card=>
    card.uid===source.uid&&card.faceUp&&card.resolved
  ),'Toll must remain face-up and resolved in the shared team Spell/Trap Zone');
  return {state,source};
}
function startBattle(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'active physical seat '+seat+' must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,actor,action);
}
function attack(state,seat,attacker,target){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&
    (target===undefined?candidate.target===undefined:candidate.target===target.uid)
  );
  assert.ok(action,'active physical seat '+seat+' must receive the intended shared-field attack');
  const inactivePartner=seat+2;
  assert.deepEqual(tag.tagActions(state,member(inactivePartner)),[],
    'the inactive physical partner cannot submit the shared-field attack');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(inactivePartner),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat attack must not mutate the duel');
  return settle(tag.stepTagDuel(state,actor,action));
}
function endTurn(state,seat){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active teammate must be able to end the current phase');
  return tag.stepTagDuel(state,actor,action);
}
function monster(state,team,uid){
  return state.core.players[team].monsters.find(card=>card.uid===uid);
}
function inGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
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
  assert.equal(cards.length,before.size,'attack costs and battle resolution must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'attack resolution must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++)for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('M253 metadata and format: Dark Elf and Toll retain their exact certified attack-cost rules',()=>{
  assert.equal(getPlayableCard(DARK_ELF)?.englishName,'Dark Elf');
  assert.equal(getPlayableCard(DARK_ELF)?.atk,2000);
  assert.equal(getPlayableCard(TOLL)?.englishName,'Toll');
  assert.deepEqual(getMonsterEffect(DARK_ELF),{
    trigger:'continuous',
    operation:{kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'attackLP',amount:1000}}]}
  });
  assert.deepEqual(getEffect(TOLL),{
    kind:'continuous',
    activation:{speed:1,window:'main',damage:'never'},
    rules:[{kind:'combat',filter:{},rule:{kind:'attackLP',amount:500,playerRule:true}}]
  });
  const state=game('m253-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Dark Elf charges the shared team 1000 LP when the active teammate attacks with the partner-owned monster',()=>{
  let state=game('m253-dark-elf-partner-cost');
  state.core.players[0].lp=2500;
  const before=inventorySnapshot(state);
  const elf=placeMonster(state,2,DARK_ELF);
  const target=placeMonster(state,3,CELTIC_GUARDIAN);
  assert.match(elf.uid,/^m2:/);
  state=startBattle(state,0);
  state=attack(state,0,elf,target);
  assert.equal(state.core.players[0].lp,1500,'the active team pays Dark Elf cost from shared LP');
  assert.equal(state.core.players[1].lp,3400,'2000 ATK versus 1400 ATK inflicts 600 battle damage');
  assert.ok(monster(state,0,elf.uid),'Dark Elf remains on the shared field after its attack');
  assert.ok(inGrave(state,1,target.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Dark Elf cannot declare an attack when its team has exactly 1000 LP',()=>{
  const state=game('m253-dark-elf-exact-cost');
  state.core.players[0].lp=1000;
  const elf=placeMonster(state,2,DARK_ELF);
  placeMonster(state,3,CELTIC_GUARDIAN);
  const battle=startBattle(state,0);
  const actions=tag.tagActions(battle,member(0)).filter(action=>
    action.kind==='attack'&&action.card===elf.uid
  );
  assert.equal(actions.length,0,'the team must have more LP than the 1000 LP attack cost');
  assert.deepEqual(tag.tagActions(battle,member(2)),[]);
  assertRestorable(battle);
});

test('Toll charges each attacking team once per declaration, including partner-owned attackers on both turns',()=>{
  let state=game('m253-toll-both-teams');
  const before=inventorySnapshot(state);
  const team0Attacker=placeMonster(state,2,CELTIC_GUARDIAN);
  const team0Defender=placeMonster(state,0,DARK_MAGICIAN);
  const team1Defender=placeMonster(state,1,DARK_MAGICIAN);
  const team1Attacker=placeMonster(state,3,BLUE_EYES);
  const activated=activateToll(state);
  state=activated.state;
  state=startBattle(state,0);
  state=attack(state,0,team0Attacker,team1Defender);
  assert.equal(state.core.players[0].lp,2400,'team 0 pays 500 Toll plus 1100 battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(monster(state,1,team1Defender.uid));
  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  state=startBattle(state,1);
  state=attack(state,1,team1Attacker,team0Defender);
  assert.equal(state.core.players[0].lp,1900,'team 0 receives 500 further battle damage');
  assert.equal(state.core.players[1].lp,3500,'team 1 pays its own 500 Toll when it declares the partner-owned attack');
  assert.ok(inGrave(state,0,team0Defender.uid));
  assert.ok(monster(state,1,team1Attacker.uid));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===activated.source.uid&&card.faceUp));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Toll prevents the opposing team from attacking when its shared LP equals the 500 LP cost',()=>{
  let state=game('m253-toll-exact-cost');
  const before=inventorySnapshot(state);
  const defender=placeMonster(state,2,CELTIC_GUARDIAN);
  const attacker=placeMonster(state,3,BLUE_EYES);
  state=activateToll(state).state;
  state.core.players[1].lp=500;
  state=endTurn(state,0);
  state=startBattle(state,1);
  const actions=tag.tagActions(state,member(1)).filter(action=>
    action.kind==='attack'&&action.card===attacker.uid
  );
  assert.equal(actions.length,0,'the team must have more than 500 LP to pay Toll');
  assert.ok(monster(state,0,defender.uid));
  assert.deepEqual(tag.tagActions(state,member(3)),[]);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Dark Elf and Toll stack their attack costs; an exact 1500 LP team cannot declare the attack',()=>{
  let state=game('m253-dark-elf-plus-toll-exact');
  state.core.players[0].lp=1500;
  const before=inventorySnapshot(state);
  const elf=placeMonster(state,2,DARK_ELF);
  placeMonster(state,3,CELTIC_GUARDIAN);
  state=activateToll(state).state;
  state=startBattle(state,0);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='attack'&&action.card===elf.uid
  );
  assert.equal(actions.length,0,'Dark Elf 1000 plus Toll 500 must block attack at exact combined cost');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
