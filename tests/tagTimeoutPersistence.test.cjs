'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tag-timeout-persistence-'));
process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const databasePath=require.resolve('../dist/database');
const storePath=require.resolve('../dist/tagStore');
let database=require('../dist/database');
let db=database.db;
let store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const FIELD_SPELL='86318356'; // Sogen
const MAGIC_JAMMER='77414722'; // Magic Jammer
assert.equal(getPlayableCard(FIELD_SPELL)?.field,true);
assert.equal(getEffect(MAGIC_JAMMER)?.kind,'magicJammer');

const normalIds=[];
const names=new Set();
for(const id of tag.tagNormalCardIds){
  const card=getPlayableCard(id),name=card?.englishName??card?.name;
  if(card&&name&&!names.has(name)){names.add(name);normalIds.push(id);}
  if(normalIds.length===7)break;
}
assert.ok(normalIds.length>=7,'the persistence fixture needs seven distinct certified Normal Monsters');
function normalDeck(count){return Array.from({length:count},(_,i)=>normalIds[i%normalIds.length]);}
function buildState(){
  const players=[0,1,2,3].map(seat=>({id:'m73-seat-'+seat,name:'M73 Seat '+seat,cards:normalDeck(20)}));
  return tag.createTagDuel(players,{classic:true,first:0,seed:'m73-tag-timeout-persistence'});
}
function buildResponseState(){
  const players=[0,1,2,3].map(seat=>({id:'m73-seat-'+seat,name:'M73 Seat '+seat,cards:normalDeck(20)}));
  players[0].cards=[FIELD_SPELL,...normalDeck(19)];
  players[1].cards=[MAGIC_JAMMER,...normalDeck(19)];
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m73-tag-response-timeout'});
  const fieldOwner=state.core.players[0];
  let field=fieldOwner.hand.find(card=>card.id===FIELD_SPELL);
  if(!field){
    const index=fieldOwner.deck.findIndex(card=>card.id===FIELD_SPELL);
    assert.notEqual(index,-1);
    field=fieldOwner.deck.splice(index,1)[0];
    fieldOwner.hand.push(field);
  }
  const trapOwner=state.core.players[1];
  let trap=trapOwner.hand.find(card=>card.id===MAGIC_JAMMER);
  if(!trap){
    const index=trapOwner.deck.findIndex(card=>card.id===MAGIC_JAMMER);
    assert.notEqual(index,-1);
    trap=trapOwner.deck.splice(index,1)[0];
  }else trapOwner.hand=trapOwner.hand.filter(card=>card.uid!==trap.uid);
  trapOwner.backrow.push({...trap,setTurn:0,faceUp:false});
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const action=tag.tagActions(state,'m73-seat-0').find(item=>item.kind==='field'&&item.card===field.uid);
  assert.ok(action);
  const response=tag.stepTagDuel(state,'m73-seat-0',action);
  assert.equal(response.core.phase,'response');
  assert.equal(tag.tagDecisionMember(response).id,'m73-seat-1');
  assert.ok(tag.tagActions(response,'m73-seat-1').some(item=>item.kind==='trap'&&item.card===trap.uid));
  return response;
}
function playerSnapshot(){
  return JSON.stringify({
    players:db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards:db.prepare('SELECT * FROM player_cards ORDER BY discord_id,card_key').all()
  });
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'all four physical decks must be present before timeout');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before timeout');
  return map;
}
function assertInventory(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'persisted timeout must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,80,'persisted timeout must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'persisted timeout changed physical identity '+card.uid);
}
function insertSession(state,id='m73-timeout-session'){
  const members=state.members.map(member=>({id:member.id,name:member.name,accepted:true}));
  const record={
    id,
    guild:'m73-guild',
    channel:'m73-channel',
    message:'m73-message',
    revision:7,
    updated:1_700_000_000_000,
    status:'playing',
    members,
    state,
    rules:'classic-loan'
  };
  db.prepare('INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(record.id,record.guild,record.channel,record.message,record.revision,record.updated,record.status,JSON.stringify(record.members),JSON.stringify(record.state),record.rules);
  for(const member of members)db.prepare('INSERT INTO tag_members(owner,session_id) VALUES(?,?)').run(member.id,record.id);
  return record;
}
after(()=>{
  try{db.close();}catch{}
  fs.rmSync(folder,{recursive:true,force:true});
});

test('expired classic 2v2 decision is persisted as one W.O. without touching player collections',()=>{
  database.createPlayer('m73-profile-a','M73 Profile A');
  database.createPlayer('m73-profile-b','M73 Profile B');
  for(let seat=0;seat<4;seat++)database.createPlayer('m73-seat-'+seat,'M73 Seat '+seat);
  const playerDataBefore=playerSnapshot();
  const state=buildState();
  const before=inventorySnapshot(state);
  const record=insertSession(state);

  const expired=store.getTag(record.id,record.updated+DECISION_TIMEOUT_MS);
  assert.equal(expired.status,'finished');
  assert.equal(expired.revision,record.revision+1);
  assert.equal(expired.state.core.phase,'finished');
  assert.equal(expired.state.core.winner,'tag-team-1','the team opposite the timed-out first seat must win');
  assert.match(expired.state.core.reason,/W\.O\./);
  assert.throws(
    ()=>store.actTag(record.id,'m73-seat-0',record.guild,expired.revision,0),
    /Painel desatualizado/,
    'a late Discord button action must not mutate a session already closed by timeout'
  );
  assert.doesNotThrow(()=>tag.assertTagDuel(expired.state));
  const publicMessage=ui.tagPublicMessage(expired);
  validateDiscordPayload(publicMessage);
  assert.deepEqual(publicMessage.components,[],'the finished public Discord panel must remove all action buttons');
  for(const member of expired.members){
    const privateMessage=ui.tagPrivateMessage(expired,member.id);
    validateDiscordPayload(privateMessage);
    assert.deepEqual(privateMessage.components,[],'finished private hand panels must remove all action buttons');
  }
  assertInventory(expired.state,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,0,
    'finished timeout must release all four active seat locks');
  const replacement=store.createTagLobby(record.members.map(member=>member.id),record.guild,'m73-rejoin-channel','classic-loan');
  assert.equal(replacement.status,'lobby','the same four players must be able to form a new lobby after timeout cleanup');
  store.quitTag(replacement.id,record.members[0].id,record.guild,replacement.revision);
  for(const member of record.members)assert.equal(store.currentTag(member.id),undefined,'no old timeout lock may prevent rejoining');
  assert.equal(playerSnapshot(),playerDataBefore,'automatic timeout must not grant or remove player cards');

  const queued=store.dueTags().find(item=>item.id===record.id);
  assert.ok(queued,'the finished timeout must be queued for Discord panel publication');
  assert.equal(queued.status,'finished');
  store.markTagPublished(record.id,expired.revision);
  assert.ok(!store.dueTags().some(item=>item.id===record.id),'publishing the finished revision must clear the pending panel update');

  const savedState=JSON.stringify(expired.state);
  const savedRevision=expired.revision;
  db.close();
  delete require.cache[storePath];
  delete require.cache[databasePath];
  database=require('../dist/database');
  db=database.db;
  store=require('../dist/tagStore');

  const restored=store.getTag(record.id,record.updated+DECISION_TIMEOUT_MS*2);
  assert.equal(restored.status,'finished');
  assert.equal(restored.revision,savedRevision,'re-reading a finished session must not apply timeout twice');
  assert.equal(JSON.stringify(restored.state),savedState,'finished W.O. state must survive SQLite close/reopen exactly');
  assert.equal(restored.state.core.winner,'tag-team-1');
  assertInventory(restored.state,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,0);
  assert.equal(playerSnapshot(),playerDataBefore,'reopening an expired session must not mutate player collections');
  assert.ok(!store.dueTags().some(item=>item.id===record.id),'a published terminal revision must not be re-enqueued after restart');
});


test('automatic SQLite timeout in a real Spell response awards the team that activated the Field Spell',()=>{
  for(const seat of [0,1,2,3])database.createPlayer('m73-seat-'+seat,'M73 Seat '+seat);
  const playerDataBefore=playerSnapshot();
  const state=buildResponseState();
  const before=inventorySnapshot(state);
  const record=insertSession(state,'m73-response-timeout-session');
  assert.equal(record.state.core.phase,'response');

  const expired=store.getTag(record.id,record.updated+DECISION_TIMEOUT_MS);
  assert.equal(expired.status,'finished');
  assert.equal(expired.revision,record.revision+1);
  assert.equal(expired.state.core.phase,'finished');
  assert.equal(expired.state.core.winner,'tag-team-0','the responding team timed out, so the activating team must win');
  assert.match(expired.state.core.reason,/W\.O\./);
  assert.doesNotThrow(()=>tag.assertTagDuel(expired.state));
  assertInventory(expired.state,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,0);
  assert.equal(playerSnapshot(),playerDataBefore);

  const queued=store.dueTags().find(item=>item.id===record.id);
  assert.ok(queued,'a response-phase timeout must be queued for Discord publication');
  const publicMessage=ui.tagPublicMessage(queued);
  validateDiscordPayload(publicMessage);
  assert.deepEqual(publicMessage.components,[]);
  store.markTagPublished(record.id,queued.revision);
  assert.ok(!store.dueTags().some(item=>item.id===record.id));

  const savedState=JSON.stringify(expired.state);
  const savedRevision=expired.revision;
  db.close();
  delete require.cache[storePath];
  delete require.cache[databasePath];
  database=require('../dist/database');
  db=database.db;
  store=require('../dist/tagStore');
  const restored=store.getTag(record.id,record.updated+DECISION_TIMEOUT_MS*2);
  assert.equal(restored.status,'finished');
  assert.equal(restored.revision,savedRevision);
  assert.equal(JSON.stringify(restored.state),savedState);
  assert.equal(restored.state.core.winner,'tag-team-0');
  assertInventory(restored.state,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,0);
  assert.equal(playerSnapshot(),playerDataBefore);
  assert.ok(!store.dueTags().some(item=>item.id===record.id));
});
