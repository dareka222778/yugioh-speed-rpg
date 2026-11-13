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
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {getPlayableCard}=require('../dist/effectRegistry');

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
function insertSession(state){
  const members=state.members.map(member=>({id:member.id,name:member.name,accepted:true}));
  const record={
    id:'m73-timeout-session',
    guild:'m73-guild',
    channel:'m73-channel',
    message:null,
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
  assert.doesNotThrow(()=>tag.assertTagDuel(expired.state));
  assertInventory(expired.state,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tag_members WHERE session_id=?').get(record.id).count,0,
    'finished timeout must release all four active seat locks');
  assert.equal(playerSnapshot(),playerDataBefore,'automatic timeout must not grant or remove player cards');

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
});
