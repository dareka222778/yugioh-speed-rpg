'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m540-cross-mode-timeout-rollback-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const db=database.db;

const GUILD='m540-guild',CHANNEL='m540-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=duel.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
}
function group(prefix,count){
  return Array.from({length:count},(_,i)=>{
    const id=prefix+'-'+i;
    createDuelist(id);
    return id;
  });
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function count(table,owner){
  return db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function duelInventory(state){
  const rows=[];
  for(const player of state.players){
    for(const zone of ['deck','hand','monsters','backrow','grave','banished','extra']){
      for(const card of player[zone]??[])rows.push([card.uid,card.id]);
    }
    if(player.field)rows.push([player.field.uid,player.field.id]);
  }
  rows.sort((a,b)=>a[0].localeCompare(b[0]));
  return rows;
}
function tagInventory(state){
  return tagEngine.tagInventory(state).map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}

test('1v1 timeout lock-release failure keeps the player blocked from TagDuel until retry commits',()=>{
  const [owner,opponent,ally1,ally2,ally3]=group('m540-1v1',5);
  const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const started=duel.acceptChallenge(invitation.id,opponent,GUILD,invitation.revision);
  assert.equal(started.status,'playing');

  const beforeAssets=assetSnapshot();
  const beforeInventory=duelInventory(started.state);
  const deadline=started.updated+duel.DECISION_TIMEOUT_MS;
  const tagMembers=[owner,ally1,ally2,ally3];

  assert.throws(
    ()=>tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan'),
    /duelo ou convite aberto/i,
    'an active 1v1 lock must block TagDuel creation'
  );

  db.exec(`
    CREATE TRIGGER m540_fail_duel_lock_release
    BEFORE DELETE ON duel_members
    WHEN OLD.duel_id='${started.id}'
    BEGIN SELECT RAISE(ABORT,'m540 injected 1v1 lock-release failure'); END;
  `);

  assert.throws(
    ()=>duel.getDuel(started.id,deadline),
    /m540 injected 1v1 lock-release failure/
  );
  const rolledBack=duel.getDuel(started.id,deadline-1);
  assert.equal(rolledBack.status,'playing');
  assert.equal(rolledBack.revision,started.revision);
  assert.equal(count('duel_members',owner),1);
  assert.equal(count('duel_members',opponent),1);
  assert.throws(
    ()=>tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan'),
    /duelo ou convite aberto/i,
    'a failed terminal transaction must not release the cross-mode exclusion'
  );
  assert.deepEqual(duelInventory(rolledBack.state),beforeInventory);
  assert.equal(assetSnapshot(),beforeAssets);

  db.exec('DROP TRIGGER m540_fail_duel_lock_release');
  const finished=duel.getDuel(started.id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(finished.revision,started.revision+1);
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);
  assert.equal(duel.currentDuel(owner),undefined);

  const lobby=tag.createTagLobby(tagMembers,GUILD,CHANNEL,'classic-loan');
  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',owner),1);
  assert.equal(count('duel_members',owner),0);
  assert.deepEqual(duelInventory(finished.state),beforeInventory);
  assert.equal(assetSnapshot(),beforeAssets);
});

test('TagDuel timeout lock-release failure keeps all four physical seats blocked from 1v1 until retry commits',()=>{
  const ids=group('m540-tag',8);
  const [a,b,c,d,e,f,g,h]=ids;
  let lobby=tag.createTagLobby([a,b,c,d],GUILD,CHANNEL,'classic-loan');
  for(const actor of [b,c,d])lobby=tag.acceptTag(lobby.id,actor,GUILD,lobby.revision);
  assert.equal(lobby.status,'playing');

  const beforeAssets=assetSnapshot();
  const beforeInventory=tagInventory(lobby.state);
  const deadline=tag.tagDeadline(lobby);

  for(const [owner,opponent] of [[a,e],[b,f],[c,g],[d,h]]){
    assert.throws(
      ()=>duel.challenge(owner,opponent,GUILD,CHANNEL),
      /reservado em um 2v2/i,
      'each physical TagDuel member must remain excluded from 1v1'
    );
  }

  db.exec(`
    CREATE TRIGGER m540_fail_tag_lock_release
    BEFORE DELETE ON tag_members
    WHEN OLD.session_id='${lobby.id}'
    BEGIN SELECT RAISE(ABORT,'m540 injected TagDuel lock-release failure'); END;
  `);

  assert.throws(
    ()=>tag.getTag(lobby.id,deadline),
    /m540 injected TagDuel lock-release failure/
  );
  const rolledBack=tag.getTag(lobby.id,deadline-1);
  assert.equal(rolledBack.status,'playing');
  assert.equal(rolledBack.revision,lobby.revision);
  const opponents={[a]:e,[b]:f,[c]:g,[d]:h};
  for(const owner of [a,b,c,d]){
    assert.equal(count('tag_members',owner),1);
    assert.throws(
      ()=>duel.challenge(owner,opponents[owner],GUILD,CHANNEL),
      /reservado em um 2v2/i,
      'rollback must preserve every physical lock'
    );
  }
  assert.deepEqual(tagInventory(rolledBack.state),beforeInventory);
  assert.equal(assetSnapshot(),beforeAssets);

  db.exec('DROP TRIGGER m540_fail_tag_lock_release');
  const finished=tag.getTag(lobby.id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(finished.revision,lobby.revision+1);
  assert.equal(count('tag_members',a)+count('tag_members',b)+count('tag_members',c)+count('tag_members',d),0);
  assert.deepEqual(tagInventory(finished.state),beforeInventory);

  for(const [owner,opponent] of [[a,e],[b,f],[c,g],[d,h]]){
    const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
    assert.equal(invitation.status,'pending');
    assert.equal(count('duel_members',owner),1);
    assert.equal(count('tag_members',owner),0);
  }
  assert.equal(assetSnapshot(),beforeAssets,'timeout rollback/retry cannot grant or mutate player assets');
});

after(()=>{
  if(db?.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
