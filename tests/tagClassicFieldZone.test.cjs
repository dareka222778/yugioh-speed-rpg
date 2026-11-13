const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getEffect,getPlayableCard}=require('../dist/effectRegistry');

const fieldCards=['86318356','59197169','50913601']; // Sogen, Yami, Mountain
for(const id of fieldCards){
  assert.equal(getPlayableCard(id)?.field,true,'field spell must be certified: '+id);
  assert.equal(getEffect(id)?.kind,'field','field spell effect must be executable: '+id);
}

const normalNames=[];
const seenNames=new Set();
for(const id of tag.tagNormalCardIds){
  const card=getPlayableCard(id);
  const name=card?.englishName??card?.name;
  if(card&&name&&!seenNames.has(name)){
    seenNames.add(name);
    normalNames.push(id);
  }
  if(normalNames.length===7)break;
}
assert.ok(normalNames.length>=7,'need seven distinct certified Normal Monsters to build 20-card decks');

function normalDeck(count){
  return Array.from({length:count},(_,i)=>normalNames[Math.floor(i/3)]);
}
function players(){
  return [0,1,2,3].map(seat=>{
    const field=seat===0?fieldCards[0]:seat===1?fieldCards[1]:seat===2?fieldCards[2]:null;
    return {
      id:'field-seat-'+seat,
      name:'Field Seat '+seat,
      cards:field?[field,...normalDeck(19)]:normalDeck(20)
    };
  });
}
function game(){
  return tag.createTagDuel(players(),{classic:true,seed:'m67-classic-team-field-zone'});
}
function member(seat){return 'field-seat-'+seat;}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function moveFieldToHand(state,seat,id){
  const owner=holder(state,seat);
  let card=owner.hand.find(c=>c.id===id);
  if(!card){
    const index=owner.deck.findIndex(c=>c.id===id);
    assert.notEqual(index,-1,'field card must remain in the physical seat deck or hand');
    card=owner.deck.splice(index,1)[0];
    owner.hand.push(card);
  }
  return card.uid;
}
function passResponse(state){
  let passes=0;
  while(state.core.phase==='response'&&passes<4){
    const acting=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,acting).find(action=>action.kind==='pass');
    assert.ok(pass,'the current response priority must have a legal pass');
    state=tag.stepTagDuel(state,acting,pass);
    passes++;
  }
  assert.notEqual(state.core.phase,'response','field response window must close');
  return state;
}
function activateField(state,seat,uid){
  const action=tag.tagActions(state,member(seat)).find(item=>item.kind==='field'&&item.card===uid);
  assert.ok(action,'active teammate must be able to activate their field spell');
  state=tag.stepTagDuel(state,member(seat),action);
  state=passResponse(state);
  assert.equal(state.core.phase,'main');
  return state;
}
function setField(state,seat,uid){
  const action=tag.tagActions(state,member(seat)).find(item=>item.kind==='setField'&&item.card===uid);
  assert.ok(action,'active teammate must be able to set their field spell');
  state=tag.stepTagDuel(state,member(seat),action);
  state=passResponse(state);
  assert.equal(state.core.phase,'main');
  return state;
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
}
function snapshot(state){
  return new Map(tag.tagInventory(state).map(card=>[card.uid,card.id]));
}
function assertConserved(state,before){
  const inventory=tag.tagInventory(state);
  assert.equal(inventory.length,before.size,'every physical card must remain in the duel');
  assert.equal(new Set(inventory.map(card=>card.uid)).size,inventory.length,'no physical UID may be duplicated');
  for(const card of inventory)assert.equal(before.get(card.uid),card.id,'physical card identity must not change: '+card.uid);
}

test('classic 2v2 shares one Field Zone per team, permits teammate replacement, and keeps opponent field independent',()=>{
  let state=game();
  const before=snapshot(state);
  assert.equal(before.size,80);

  const sogenUid=moveFieldToHand(state,0,fieldCards[0]);
  state=activateField(state,0,sogenUid);
  assert.equal(state.core.players[0].field?.uid,sogenUid);
  assert.equal(state.core.players[0].field?.faceUp,true);

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  const yamiUid=moveFieldToHand(state,1,fieldCards[1]);
  state=activateField(state,1,yamiUid);
  assert.equal(state.core.players[1].field?.uid,yamiUid);

  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  const mountainUid=moveFieldToHand(state,2,fieldCards[2]);
  state=activateField(state,2,mountainUid);

  assert.equal(state.core.players[0].field?.uid,mountainUid,'the incoming teammate replaces the shared team field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===sogenUid),'the replaced field spell must go to the team Graveyard');
  assert.equal(state.core.players[1].field?.uid,yamiUid,'replacing one team field must not affect the opponent team');
  assert.equal(state.core.players[0].field?.uid.startsWith('m2:'),true,'the replacement must retain the incoming physical owner UID');
  assert.equal(state.core.players[1].field?.uid.startsWith('m1:'),true,'the opponent field must retain its physical owner UID');

  const publicState=tag.publicTagDuel(state);
  assert.deepEqual(publicState.teams.map(team=>team.field),[
    {id:fieldCards[2],faceUp:true},
    {id:fieldCards[1],faceUp:true}
  ]);

  state=endTurn(state,2);
  state=endTurn(state,3);
  assert.equal(tag.tagDecisionMember(state).id,member(0),'the original teammate must rotate back into the same shared field');
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,fieldCards[2]);
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});

test('a set Field Spell remains hidden from both teammates until it is activated',()=>{
  let state=game();
  const before=snapshot(state);
  const uid=moveFieldToHand(state,0,fieldCards[0]);
  state=setField(state,0,uid);

  assert.equal(state.core.players[0].field?.uid,uid);
  assert.equal(state.core.players[0].field?.faceUp,false);
  let publicState=tag.publicTagDuel(state);
  assert.deepEqual(publicState.teams[0].field,{id:null,faceUp:false});
  assert.ok(!JSON.stringify(publicState).includes(uid),'public projection must not expose the hidden physical UID');
  assert.ok(!JSON.stringify(publicState).includes(fieldCards[0]),'public projection must not expose the hidden Field Spell identity');

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  publicState=tag.publicTagDuel(state);
  assert.deepEqual(publicState.teams[0].field,{id:null,faceUp:false});
  assert.ok(!JSON.stringify(publicState).includes(fieldCards[0]),'the incoming teammate must not learn the set card through the public projection');
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
