'use strict';
const {test:nodeTest}=require('node:test');
const fs=require('node:fs');
function recordFailure(label,error){fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/engine-acceptance-failure.tap','\\n[M232] '+label+'\\n'+(error?.stack||String(error))+'\\n');}
function test(name,fn){nodeTest(name,async t=>{try{return await fn(t);}catch(error){recordFailure(name,error);throw error;}});}
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,isQuickPlaySpell}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');
const {turnMonsterFaceDown}=require('../dist/classicEffects');

try{

const MIRAGE_DRAGON='15960641';
const PITCH_BLACK_WARWOLF='88975532';
const INVADER_OF_DARKNESS='56647086';
const SAKURETSU_ARMOR='56120475';
const WABOKU='12607053';
const TRAP_HOLE='04206964';
const MYSTICAL_SPACE_TYPHOON='05318639';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the four-seat fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
const controlTarget=normal.find(entry=>entry.card.atk>=1000);
assert.ok(controlTarget,'Trap Hole controls need a Normal Monster with at least 1000 ATK');

const SOURCES=[
  {id:MIRAGE_DRAGON,name:'Mirage Dragon',cardKind:'trap',window:'battle'},
  {id:PITCH_BLACK_WARWOLF,name:'Pitch-Black Warwolf',cardKind:'trap',window:'battle'},
  {id:INVADER_OF_DARKNESS,name:'Invader of Darkness',cardKind:'quickplay',window:'all'}
];
for(const source of SOURCES){
  const card=getPlayableCard(source.id);
  const effect=getMonsterEffect(source.id);
  assert.ok(card&&card.kind==='monster',source.name+' must be a certified playable Monster');
  assert.equal(effect?.trigger,'continuous',source.name+' must expose a continuous activation restriction');
  assert.equal(effect?.operation.kind,'continuous',source.name+' must use the declarative continuous resolver');
  assert.ok(effect?.operation.kind==='continuous'&&effect.operation.rules.some(rule=>
    rule.kind==='preventActivation'&&rule.cardKind===source.cardKind&&rule.controller==='opponent'&&rule.window===source.window
  ),source.name+' must preserve its exact opponent-only activation window');
  assert.equal(getMonsterDefinition(source.id)?.activation?.window,'continuous');
}
for(const [id,name,kind] of [
  [SAKURETSU_ARMOR,'Sakuretsu Armor','trap'],
  [WABOKU,'Waboku','trap'],
  [TRAP_HOLE,'Trap Hole','trap'],
  [MYSTICAL_SPACE_TYPHOON,'Mystical Space Typhoon','spell']
]){
  assert.equal(getPlayableCard(id)?.kind,kind,name+' must be enabled');
  assert.ok(getEffect(id),name+' must have an executable effect');
}
assert.equal(getActivationModel(getEffect(SAKURETSU_ARMOR))?.window,'attackDeclared');
assert.equal(getActivationModel(getEffect(TRAP_HOLE))?.window,'summoned');
assert.ok(isQuickPlaySpell(MYSTICAL_SPACE_TYPHOON),'Mystical Space Typhoon must be a Quick-Play Spell');

function member(seat){return 'm232-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8,'each physical Deck must contain the fixture cards');
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function players(requiredBySeat={}){
  return [0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M232 Seat '+seat,
    cards:deck(requiredBySeat[seat]??[])
  }));
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
  throw new Error('M232 fixture card missing from physical seat '+seat+': '+id);
}
function putInHand(state,seat,id){
  const card=takeCard(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function setBackrow(state,seat,id){
  const card=takeCard(state,seat,id);
  const setCard={...card,setTurn:0,faceUp:false};
  state.core.players[seat%2].backrow.push(setCard);
  return setCard;
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all 80 physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'activation restrictions must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'activation restrictions must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function summon(state,seat,card){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===card.uid&&candidate.position==='atk'&&!(candidate.tributes?.length)
  );
  assert.ok(action,'the active physical seat must be able to Normal Summon its own card');
  return tag.stepTagDuel(state,member(seat),action);
}
function startBattle(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='battle');
  assert.ok(action,'the active physical seat must be able to enter the Battle Phase');
  return tag.stepTagDuel(state,member(seat),action);
}
function attack(state,seat,attacker,target){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='attack'&&candidate.card===attacker.uid&&candidate.target===target.uid
  );
  assert.ok(action,'the active teammate must be able to attack on the shared field');
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='pass');
    assert.ok(action,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,action);
  }
  return state;
}
function makeBattleAttackCase(source,seed){
  const state=tag.createTagDuel(players({
    0:[normalIds[0],TRAP_HOLE],
    1:[normalIds[1],SAKURETSU_ARMOR],
    2:[source.id],
    3:[SAKURETSU_ARMOR,MYSTICAL_SPACE_TYPHOON]
  }),{classic:true,first:0,seed});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,source.id);
  const attacker=deploy(state,0,normalIds[0]);
  const target=deploy(state,1,normalIds[1]);
  const activeTrap=setBackrow(state,1,SAKURETSU_ARMOR);
  const inactiveTrap=setBackrow(state,3,SAKURETSU_ARMOR);
  const opponentQuickPlay=setBackrow(state,3,MYSTICAL_SPACE_TYPHOON);
  const alliedTarget=setBackrow(state,0,TRAP_HOLE);
  assert.match(sourceMonster.uid,/^m2:/,'the continuous source must retain inactive teammate seat 2 ownership');
  assert.match(attacker.uid,/^m0:/,'the attacker must retain active teammate seat 0 ownership');
  assert.match(target.uid,/^m1:/,'the opposing target must retain active seat 1 ownership');
  assert.match(activeTrap.uid,/^m1:/,'the first opposing Trap must retain active seat 1 ownership');
  assert.match(inactiveTrap.uid,/^m3:/,'the second opposing Trap must retain inactive seat 3 ownership');
  assert.match(opponentQuickPlay.uid,/^m3:/,'the Quick-Play control must retain inactive seat 3 ownership');
  assert.match(alliedTarget.uid,/^m0:/,'the Quick-Play target must retain allied seat 0 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,sourceMonster,attacker,target,activeTrap,inactiveTrap,opponentQuickPlay};
}
function makeOwnBattleCase(source,seed){
  const state=tag.createTagDuel(players({
    0:[normalIds[0]],1:[WABOKU],2:[source.id,normalIds[1]],3:[WABOKU]
  }),{classic:true,first:3,seed});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,source.id);
  const alliedTarget=deploy(state,0,normalIds[0],'def');
  const attacker=deploy(state,3,normalIds[1]);
  const inactiveWaboku=setBackrow(state,1,WABOKU);
  const activeWaboku=setBackrow(state,3,WABOKU);
  assert.match(sourceMonster.uid,/^m2:/);
  assert.match(inactiveWaboku.uid,/^m1:/);
  assert.match(activeWaboku.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,sourceMonster,alliedTarget,attacker,inactiveWaboku,activeWaboku};
}
function makeOutsideBattleCase(source,seed){
  const state=tag.createTagDuel(players({
    0:[controlTarget.id],1:[],2:[source.id],3:[TRAP_HOLE]
  }),{classic:true,first:0,seed});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,source.id);
  const opponentTrap=setBackrow(state,3,TRAP_HOLE);
  const opposingSummon=putInHand(state,0,controlTarget.id);
  assert.match(sourceMonster.uid,/^m2:/);
  assert.match(opponentTrap.uid,/^m3:/,'the Trap must retain inactive opposing seat 3 ownership');
  assert.match(opposingSummon.uid,/^m0:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,sourceMonster,opponentTrap,opposingSummon};
}

