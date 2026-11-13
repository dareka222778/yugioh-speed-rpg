'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const MST='05318639';
const OWN_TRAP='53582587';
const OPP_SPELL='14087893';
for(const [id,kind] of [[MST,'spell'],[OWN_TRAP,'trap'],[OPP_SPELL,'spell']]){
  assert.equal(getPlayableCard(id)?.kind,kind,'expected a certified card: '+id);
}
assert.equal(getEffect(MST)?.kind,'mysticalSpaceTyphoon');
assert.equal(getActivationModel(getEffect(MST))?.speed,2);

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm138-seat-'+seat;}
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
  throw new Error('M138 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Mystical Space Typhoon must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the MST response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
for(const target of [{seat:2,id:OWN_TRAP,team:0,otherSeat:3,otherId:OPP_SPELL,otherTeam:1},{seat:3,id:OPP_SPELL,team:1,otherSeat:2,otherId:OWN_TRAP,otherTeam:0}])
test('Mystical Space Typhoon may destroy a '+(target.team===0?'teammate-owned':'opponent-owned')+' shared backrow card',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M138 Seat '+seat,
    cards:deck(seat===0?[MST]:seat===2?[OWN_TRAP]:seat===3?[OPP_SPELL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m138-mst-target-'+target.team});
  const mst=takeCard(state,0,MST);
  holder(state,0).hand.push(mst);
  const ownCard=takeCard(state,2,OWN_TRAP);
  const opponentCard=takeCard(state,3,OPP_SPELL);
  const ownSet={...ownCard,setTurn:0,faceUp:false};
  const opponentSet={...opponentCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(ownSet);
  state.core.players[1].backrow.push(opponentSet);
  state.core.turn=3;
  assert.match(mst.uid,/^m0:/);
  assert.match(ownSet.uid,/^m2:/);
  assert.match(opponentSet.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  for(const card of [ownSet,opponentSet]){
    assert.ok(!JSON.stringify(publicBefore).includes(card.id),'set backrow identity must remain private');
    assert.ok(!JSON.stringify(publicBefore).includes(card.uid),'set backrow UID must remain private');
  }
  const targetCard=target.team===0?ownSet:opponentSet;
  const untouched=target.team===0?opponentSet:ownSet;
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===mst.uid&&candidate.target===targetCard.uid
  );
  assert.ok(action,'active seat 0 must be able to target either shared backrow');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical teammate cannot execute the Main Phase action');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.equal(state.core.phase,'main');
  const destroyedTeam=target.team;
  const otherTeam=target.otherTeam;
  assert.ok(state.core.players[destroyedTeam].grave.some(card=>card.uid===targetCard.uid),
    'the destroyed card goes to its field team Graveyard, retaining physical UID');
  assert.ok(state.core.players[otherTeam].backrow.some(card=>card.uid===untouched.uid&&!card.faceUp),
    'the non-target set card remains on its original shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mst.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
