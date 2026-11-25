'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m528-duel-timeout-restart-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const db=database.db;
const guild='m528-guild',channel='m528-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function physicalSnapshot(state){
  return state.players.map(player=>JSON.parse(JSON.stringify({
    id:player.id,hand:player.hand,deck:player.deck,monsters:player.monsters,
    backrow:player.backrow,field:player.field,grave:player.grave,
    banished:player.banished,extra:player.extra
  })));
}
function assetSnapshot(connection){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,connection.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function runAfterRestart(source,id,deadline){
  const child=spawnSync(process.execPath,['-e',source],{
    cwd:process.cwd(),
    env:{...process.env,DATABASE_PATH:databasePath,M528_DUEL_ID:id,M528_DEADLINE:String(deadline)},
    encoding:'utf8',timeout:15_000,maxBuffer:4*1024*1024
  });
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.status,0,child.stderr||child.stdout);
  const line=child.stdout.trim().split('\n').at(-1);
  assert.ok(line,'the restarted process must return a machine-readable result');
  return JSON.parse(line);
}

test('1v1 timeout event, revision and publication outbox survive process restarts without duplicate W.O.',()=>{
  const owner='m528-owner',opponent='m528-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invitation=store.challenge(owner,opponent,guild,channel);
  const started=store.acceptChallenge(invitation.id,opponent,guild,invitation.revision);
  const actorIndex=engine.decisionPlayer(started.state);
  const actor=started.state.players[actorIndex].id;
  const winner=started.state.players.find(player=>player.id!==actor).id;
  const beforePhysical=physicalSnapshot(started.state);
  const beforeAssets=assetSnapshot(db);
  store.setDuelMessage(started.id,channel,'m528-persisted-message',started.revision);
  store.markDuelPublished(started.id,started.revision);
  const deadline=started.updated+store.DECISION_TIMEOUT_MS;
  const expectedRevision=started.revision+1;

  // Simulate a process crash/restart before the terminal message is published.
  db.close();
  const first=runAfterRestart(`
    const store=require('./dist/duelStore');
    const db=require('./dist/database').db;
    const id=process.env.M528_DUEL_ID,deadline=Number(process.env.M528_DEADLINE);
    const record=store.expireDueDuels(deadline).find(r=>r.id===id);
    if(!record)throw new Error('terminal duel was not recovered after restart');
    const events=store.duelEventsAt(id,record.revision).filter(e=>e.type==='duelFinished');
    const physical=record.state.players.map(p=>JSON.parse(JSON.stringify({id:p.id,hand:p.hand,deck:p.deck,monsters:p.monsters,backrow:p.backrow,field:p.field,grave:p.grave,banished:p.banished,extra:p.extra})));
    const result={status:record.status,phase:record.state.phase,winner:record.state.winner,reason:record.state.reason,revision:record.revision,publicRevision:db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision,locks:db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(id).n,eventCount:events.length,physical,assets:JSON.stringify(Object.fromEntries(['players','player_cards','starter_grants','decks','deck_cards'].map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY 1,2').all()])))};
    console.log(JSON.stringify(result));db.close();
  `,started.id,deadline);

  assert.equal(first.status,'finished');
  assert.equal(first.phase,'finished');
  assert.equal(first.winner,winner,'W.O. is awarded to the opponent of the physical player who had to act');
  assert.match(first.reason,/W\.O\./i);
  assert.equal(first.revision,expectedRevision);
  assert.equal(first.publicRevision,started.revision,'the terminal revision remains unacknowledged');
  assert.equal(first.locks,0,'both duel-member locks are released atomically');
  assert.equal(first.eventCount,1,'exactly one duelFinished event is persisted');
  assert.deepEqual(first.physical,beforePhysical,'all physical hands, Decks and zones survive the timeout');
  assert.equal(first.assets,beforeAssets,'player, collection, starter-grant and Deck rows are unchanged');

  // A second process sees the same terminal revision and the same single event.
  const second=runAfterRestart(`
    const store=require('./dist/duelStore');
    const db=require('./dist/database').db;
    const id=process.env.M528_DUEL_ID,deadline=Number(process.env.M528_DEADLINE);
    const record=store.expireDueDuels(deadline).find(r=>r.id===id);
    const result={found:!!record,revision:record?.revision,eventCount:store.duelEventsAt(id,record?.revision??0).filter(e=>e.type==='duelFinished').length,publicRevision:db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision};
    console.log(JSON.stringify(result));db.close();
  `,started.id,deadline);
  assert.equal(second.found,true,'the unacknowledged terminal outbox survives another restart');
  assert.equal(second.revision,expectedRevision,'recovery does not increment the terminal revision again');
  assert.equal(second.eventCount,1,'recovery does not duplicate duelFinished');
  assert.equal(second.publicRevision,started.revision);

  // The publication ACK itself is durable and idempotent across another restart.
  const acknowledged=runAfterRestart(`
    const store=require('./dist/duelStore');
    const db=require('./dist/database').db;
    const id=process.env.M528_DUEL_ID,deadline=Number(process.env.M528_DEADLINE);
    const record=store.getDuel(id,deadline);
    store.markDuelPublished(id,record.revision);
    const queued=store.expireDueDuels(deadline).some(r=>r.id===id);
    const result={revision:record.revision,publicRevision:db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision,queued,eventCount:store.duelEventsAt(id,record.revision).filter(e=>e.type==='duelFinished').length};
    console.log(JSON.stringify(result));db.close();
  `,started.id,deadline);
  assert.equal(acknowledged.revision,expectedRevision);
  assert.equal(acknowledged.publicRevision,expectedRevision);
  assert.equal(acknowledged.queued,false);
  assert.equal(acknowledged.eventCount,1);

  const final=runAfterRestart(`
    const store=require('./dist/duelStore');
    const db=require('./dist/database').db;
    const id=process.env.M528_DUEL_ID,deadline=Number(process.env.M528_DEADLINE);
    const record=store.getDuel(id,deadline);
    const result={status:record.status,revision:record.revision,queued:store.expireDueDuels(deadline).some(r=>r.id===id),publicRevision:db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision,eventCount:store.duelEventsAt(id,record.revision).filter(e=>e.type==='duelFinished').length};
    console.log(JSON.stringify(result));db.close();
  `,started.id,deadline);
  assert.equal(final.status,'finished');
  assert.equal(final.revision,expectedRevision);
  assert.equal(final.queued,false,'a matching ACK remains durable after process restart');
  assert.equal(final.publicRevision,expectedRevision);
  assert.equal(final.eventCount,1);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
