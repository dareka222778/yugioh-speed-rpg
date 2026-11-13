'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const TROOP='55013285';
const troop=getPlayableCard(TROOP);
assert.ok(troop&&troop.kind==='monster');
assert.equal(getMonsterEffect(TROOP)?.trigger,'onBattleDestroyed');
assert.deepEqual(getMonsterEffect(TROOP)?.operation,{kind:'recruit',filter:{name:'Troop Dragon'},positions:['atk','def']});
const normal=tag.tagNormalCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&Number.isInteger(card.atk));
const attackerDef=normal.filter(card=>card.atk>(troop.atk??0)).sort((a,b)=>b.atk-a.atk)[0];
assert.ok(attackerDef,'Troop Dragon recursion fixture needs a stronger Normal Monster');

function member(seat){return 'm97-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function troopDeck(){
  const ids=[TROOP,...tag.tagNormalCardIds].slice(0,7);
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
  throw new Error('M97 fixture card missing from physical seat '+seat+': '+id);
}
function ensureCopiesInDeck(state,seat,id,minimum){
  const physical=holder(state,seat);
  for(const card of physical.hand.filter(card=>card.id===id))physical.deck.push(card);
  physical.hand=physical.hand.filter(card=>card.id!==id);
  const copies=physical.deck.filter(card=>card.id===id);
  assert.ok(copies.length>=minimum,'physical Deck '+seat+' needs '+minimum+' copies of '+id);
  return copies;
}
function deploy(state,seat,id,position){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'response chain did not terminate');
    const actor=tag.tagDecisionMember(state).id;
    state=act(state,Number(actor.split('-').at(-1)),'pass');
  }
  return state;
}
function startBattle(state){return settle(act(state,0,'battle'));}
function attack(state,source,target){return settle(act(state,0,'attack',a=>a.card===source&&a.target===target));}
function choose(state,seat,target){return settle(act(state,seat,'choose',a=>a.target===target));}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

test('mandatory Troop Dragon trigger chains twice from the active representative physical Deck',()=>{
  const players=[
    {id:member(0),name:'M97 Seat 0',cards:deck([attackerDef.id])},
    {id:member(1),name:'M97 Seat 1',cards:troopDeck()},
    {id:member(2),name:'M97 Seat 2',cards:deck()},
    {id:member(3),name:'M97 Seat 3',cards:troopDeck()}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m97-troop-dragon-recursion'});
  const attackerOne=deploy(state,0,attackerDef.id,'atk');
  const attackerTwo=deploy(state,0,attackerDef.id,'atk');
  const source=deploy(state,3,TROOP,'atk');
  const activeCopies=ensureCopiesInDeck(state,1,TROOP,2);
  const inactiveCopies=ensureCopiesInDeck(state,3,TROOP,1);
  state.core.turn=3;
  const before=inventorySnapshot(state);
  assert.match(source.uid,/^m3:/);
  assert.match(activeCopies[0].uid,/^m1:/);
  assert.match(inactiveCopies[0].uid,/^m3:/);
  assert.ok(engine.atk(attackerOne,state.core)>troop.atk);
  tag.assertTagDuel(state);

  state=startBattle(state);
  state=attack(state,attackerOne.uid,source.uid);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===source.uid));
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit','mandatory trigger must recruit without an optional activation prompt');
  assert.equal(state.core.choice.actor,1);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  let choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCopies[0].uid));
  assert.ok(choices.some(action=>action.target===activeCopies[1].uid));
  assert.ok(!choices.some(action=>inactiveCopies.some(card=>card.uid===action.target)));
  state=choose(state,1,activeCopies[0].uid);
  assert.equal(state.core.choice.source,'monsterRecruitPosition');
  state=choose(state,1,'__recruit_atk__');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===activeCopies[0].uid));

  state=attack(state,attackerTwo.uid,activeCopies[0].uid);
  assert.ok(state.core.players[1].grave.some(card=>card.uid===activeCopies[0].uid));
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit');
  assert.equal(state.core.choice.actor,1);
  choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCopies[1].uid),'the second mandatory trigger must recruit the next active Deck copy');
  assert.ok(!choices.some(action=>inactiveCopies.some(card=>card.uid===action.target)));
  state=choose(state,1,activeCopies[1].uid);
  assert.equal(state.core.choice.source,'monsterRecruitPosition');
  state=choose(state,1,'__recruit_def__');

  assert.ok(state.core.players[1].monsters.some(card=>card.uid===activeCopies[1].uid&&card.position==='def'));
  assert.ok(state.reserves[3].deck.some(card=>inactiveCopies.some(inactive=>inactive.uid===card.uid)));
  assert.equal(state.core.players[1].lp,4000-2*(engine.atk(attackerOne,state.core)-troop.atk));
  assert.equal(state.core.players[0].lp,4000);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
