'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  createTagDuel,
  tagNormalCardIds,
  tagInventory,
  tagDecisionMember,
  tagActions,
  stepTagDuel,
  assertTagDuel
}=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');

const normalIds=[];
const names=new Set();
for(const id of tagNormalCardIds){
  const card=getPlayableCard(id),name=card?.englishName??card?.name;
  if(card&&name&&!names.has(name)){names.add(name);normalIds.push(id);}
  if(normalIds.length===7)break;
}
assert.ok(normalIds.length>=7,'the seat-authorization fixture needs seven distinct certified Normal Monsters');
function deck(){return Array.from({length:20},(_,index)=>normalIds[index%normalIds.length]);}
function createGame(){
  const players=[0,1,2,3].map(seat=>({id:'m74-seat-'+seat,name:'M74 Seat '+seat,cards:deck()}));
  return createTagDuel(players,{classic:true,first:0,seed:'m74-tag-seat-authorization'});
}
function inventorySnapshot(state){
  const cards=tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,80);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'seat authorization changed card '+card.uid);
}

test('only the active physical seat can submit a classic 2v2 action through all four rotations',()=>{
  let state=createGame();
  const before=inventorySnapshot(state);
  const expectedOrder=[0,1,2,3,0];

  for(let turn=0;turn<4;turn++){
    const activeSeat=expectedOrder[turn];
    const actor='m74-seat-'+activeSeat;
    assert.equal(state.cursor,activeSeat);
    assert.equal(tagDecisionMember(state).id,actor);
    assert.equal(state.active[activeSeat%2],activeSeat);

    const endAction=tagActions(state,actor).find(action=>action.kind==='end');
    assert.ok(endAction,'the active seat must receive the legal End Phase action');
    const unchanged=JSON.stringify(state);

    for(let other=0;other<4;other++){
      if(other===activeSeat)continue;
      const inactive='m74-seat-'+other;
      assert.deepEqual(tagActions(state,inactive),[],'inactive physical seat '+other+' must receive no actions');
      assert.throws(
        ()=>stepTagDuel(state,inactive,endAction),
        /Aguarde a vez do participante ativo\./,
        'inactive physical seat '+other+' must not submit the active seat action'
      );
      assert.equal(JSON.stringify(state),unchanged,'rejected action must not mutate the saved duel');
    }

    assert.deepEqual(tagActions(state,'m74-stranger'),[]);
    assert.throws(()=>stepTagDuel(state,'m74-stranger',endAction),/Aguarde a vez do participante ativo\./);
    state=stepTagDuel(state,actor,endAction);
    assert.equal(tagDecisionMember(state).id,'m74-seat-'+expectedOrder[turn+1]);
    assert.equal(state.cursor,expectedOrder[turn+1]);
    assert.doesNotThrow(()=>assertTagDuel(state));
    assertConserved(state,before);
  }
});