for(const source of [SOURCES[0],SOURCES[1]]){
  test(source.name+': blocks opponent Sakuretsu Armor during the source team Battle Phase across both physical seats',()=>{
    const {state:initial,sourceMonster,attacker,target,activeTrap,inactiveTrap,opponentQuickPlay}=makeBattleAttackCase(
      source,'m232-battle-attack-'+source.id
    );
    const before=inventorySnapshot(initial);
    const publicBefore=tag.publicTagDuel(initial);
    for(const card of [activeTrap,inactiveTrap,opponentQuickPlay]){
      assert.ok(!JSON.stringify(publicBefore).includes(card.id),'Set card identity must remain hidden');
      assert.ok(!JSON.stringify(publicBefore).includes(card.uid),'Set card UID must remain hidden');
    }

    let state=startBattle(initial,0);
    state=attack(state,0,attacker,target);
    assert.equal(state.core.phase,'response','the set Quick-Play Spell must keep the attack response window open');
    assert.equal(tag.tagDecisionMember(state).id,member(1),
      'the active opposing teammate receives attack-response priority');
    const actions=tag.tagActions(state,member(1));
    assert.ok(actions.some(action=>action.kind==='spell'&&action.card===opponentQuickPlay.uid),
      'the Battle Phase restriction must not block Quick-Play Spells');
    for(const trap of [activeTrap,inactiveTrap]){
      assert.ok(!actions.some(action=>action.kind==='trap'&&action.card===trap.uid),
        'the opponent cannot activate either physical copy of Sakuretsu Armor during this Battle Phase');
    }
    assert.deepEqual(tag.tagActions(state,member(3)),[],
      'the inactive physical owner cannot submit the blocked Trap');
    state=settle(state);
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===sourceMonster.uid&&card.faceUp),
      'the partner-owned continuous source remains face-up');
    assert.ok(state.core.players[1].backrow.some(card=>card.uid===activeTrap.uid&&!card.faceUp));
    assert.ok(state.core.players[1].backrow.some(card=>card.uid===inactiveTrap.uid&&!card.faceUp));
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });

  test(source.name+': blocks Waboku during the opponent own Battle Phase only while the source is face-up',()=>{
    const {state:initial,sourceMonster,inactiveWaboku,activeWaboku}=makeOwnBattleCase(
      source,'m232-own-battle-'+source.id
    );
    const before=inventorySnapshot(initial);
    let state=startBattle(initial,3);
    const blocked=tag.tagActions(state,member(3));
    assert.ok(!blocked.some(action=>action.kind==='trap'&&[inactiveWaboku.uid,activeWaboku.uid].includes(action.card)),
      'the opponent cannot activate Waboku during its own Battle Phase either');
    assert.deepEqual(tag.tagActions(state,member(1)),[],
      'the inactive physical Waboku owner cannot submit an action');

    const currentSource=state.core.players[0].monsters.find(card=>card.uid===sourceMonster.uid);
    assert.ok(currentSource?.faceUp);
    turnMonsterFaceDown(currentSource);
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    const restored=tag.tagActions(state,member(3));
    assert.ok(restored.some(action=>action.kind==='trap'&&action.card===inactiveWaboku.uid),
      'turning the partner-owned source face-down restores the inactive partner Trap');
    assert.ok(restored.some(action=>action.kind==='trap'&&action.card===activeWaboku.uid),
      'turning the source face-down restores the active member Trap too');
    assertConserved(state,before);
  });

  test(source.name+': allows opponent Trap Hole outside the Battle Phase',()=>{
    const {state:initial,sourceMonster,opponentTrap,opposingSummon}=makeOutsideBattleCase(
      source,'m232-main-phase-control-'+source.id
    );
    const before=inventorySnapshot(initial);
    let state=summon(initial,0,opposingSummon);
    assert.equal(state.core.phase,'response');
    assert.equal(tag.tagDecisionMember(state).id,member(1));
    const activation=tag.tagActions(state,member(1)).find(action=>
      action.kind==='trap'&&action.card===opponentTrap.uid&&action.target===opposingSummon.uid
    );
    assert.ok(activation,'the Battle Phase-only lock must not suppress Trap Hole in the Main Phase');
    assert.deepEqual(tag.tagActions(state,member(3)),[],
      'the inactive physical owner cannot activate the partner Trap');
    state=tag.stepTagDuel(state,member(1),activation);
    state=settle(state);
    assert.ok(state.core.players[0].grave.some(card=>card.uid===opposingSummon.uid));
    assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentTrap.uid));
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===sourceMonster.uid&&card.faceUp));
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}

