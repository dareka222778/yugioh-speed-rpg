'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterDefinition,getMonsterEffect}=require('../dist/monsterEffects');

const SOURCES=[
  {id:'53693416',name:'Eagle Eye'},
  {id:'52571838',name:'Creeping Doom Manta'},
  {id:'26082229',name:'Invasion of Flames'},
  {id:'89698120',name:'Tactical Espionage Expert'}
];
const TRAP_HOLE='04206964';
const TORRENTIAL_TRIBUTE='53582587';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the four-seat fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
const controlTarget=normal.find(entry=>entry.card.atk>=1000);
assert.ok(controlTarget,'Trap Hole control needs a Normal Monster with at least 1000 ATK');

for(const source of SOURCES){
  const card=getPlayableCard(source.id);
  const effect=getMonsterEffect(source.id);
  assert.ok(card&&card.kind==='monster',source.name+' must be a certified playable Monster');
  assert.equal(effect?.trigger,'continuous',source.name+' must expose its continuous summon restriction');
  assert.equal(effect?.operation.kind,'continuous',source.name+' must use the declarative continuous resolver');
  assert.ok(effect?.operation.kind==='continuous'&&effect.operation.rules.some(rule=>
    rule.kind==='preventActivation'&&rule.cardKind==='trap'&&rule.controller==='both'&&rule.window==='ownNormalSummon'
  ),source.name+' must block Trap activation only in response to its own Normal Summon');
  assert.equal(getMonsterDefinition(source.id)?.activation.window,'continuous');
}
assert.ok(getPlayableCard(TRAP_HOLE)?.kind==='trap','Trap Hole must be enabled');
assert.ok(getPlayableCard(TORRENTIAL_TRIBUTE)?.kind==='trap','Torrential Tribute must be enabled');

