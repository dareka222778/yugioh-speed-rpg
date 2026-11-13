'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tag-action-receipts-'));
process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const databasePath=require.resolve('../dist/database');
const storePath=require.resolve('../dist/tagStore');
const receiptsPath=require.resolve('../dist/actionReceipts');
let database=require('../dist/database');
let db=database.db;
let store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');

const normalIds=[];
const names=new Set();
for(const id of tag.tagNormalCardIds){
  const card=getPlayableCard(id),name=card?.englishName??card?.name;
  if(card&&name&&!names.has(name)){names.add(name);normalIds.push(id);}
  if(normalIds.length===7)break;
}
assert.ok(normalIds.length>=7,'the action-receipt fixture needs seven distinct certified Normal Monsters');

function createPlayingSession(){
  const ids=[0,1,2,3].map(seat=>'m75-user-'+seat);
  for(const id of ids)database.createPlayer(id,id);
  const players=ids.map((id,seat)=>({
    id,
    name:'M75 User '+seat,
    cards:Array.from({length:20},(_,index)=>normalIds[index%normalIds.length])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m75-action-receipts'});
  const members=state.members.map(member=>({id:member.id,name:member.name,accepted:true}));
  const record={
    id:'m75-action-receipt-session',
    guild:'m75-guild',
    channel:'m75-channel',
    message:null,
    revision:0,
    updated:Date.now(),
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
function inventory(state){
  return tag.tagInventory(state).map(card=>card.uid+':'+card.id).sort();
}
function profiles(){
  return JSON.stringify({
    players:db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards:db.prepare('SELECT * FROM player_cards ORDER BY discord_id,card_key').all()
  });
}
after(()=>{
  try{db.close();}catch{}
  fs.rmSync(folder,{recursive:true,force:true});
});

test('2v2 action receipts replay once, reject conflicting IDs, survive SQLite reopen and never grant inventory',()=>{
  let record=createPlayingSession();
  const profilesBefore=profiles();
  const cardsBefore=inventory(record.state);
  assert.equal(cardsBefore.length,80);
  const actor=tag.tagDecisionMember(record.state).id;
  const actions=tag.tagActions(record.state,actor);
  const actionIndex=actions.findIndex(action=>action.kind==='end');
  const conflictingIndex=actions.findIndex(action=>action.kind==='summon');
  assert.notEqual(actionIndex,-1,'the active physical member must be able to end the turn');
  assert.notEqual(conflictingIndex,-1,'the all-Normal-Monster fixture must expose a distinct Summon action');
  assert.notEqual(conflictingIndex,actionIndex);
  const expectedRevision=record.revision;
  const invalidRetry='m75-invalid-retry';

  assert.throws(
    ()=>store.actTag(record.id,actor,record.guild,expectedRevision,999,invalidRetry),
    /Jogada indisponível/,
    'an invalid action must roll back without consuming its request ID'
  );
  const first=store.actTag(record.id,actor,record.guild,expectedRevision,actionIndex,invalidRetry);
  assert.equal(first.receipt.replayed,false);
  assert.equal(first.receipt.committedRevision,first.revision);
  assert.equal(first.revision,expectedRevision+1);
  assert.deepEqual(inventory(first.state),cardsBefore);

  const committed=JSON.stringify(first.state);
  const revision=first.revision;
  const duplicate=store.actTag(record.id,actor,record.guild,expectedRevision,actionIndex,invalidRetry);
  assert.equal(duplicate.receipt.replayed,true);
  assert.equal(duplicate.receipt.committedRevision,revision);
  assert.equal(duplicate.revision,revision);
  assert.equal(JSON.stringify(duplicate.state),committed,'duplicate delivery must return the committed state without a second turn advance');

  assert.throws(
    ()=>store.actTag(record.id,actor,record.guild,expectedRevision,conflictingIndex,invalidRetry),
    /Identificador de ação já utilizado/,
    'one request ID cannot be reused for a different action'
  );
  const other=first.members.find(member=>member.id!==actor).id;
  assert.throws(
    ()=>store.actTag(record.id,other,record.guild,expectedRevision,actionIndex,invalidRetry),
    /Identificador de ação já utilizado/,
    'one request ID cannot be replayed by another physical participant'
  );
  assert.throws(
    ()=>store.actTag(record.id,actor,record.guild,expectedRevision,actionIndex,'m75-new-stale-request'),
    /Painel desatualizado/,
    'a different request ID cannot bypass optimistic revision checks'
  );

  record=store.getTag(record.id);
  assert.equal(record.revision,revision);
  assert.equal(JSON.stringify(record.state),committed);
  assert.deepEqual(inventory(record.state),cardsBefore);
  assert.equal(profiles(),profilesBefore,'2v2 action receipts must not grant or remove player cards');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,4);

  db.close();
  delete require.cache[storePath];
  delete require.cache[receiptsPath];
  delete require.cache[databasePath];
  database=require('../dist/database');
  db=database.db;
  store=require('../dist/tagStore');
  const replayedAfterRestart=store.actTag(record.id,actor,record.guild,expectedRevision,actionIndex,invalidRetry);
  assert.equal(replayedAfterRestart.receipt.replayed,true);
  assert.equal(replayedAfterRestart.revision,revision);
  assert.equal(JSON.stringify(replayedAfterRestart.state),committed,'the receipt and committed state must survive SQLite close/reopen');
  assert.deepEqual(inventory(replayedAfterRestart.state),cardsBefore);
  assert.equal(profiles(),profilesBefore);
});