test('Invader of Darkness: blocks an opposing partner-owned Quick-Play Spell but still permits Trap Hole',()=>{
  const state=tag.createTagDuel(players({
    0:[controlTarget.id,TRAP_HOLE],
    1:[TRAP_HOLE],
    2:[INVADER_OF_DARKNESS],
    3:[MYSTICAL_SPACE_TYPHOON]
  }),{classic:true,first:0,seed:'m232-invader-opponent-quickplay'});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,INVADER_OF_DARKNESS);
  const alliedTarget=setBackrow(state,0,TRAP_HOLE);
  const opponentTrap=setBackrow(state,1,TRAP_HOLE);
  const opponentQuickPlay=setBackrow(state,3,MYSTICAL_SPACE_TYPHOON);
  const opposingSummon=putInHand(state,0,controlTarget.id);
  const before=inventorySnapshot(state);
  assert.match(sourceMonster.uid,/^m2:/);
  assert.match(opponentQuickPlay.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  let current=summon(state,0,opposingSummon);
  assert.equal(current.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current).id,member(1));
  const actions=tag.tagActions(current,member(1));
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===opponentQuickPlay.uid),
    'the opponent cannot activate a Quick-Play Spell from its inactive physical partner');
  const trapActivation=actions.find(action=>
    action.kind==='trap'&&action.card===opponentTrap.uid&&action.target===opposingSummon.uid
  );
  assert.ok(trapActivation,'Invader of Darkness must not suppress ordinary Trap Cards');
  assert.deepEqual(tag.tagActions(current,member(3)),[]);
  current=tag.stepTagDuel(current,member(1),trapActivation);
  current=settle(current);
  assert.ok(current.core.players[0].grave.some(card=>card.uid===opposingSummon.uid));
  assert.ok(current.core.players[1].grave.some(card=>card.uid===opponentTrap.uid));
  assert.ok(current.core.players[1].backrow.some(card=>card.uid===opponentQuickPlay.uid&&!card.faceUp));
  assert.ok(current.core.players[0].backrow.some(card=>card.uid===alliedTarget.uid&&!card.faceUp));
  assert.ok(current.core.players[0].monsters.some(card=>card.uid===sourceMonster.uid&&card.faceUp));
  assert.doesNotThrow(()=>tag.assertTagDuel(current));
  assertConserved(current,before);
});

