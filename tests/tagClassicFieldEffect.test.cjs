const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getEffect,getPlayableCard}=require('../dist/effectRegistry');

const fieldId='86318356'; // Sogen
const warriorId='91152256'; // Celtic Guardian
const field=getPlayableCard(fieldId);
const warrior=getPlayableCard(warriorId);
assert.equal(field?.field,true,'Sogen must be a certified Field Spell');
assert.equal(getEffect(fieldId)?.kind,'field','Sogen must use the executable field-effect model');
assert.equal(warrior?.race,'Warrior');
assert.equal(warrior?.level,4);
assert.equal(getEffect(warriorId)?.kind,'normal');

const normalIds=[warriorId];
const normalNames=new Set([warrior.englishName]);
for(const id of tag.tagNormalCardIds){
  const card=getPlayableCard(id);
  const name=card?.englishName??card?.name;
  if(card&&name&&!normalNames.has(name)){
    normalNames.add(name);
    normalIds.push(id);
  }
  if(normalIds.length===7)break;
}
assert.ok(normalIds.length>=7,'need seven distinct Normal Monsters for four valid 20-card decks');

function normalDeck(count){
  return Array.from({length:count},(_,i)=>normalIds[Math.floor(i/3)]);
}
function players(){
  return [0,1,2,3].map(seat=>({
    id:'field-effect-seat-'+seat,
    name:'Field Effect Seat '+seat,
    cards:seat===0?[fieldId,...normalDeck(19)]:normalDeck(20)
  }));
}
function game(){
  return tag.createTagDuel(players(),{classic:true,seed:'m68-field-effect-shared-by-team'});
}
function member(seat){return 'field-effect-seat-'+seat;}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function moveToHand(state,seat,id){
  const owner=holder(state,seat);
  let card=owner.hand.find(c=>c.id===id);
  if(!card){
    const index=owner.deck.findIndex(c=>c.id===id);
    assert.notEqual(index,-1,'card must remain in its physical seat deck or hand: '+id);
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
  assert.notEqual(state.core.phase,'response','response window must close');
  return state;
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
}
function summonWarrior(state,seat){
  const uid=moveToHand(state,seat,warriorId);
  const action=tag.tagActions(state,member(seat)).find(item=>
    item.kind==='summon'&&item.card===uid&&item.position==='atk'&&item.tributes.length===0
  );
  assert.ok(action,'the active teammate must be able to Normal Summon Celtic Guardian without Tributes');
  state=tag.stepTagDuel(state,member(seat),action);
  state=passResponse(state);
  const monster=state.core.players[seat%2].monsters.find(card=>card.uid===uid);
  assert.ok(monster,'summoned Warrior must remain on its team field');
  return {state,uid};
}
function setSogen(state){
  const uid=moveToHand(state,0,fieldId);
  const action=tag.tagActions(state,member(0)).find(item=>item.kind==='setField'&&item.card===uid);
  assert.ok(action,'seat 0 must be able to set Sogen');
  state=tag.stepTagDuel(state,member(0),action);
  state=passResponse(state);
  return {state,uid};
}
function activateSharedSogen(state,seat,uid){
  const action=tag.tagActions(state,member(seat)).find(item=>item.kind==='field'&&item.card===uid);
  assert.ok(action,'the incoming teammate must be able to activate the shared face-down Field Spell');
  state=tag.stepTagDuel(state,member(seat),action);
  state=passResponse(state);
  return state;
}
function snapshot(state){
  return new Map(tag.tagInventory(state).map(card=>[card.uid,card.id]));
}
function assertConserved(state,before){
  const inventory=tag.tagInventory(state);
  assert.equal(inventory.length,before.size);
  assert.equal(new Set(inventory.map(card=>card.uid)).size,inventory.length);
  for(const card of inventory)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('a Field Spell set by one teammate can be activated by the next; its continuous bonus applies to both teams and survives JSON recovery',()=>{
  let state=game();
  const before=snapshot(state);
  assert.equal(before.size,80);

  const set=setSogen(state);
  state=set.state;
  const sogenUid=set.uid;
  assert.equal(state.core.players[0].field?.uid,sogenUid);
  assert.equal(state.core.players[0].field?.faceUp,false);
  assert.deepEqual(tag.publicTagDuel(state).teams[0].field,{id:null,faceUp:false});

  state=endTurn(state,0);
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  const first=summonWarrior(state,1);
  state=first.state;
  const opposingWarriorUid=first.uid;
  const opposingWarrior=state.core.players[1].monsters.find(card=>card.uid===opposingWarriorUid);
  assert.equal(engine.atk(opposingWarrior,state.core),warrior.atk,'a set Field Spell must not apply before activation');

  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  const second=summonWarrior(state,2);
  state=second.state;
  const teammateWarriorUid=second.uid;
  const teammateWarrior=state.core.players[0].monsters.find(card=>card.uid===teammateWarriorUid);
  assert.equal(engine.atk(teammateWarrior,state.core),warrior.atk,'a face-down Field Spell must remain inactive');

  state=activateSharedSogen(state,2,sogenUid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.equal(state.core.players[0].field?.uid,sogenUid,'the teammate activates the same physical card set by seat 0');
  assert.equal(state.core.players[0].field?.uid.startsWith('m0:'),true,'field-card ownership must remain with the original physical setter');
  assert.equal(teammateWarriorUid.startsWith('m2:'),true,'the incoming teammate retains ownership of their summoned monster');
  assert.equal(opposingWarriorUid.startsWith('m1:'),true,'the opposing seat retains ownership of their summoned monster');

  assert.equal(engine.atk(state.core.players[0].monsters[0],state.core),warrior.atk+200);
  assert.equal(engine.atk(state.core.players[1].monsters[0],state.core),warrior.atk+200,'Sogen affects qualifying monsters on both sides of the field');
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,fieldId,'the Field Spell becomes public only after activation');

  state=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.equal(engine.atk(state.core.players[0].monsters[0],state.core),warrior.atk+200);
  assert.equal(engine.atk(state.core.players[1].monsters[0],state.core),warrior.atk+200);

  state=endTurn(state,2);
  state=endTurn(state,3);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,fieldId);
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
