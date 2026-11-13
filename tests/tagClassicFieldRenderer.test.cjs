const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const tag=require('../dist/tagDuel');
const {renderTag,tagImageLayout}=require('../dist/tagRenderer');
const {npcs}=require('../dist/npcContent');
const {getPlayableCard}=require('../dist/effectRegistry');

const fieldId='59197169'; // Yami
assert.equal(getPlayableCard(fieldId)?.field,true);

function game(){
  return tag.createTagDuel([0,1,2,3].map(i=>{
    const cards=[...npcs[i%3].cards];
    if(i===0)cards[0]=fieldId;
    return {id:'render-seat-'+i,name:'Render Seat '+i,cards,extra:npcs[i%3].extra};
  }),{classic:true,seed:'m69-classic-field-render'});
}
function member(seat){return 'render-seat-'+seat;}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function moveToHand(state,seat,id){
  const owner=holder(state,seat);
  let card=owner.hand.find(c=>c.id===id);
  if(!card){
    const index=owner.deck.findIndex(c=>c.id===id);
    assert.notEqual(index,-1,'field spell must remain in the physical deck or hand');
    card=owner.deck.splice(index,1)[0];
    owner.hand.push(card);
  }
  return card.uid;
}
function passResponse(state){
  let count=0;
  while(state.core.phase==='response'&&count<4){
    const acting=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,acting).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,acting,pass);
    count++;
  }
  assert.notEqual(state.core.phase,'response');
  return state;
}
function setField(state){
  const uid=moveToHand(state,0,fieldId);
  const action=tag.tagActions(state,member(0)).find(item=>item.kind==='setField'&&item.card===uid);
  assert.ok(action);
  state=tag.stepTagDuel(state,member(0),action);
  return {state:passResponse(state),uid};
}
function endTurn(state,seat){
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  return tag.stepTagDuel(state,member(seat),{kind:'end'});
}
function activateField(state,seat,uid){
  const action=tag.tagActions(state,member(seat)).find(item=>item.kind==='field'&&item.card===uid);
  assert.ok(action,'the active teammate must be able to activate the shared Field Zone card');
  return passResponse(tag.stepTagDuel(state,member(seat),action));
}
async function renderRequests(state,viewer){
  const requested=[];
  const png=await renderTag(state,viewer,async id=>{requested.push(id);return undefined;});
  return {requested,png,metadata:await sharp(png).metadata()};
}

test('classic 2v2 playmat keeps the Field Zone separate and scopes set-card art to the team',async()=>{
  let state=game();
  const layout=tagImageLayout(state);
  assert.deepEqual(layout,{width:1400,fieldHeight:1240,handHeight:340});

  const set=setField(state);
  state=set.state;
  const uid=set.uid;
  assert.equal(state.core.players[0].field?.faceUp,false);
  assert.deepEqual(tag.publicTagDuel(state).teams[0].field,{id:null,faceUp:false});

  const publicView=await renderRequests(state,undefined);
  assert.equal(publicView.metadata.width,1400);
  assert.equal(publicView.metadata.height,1240);
  assert.ok(!publicView.requested.includes(fieldId),'public renderer must not request art for a set Field Spell');

  const allyView=await renderRequests(state,member(2));
  assert.equal(allyView.metadata.width,1400);
  assert.equal(allyView.metadata.height,1580);
  assert.ok(allyView.requested.includes(fieldId),'the shared team playmat exposes its own set Field Spell to the teammate');

  const opponentView=await renderRequests(state,member(1));
  assert.equal(opponentView.metadata.height,1580);
  assert.ok(!opponentView.requested.includes(fieldId),'opponent renderer must keep the set Field Spell hidden');
  assert.equal(state.core.players[0].field?.uid,uid);

  state=endTurn(state,0);
  state=endTurn(state,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  state=activateField(state,2,uid);
  assert.equal(state.core.players[0].field?.faceUp,true);
  assert.equal(tag.publicTagDuel(state).teams[0].field.id,fieldId);

  const revealedPublic=await renderRequests(state,undefined);
  assert.ok(revealedPublic.requested.includes(fieldId),'once activated, Field Spell art is public');
  const revealedOpponent=await renderRequests(state,member(1));
  assert.ok(revealedOpponent.requested.includes(fieldId),'face-up Field Spell is visible to the opposing team');
  assert.deepEqual(tagImageLayout(state),layout,'field and hand layout dimensions must not change during activation');
});