function member(seat){return 'm231-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8,'each physical Deck must contain the fixture cards');
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function players(requiredBySeat={}){
  return [0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M231 Seat '+seat,
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
  throw new Error('M231 fixture card missing from physical seat '+seat+': '+id);
}
function putInHand(state,seat,id){
  const card=takeCard(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function setTrap(state,seat,id){
  const card=takeCard(state,seat,id);
  const trap={...card,setTurn:0,faceUp:false};
  state.core.players[seat%2].backrow.push(trap);
  return trap;
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
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
  assert.equal(cards.length,before.size,'summon restriction must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'summon restriction must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function summon(state,seat,card){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===card.uid&&candidate.position==='atk'&&!(candidate.tributes?.length)
  );
  assert.ok(action,'the active physical seat must be able to Normal Summon its own card');
  return tag.stepTagDuel(state,member(seat),action);
}
function pass(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='pass');
  assert.ok(action,'the active responder must receive a legal pass');
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    state=pass(state,tag.tagDecisionMember(state).id==='m231-seat-0'?0:
      tag.tagDecisionMember(state).id==='m231-seat-1'?1:
      tag.tagDecisionMember(state).id==='m231-seat-2'?2:3);
  }
  return state;
}
function makeBlockedCase(source,seed){
  const state=tag.createTagDuel(players({
    0:[TRAP_HOLE],1:[TRAP_HOLE],2:[source.id],3:[TORRENTIAL_TRIBUTE]
  }),{classic:true,first:2,seed});
  state.core.turn=3;
  const sourceCard=putInHand(state,2,source.id);
  const opponentInactiveTrap=setTrap(state,1,TRAP_HOLE);
  const opponentActiveTrap=setTrap(state,3,TORRENTIAL_TRIBUTE);
  const teammateTrap=setTrap(state,0,TRAP_HOLE);
  assert.match(sourceCard.uid,/^m2:/,'the source must retain active physical seat 2 ownership');
  assert.match(opponentInactiveTrap.uid,/^m1:/,'the first opposing Trap must retain inactive seat 1 ownership');
  assert.match(opponentActiveTrap.uid,/^m3:/,'the second opposing Trap must retain active seat 3 ownership');
  assert.match(teammateTrap.uid,/^m0:/,'the allied Trap must retain inactive teammate seat 0 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,sourceCard,opponentInactiveTrap,opponentActiveTrap,teammateTrap};
}
function makeNarrowCase(source,seed){
  const state=tag.createTagDuel(players({
    0:[],1:[],2:[source.id,TRAP_HOLE],3:[controlTarget.id]
  }),{classic:true,first:3,seed});
  state.core.turn=3;
  const sourceMonster=deploy(state,2,source.id);
  const teammateTrap=setTrap(state,2,TRAP_HOLE);
  const opposingSummon=putInHand(state,3,controlTarget.id);
  assert.match(sourceMonster.uid,/^m2:/,'the face-up source must retain inactive teammate seat 2 ownership');
  assert.match(teammateTrap.uid,/^m2:/,'the allied Trap must retain inactive teammate seat 2 ownership');
  assert.match(opposingSummon.uid,/^m3:/,'the opposing summon must retain active physical seat 3 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,sourceMonster,teammateTrap,opposingSummon};
}

for(const source of SOURCES){
  test(source.name+': blocks Trap responses to its own Normal Summon across both opposing physical seats and its own team',()=>{
    const {state:initial,sourceCard,opponentInactiveTrap,opponentActiveTrap,teammateTrap}=makeBlockedCase(
      source,'m231-own-summon-'+source.id
    );
    const before=inventorySnapshot(initial);
    assert.equal(tag.tagDecisionMember(initial).id,member(2),'seat 2 must be the active summoning teammate');
    const publicBefore=tag.publicTagDuel(initial);
    for(const trap of [opponentInactiveTrap,opponentActiveTrap,teammateTrap]){
      assert.ok(!JSON.stringify(publicBefore).includes(trap.id),'Set Trap identity must remain hidden');
      assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),'Set Trap physical UID must remain hidden');
    }

    let state=summon(initial,2,sourceCard);
    assert.equal(state.core.phase,'response','a Normal Summon must open its response window');
    assert.equal(tag.tagDecisionMember(state).id,member(3),
      'the active opposing teammate receives the first response priority');
    const opposingActions=tag.tagActions(state,member(3));
    assert.ok(opposingActions.some(action=>action.kind==='pass'));
    for(const trap of [opponentInactiveTrap,opponentActiveTrap]){
      assert.ok(!opposingActions.some(action=>action.kind==='trap'&&action.card===trap.uid),
        'neither opposing physical seat may activate a Trap in response to this summon');
    }
    assert.deepEqual(tag.tagActions(state,member(1)),[],
      'the inactive opposing physical owner cannot submit an action');

    state=pass(state,3);
    assert.equal(tag.tagDecisionMember(state).id,member(2),
      'response priority must rotate to the active summoning teammate');
    const alliedActions=tag.tagActions(state,member(2));
    assert.ok(alliedActions.some(action=>action.kind==='pass'));
    assert.ok(!alliedActions.some(action=>action.kind==='trap'&&action.card===teammateTrap.uid),
      'the restriction also prevents the summoning team from activating its own Trap');
    assert.deepEqual(tag.tagActions(state,member(0)),[],
      'the inactive allied physical owner cannot submit an action');

    state=pass(state,2);
    assert.equal(state.core.phase,'main','both teams passing must finish the summon response window');
    assert.ok(state.core.players[0].monsters.some(monster=>monster.uid===sourceCard.uid&&monster.faceUp),
      'the source must remain face-up after the protected summon');
    assert.ok(state.core.players[1].backrow.some(card=>card.uid===opponentInactiveTrap.uid&&!card.faceUp));
    assert.ok(state.core.players[1].backrow.some(card=>card.uid===opponentActiveTrap.uid&&!card.faceUp));
    assert.ok(state.core.players[0].backrow.some(card=>card.uid===teammateTrap.uid&&!card.faceUp));
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });

  test(source.name+': does not globally lock a partner-owned Trap against a different monster summon',()=>{
    const {state:initial,sourceMonster,teammateTrap,opposingSummon}=makeNarrowCase(
      source,'m231-narrow-window-'+source.id
    );
    const before=inventorySnapshot(initial);
    assert.equal(tag.tagDecisionMember(initial).id,member(3),'seat 3 must be the active opposing summoner');
    const publicBefore=tag.publicTagDuel(initial);
    assert.ok(!JSON.stringify(publicBefore).includes(teammateTrap.id),'the partner-owned Set Trap identity must remain hidden');
    assert.ok(!JSON.stringify(publicBefore).includes(teammateTrap.uid),'the partner-owned Set Trap UID must remain hidden');

    let state=summon(initial,3,opposingSummon);
    assert.equal(state.core.phase,'response');
    assert.equal(tag.tagDecisionMember(state).id,member(0),
      'the active teammate of the defending team receives response priority');
    const activation=tag.tagActions(state,member(0)).find(action=>
      action.kind==='trap'&&action.card===teammateTrap.uid&&action.target===opposingSummon.uid
    );
    assert.ok(activation,
      'a face-up M34 source must not suppress Trap activation for a different monster summon');
    assert.deepEqual(tag.tagActions(state,member(2)),[],
      'the inactive physical Trap owner cannot activate on behalf of the active teammate');

    state=tag.stepTagDuel(state,member(0),activation);
    state=settle(state);
    assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingSummon.uid),
      'the normally legal Trap Hole must destroy the different opposing summon');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===teammateTrap.uid),
      'the partner-owned Trap must resolve to the shared allied Graveyard');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===sourceMonster.uid&&card.faceUp),
      'the M34 source remains face-up while the unrelated summon is answered');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assertConserved(state,before);
  });
}