test('Invader of Darkness: does not block a partner-owned Quick-Play Spell controlled by its own team',()=>{
  const state=tag.createTagDuel(players({
    0:[],
    1:[TRAP_HOLE],
    2:[INVADER_OF_DARKNESS,MYSTICAL_SPACE_TYPHOON],
    3:[controlTarget.id]
  }),{classic:true,first:3,seed:'m232-invader-own-quickplay'});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,INVADER_OF_DARKNESS);
  const alliedQuickPlay=setBackrow(state,2,MYSTICAL_SPACE_TYPHOON);
  const opposingTrap=setBackrow(state,1,TRAP_HOLE);
  const opposingSummon=putInHand(state,3,controlTarget.id);
  const before=inventorySnapshot(state);
  assert.match(sourceMonster.uid,/^m2:/);
  assert.match(alliedQuickPlay.uid,/^m2:/);
  assert.match(opposingSummon.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  let current=summon(state,3,opposingSummon);
  assert.equal(current.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current).id,member(0));
  const activation=tag.tagActions(current,member(0)).find(action=>
    action.kind==='spell'&&action.card===alliedQuickPlay.uid&&action.target===opposingTrap.uid
  );
  assert.ok(activation,
    'the active teammate can activate the inactive source owner's Quick-Play Spell');
  assert.deepEqual(tag.tagActions(current,member(2)),[],
    'the inactive physical Quick-Play owner cannot submit the action');
  current=tag.stepTagDuel(current,member(0),activation);
  current=settle(current);
  assert.ok(current.core.players[1].grave.some(card=>card.uid===opposingTrap.uid));
  assert.ok(current.core.players[0].grave.some(card=>card.uid===alliedQuickPlay.uid));
  assert.ok(current.core.players[0].monsters.some(card=>card.uid===sourceMonster.uid&&card.faceUp));
  assert.doesNotThrow(()=>tag.assertTagDuel(current));
  assertConserved(current,before);
});
}catch(error){recordFailure('module initialization',error);throw error;}
