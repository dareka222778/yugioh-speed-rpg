'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CHANGE_OF_HEART='04031928';
const change=getPlayableCard(CHANGE_OF_HEART);
assert.ok(change&&change.kind==='spell');
assert.equal(getEffect(CHANGE_OF_HEART)?.kind,'changeHeart');
const targetId=tag.tagNormalCardIds[0];
assert.ok(getPlayableCard(targetId)?.kind==='monster');
function member(seat){return 'm91-seat-'+seat;}
function deck(required=[]){
 const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
 assert.ok(ids.length>=7,'fixture deck must have seven unique card identities');
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
 throw new Error('M91 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
 const card=takeCard(state,seat,id);
 const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
 state.core.players[seat%2].monsters.push(monster);
 return monster;
}
function act(state,seat,kind,filter=()=>true){
 const actor=member(seat);
 const action=tag.tagActions(state,actor).find(candidate=>candidate.kind===kind&&filter(candidate));
 assert.ok(action,'missing '+kind+' for '+actor+' in '+state.core.phase);
 return tag.stepTagDuel(state,actor,action);
}
function settleResponses(state){
 for(let guard=0;state.core.phase==='response';guard++){
  assert.ok(guard<20,'the response chain must terminate');
  const actor=tag.tagDecisionMember(state).id;
  const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
  assert.ok(pass);
  state=tag.stepTagDuel(state,actor,pass);
 }
 return state;
}
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

test('Change of Heart temporarily borrows an inactive opponent partner monster and returns it to the original team at End Phase',()=>{
 const players=[
  {id:member(0),name:'M91 Seat 0',cards:deck([CHANGE_OF_HEART])},
  {id:member(1),name:'M91 Seat 1',cards:deck()},
  {id:member(2),name:'M91 Seat 2',cards:deck()},
  {id:member(3),name:'M91 Seat 3',cards:deck([targetId])]
 ];
 let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m91-change-heart-physical-owner'});
 const before=inventorySnapshot(state);
 const spell=takeCard(state,0,CHANGE_OF_HEART);
 state.core.players[0].hand.push(spell);
 const target=deploy(state,3,targetId);
 state.core.turn=3;
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assert.match(spell.uid,/^m0:/);
 assert.match(target.uid,/^m3:/);
 assert.equal(tag.tagDecisionMember(state).id,member(0));

 state=settleResponses(act(state,0,'spell',action=>action.card===spell.uid&&action.target===target.uid));
 const borrowed=state.core.players[0].monsters.find(card=>card.uid===target.uid);
 assert.ok(borrowed,'the selected monster must move to the acting team field');
 assert.equal(borrowed.owner,1,'physical/team owner metadata must remain with the original team');
 assert.equal(borrowed.returnTo,1,'temporary control must remember the original team');
 assert.equal(borrowed.returnTurn,3);
 assert.ok(!state.core.players[1].monsters.some(card=>card.uid===target.uid));
 assert.doesNotThrow(()=>tag.assertTagDuel(state));

 state=settleResponses(act(state,0,'end'));
 const returned=state.core.players[1].monsters.find(card=>card.uid===target.uid);
 assert.ok(returned,'the monster must return to the original shared team field at End Phase');
 assert.equal(returned.owner,1);
 assert.equal(returned.returnTo,undefined);
 assert.equal(returned.returnTurn,undefined);
 assert.ok(!state.core.players[0].monsters.some(card=>card.uid===target.uid));
 assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),'Change of Heart must enter its activator shared Graveyard');
 assert.equal(tag.tagDecisionMember(state).id,member(1),'turn rotation must pass to the next physical representative');
 assert.equal(state.core.players[0].lp,4000);
 assert.equal(state.core.players[1].lp,4000);
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assertConserved(state,before);
});
