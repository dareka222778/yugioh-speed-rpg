'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m539-cross-mode-timeout-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');

const GUILD='m539-guild',CHANNEL='m539-channel';
function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=duel.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
}
function createGroup(prefix,count=5){
  const ids=Array.from({length:count},(_,i)=>prefix+'-'+i);
  for(const id of ids)createDuelist(id);
  return ids;
}
function count(table,owner){
  return database.db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,database.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function ageDuel(id,ms){
  database.db.prepare('UPDATE duels SET updated=? WHERE id=?').run(Date.now()-ms-1,id);
}
function ageTag(id,ms){
  database.db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(Date.now()-ms-1,id);
}

test('expired pending 1v1 invitation releases its creator for TagDuel Accept',()=>{
  const [host,invitee,c,d,opponent]=createGroup('m539-pending-1v1');
  const lobby=tag.createTagLobby([host,invitee,c,d],GUILD,CHANNEL,'classic-loan');
  const invitation=duel.challenge(invitee,opponent,GUILD,CHANNEL);
  const before=assetSnapshot();
  assert.equal(count('duel_members',invitee),1);
  assert.equal(count('tag_members',invitee),0);

  ageDuel(invitation.id,120_000);
  const expired=duel.getDuel(invitation.id);
  assert.equal(expired.status,'expired');
  assert.equal(count('duel_members',invitee),0);

  const accepted=tag.acceptTag(lobby.id,invitee,GUILD,lobby.revision);
  assert.equal(accepted.members.find(member=>member.id===invitee).accepted,true);
  assert.equal(count('tag_members',invitee),1);
  assert.equal(count('duel_members',invitee),0);
  assert.equal(assetSnapshot(),before);
});

test('timed-out playing 1v1 releases both duelists so one can host TagDuel',()=>{
  const [owner,opponent,c,d,e]=createGroup('m539-playing-1v1');
  const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const started=duel.acceptChallenge(invitation.id,opponent,GUILD,invitation.revision);
  assert.equal(started.status,'playing');
  const before=assetSnapshot();
  assert.equal(count('duel_members',owner),1);
  assert.equal(count('duel_members',opponent),1);
  assert.throws(()=>tag.createTagLobby([owner,c,d,e],GUILD,CHANNEL,'classic-loan'),/duelo ou convite aberto/i);

  ageDuel(invitation.id,30*60_000);
  const finished=duel.getDuel(invitation.id);
  assert.equal(finished.status,'finished');
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);

  const lobby=tag.createTagLobby([owner,c,d,e],GUILD,CHANNEL,'classic-loan');
  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',owner),1);
  assert.equal(assetSnapshot(),before);
});

test('expired TagDuel lobby releases its host so they can create a 1v1 challenge',()=>{
  const [host,invitee,c,d,opponent]=createGroup('m539-tag-lobby');
  const lobby=tag.createTagLobby([host,invitee,c,d],GUILD,CHANNEL,'classic-loan');
  const before=assetSnapshot();
  assert.equal(count('tag_members',host),1);
  assert.throws(()=>duel.challenge(host,opponent,GUILD,CHANNEL),/reservado em um 2v2/i);

  ageTag(lobby.id,5*60_000);
  const expired=tag.getTag(lobby.id);
  assert.equal(expired.status,'expired');
  assert.equal(count('tag_members',host),0);

  const invitation=duel.challenge(host,opponent,GUILD,CHANNEL);
  assert.equal(invitation.status,'pending');
  assert.equal(count('duel_members',host),1);
  assert.equal(assetSnapshot(),before);
});

test('timed-out playing TagDuel releases all four physical locks for 1v1 challenges',()=>{
  const ids=createGroup('m539-playing-tag',8);
  const [a,b,c,d,e,f,g,h]=ids;
  let lobby=tag.createTagLobby([a,b,c,d],GUILD,CHANNEL,'classic-loan');
  for(const actor of [b,c,d])lobby=tag.acceptTag(lobby.id,actor,GUILD,lobby.revision);
  assert.equal(lobby.status,'playing');
  const before=assetSnapshot();
  for(const owner of [a,b,c,d])assert.equal(count('tag_members',owner),1);
  assert.throws(()=>duel.challenge(a,e,GUILD,CHANNEL),/reservado em um 2v2/i);

  ageTag(lobby.id,30*60_000);
  const finished=tag.getTag(lobby.id);
  assert.equal(finished.status,'finished');
  for(const owner of [a,b,c,d])assert.equal(count('tag_members',owner),0);

  for(const [owner,opponent] of [[a,e],[b,f],[c,g],[d,h]]){
    const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
    assert.equal(invitation.status,'pending');
    assert.equal(count('duel_members',owner),1);
  }
  assert.equal(assetSnapshot(),before);
});

after(()=>{
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
