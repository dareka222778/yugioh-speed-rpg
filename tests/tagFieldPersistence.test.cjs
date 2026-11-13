const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tag-field-persistence-'));
process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const databasePath=require.resolve('../dist/database');
const storePath=require.resolve('../dist/tagStore');
let db=require('../dist/database').db;
let store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');

const fieldId='86318356'; // Sogen
assert.equal(getPlayableCard(fieldId)?.field,true);
const normalIds=[];
const names=new Set();
for(const id of tag.tagNormalCardIds){
  const card=getPlayableCard(id),name=card?.englishName??card?.name;
  if(card&&name&&!names.has(name)){names.add(name);normalIds.push(id);}
  if(normalIds.length===7)break;
}
assert.ok(normalIds.length>=7);
function normalDeck(count){return Array.from({length:count},(_,i)=>normalIds[Math.floor(i/3)]);}
function buildState(){
  const players=[0,1,2,3].map(seat=>({id:'persist-'+seat,name:'Persist '+seat,cards:seat===0?[fieldId,...normalDeck(19)]:normalDeck(20)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m70-field-persistence'});
  let field=state.core.players[0].hand.find(card=>card.id===fieldId);
  if(!field){
    const index=state.core.players[0].deck.findIndex(card=>card.id===fieldId);
    assert.notEqual(index,-1);
    field=state.core.players[0].deck.splice(index,1)[0];
    state.core.players[0].hand.push(field);
  }
  tag.assertTagDuel(state);
  return state;
}
function record(state){
  return {
    id:'field-persistence-session',
    guild:'guild',
    channel:'channel',
    message:null,
    revision:0,
    updated:Date.now(),
    status:'playing',
    members:state.members.map(member=>({id:member.id,name:member.name,accepted:true})),
    state,
    rules:'classic-loan'
  };
}
function insertSession(r){
  db.prepare('INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(r.id,r.guild,r.channel,r.message,r.revision,r.updated,r.status,JSON.stringify(r.members),JSON.stringify(r.state),r.rules);
  for(const member of r.members)db.prepare('INSERT INTO tag_members(owner,session_id) VALUES(?,?)').run(member.id,r.id);
}
function act(r,actor,predicate){
  const actions=tag.tagActions(r.state,actor);
  const index=actions.findIndex(predicate);
  assert.notEqual(index,-1,'expected legal action for '+actor);
  return store.actTag(r.id,actor,r.guild,r.revision,index);
}
function passResponse(r){
  let count=0;
  while(r.state.core.phase==='response'&&count<4){
    const actor=tag.tagDecisionMember(r.state).id;
    r=act(r,actor,action=>action.kind==='pass');
    count++;
  }
  assert.notEqual(r.state.core.phase,'response');
  return r;
}
function endTurn(r,seat){
  const actor='persist-'+seat;
  assert.equal(tag.tagDecisionMember(r.state).id,actor);
  return act(r,actor,action=>action.kind==='end');
}
function snapshot(database){
  return JSON.stringify({
    players:database.prepare('SELECT * FROM players').all(),
    cards:database.prepare('SELECT * FROM player_cards').all()
  });
}
after(()=>{
  try{db.close();}catch{}
  fs.rmSync(folder,{recursive:true,force:true});
});

test('2v2 Field Zone survives action receipts, SQLite close/reopen and teammate activation without touching player collections',()=>{
  const playerDataBefore=snapshot(db);
  let r=record(buildState());
  const initialInventory=tag.tagInventory(r.state);
  assert.equal(initialInventory.length,80);
  const initialUids=new Set(initialInventory.map(card=>card.uid));
  insertSession(r);

  r=act(r,'persist-0',action=>action.kind==='setField'&&action.card===r.state.core.players[0].hand.find(card=>card.id===fieldId).uid);
  r=passResponse(r);
  const physicalFieldUid=r.state.core.players[0].field.uid;
  assert.equal(r.state.core.players[0].field.faceUp,false);

  r=endTurn(r,0);
  r=endTurn(r,1);
  assert.equal(tag.tagDecisionMember(r.state).id,'persist-2');
  r=act(r,'persist-2',action=>action.kind==='field'&&action.card===physicalFieldUid);
  r=passResponse(r);
  assert.equal(r.state.core.players[0].field.uid,physicalFieldUid);
  assert.equal(r.state.core.players[0].field.faceUp,true);
  assert.equal(r.state.core.players[0].field.uid.startsWith('m0:'),true,'physical card owner must survive partner activation');

  const savedState=JSON.stringify(r.state);
  const revision=r.revision;
  db.close();
  delete require.cache[storePath];
  delete require.cache[databasePath];
  db=require('../dist/database').db;
  store=require('../dist/tagStore');
  const restored=store.getTag(r.id);
  assert.equal(restored.revision,revision);
  assert.equal(JSON.stringify(restored.state),savedState);
  assert.equal(restored.state.core.players[0].field.uid,physicalFieldUid);
  assert.equal(restored.state.core.players[0].field.faceUp,true);
  assert.doesNotThrow(()=>tag.assertTagDuel(restored.state));

  const inventory=tag.tagInventory(restored.state);
  assert.equal(inventory.length,80);
  assert.equal(new Set(inventory.map(card=>card.uid)).size,80);
  assert.deepEqual(new Set(inventory.map(card=>card.uid)),initialUids);
  assert.equal(snapshot(db),playerDataBefore,'borrowed 2v2 session must not mutate player profiles or card collections');
});
