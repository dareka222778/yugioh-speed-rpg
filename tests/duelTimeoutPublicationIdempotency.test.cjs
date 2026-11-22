'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m527-duel-timeout-publication-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const ui=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const guild='m527-guild',channel='m527-channel';
let sequence=0;

async function withClock(now,work){
  const realNow=Date.now;
  Date.now=()=>now;
  try{return await work();}finally{Date.now=realNow;}
}
function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function invitation(label){
  const owner='m527-'+label+'-owner',opponent='m527-'+label+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  return {owner,opponent,record:store.challenge(owner,opponent,guild,channel)};
}
function startDuel(label){
  const {owner,opponent,record}=invitation(label);
  const started=store.acceptChallenge(record.id,opponent,guild,record.revision);
  return {owner,opponent,invite:record,started};
}
function publish(record){
  store.setDuelMessage(record.id,channel,'m527-message-'+(++sequence),record.revision);
  store.markDuelPublished(record.id,record.revision);
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function physicalSnapshot(state){
  return state.players.map(player=>({
    id:player.id,
    hand:player.hand,
    deck:player.deck,
    monsters:player.monsters,
    backrow:player.backrow,
    field:player.field,
    grave:player.grave,
    banished:player.banished,
    extra:player.extra
  })).map(player=>JSON.parse(JSON.stringify(player)));
}
function publicRevision(id){
  return db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision;
}

test('repeated 1v1 invitation timeout polling is idempotent and only the matching terminal ACK clears the outbox',async()=>{
  const base=Date.now();
  const data=await withClock(base,async()=>invitation('expired-invite'));
  publish(data.record);
  const beforeAssets=assetSnapshot();
  const deadline=data.record.updated+120_000;

  const first=store.expireDueDuels(deadline).find(record=>record.id===data.record.id);
  assert.ok(first,'the exact 120-second boundary expires the pending invitation');
  assert.equal(first.status,'expired');
  assert.equal(first.state,null,'an expired invitation never creates a duel state');
  assert.equal(first.revision,data.record.revision+1);
  assert.equal(publicRevision(data.record.id),data.record.revision,'the rendered revision remains the last acknowledged one');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.record.id).n,0);
  assert.equal(store.currentDuel(data.owner),undefined,'the creator lock is released');
  assert.equal(store.currentDuel(data.opponent),undefined,'the invited player never acquired a lock');
  assert.deepEqual(store.duelEventsAt(data.record.id,first.revision),[],'invitation expiry creates no duel event');

  const second=store.expireDueDuels(deadline).find(record=>record.id===data.record.id);
  assert.ok(second,'the terminal invitation remains queued until Discord publication is acknowledged');
  assert.equal(second.status,'expired');
  assert.equal(second.revision,first.revision,'repeated polling cannot increment an expired invitation');
  assert.deepEqual(store.duelEventsAt(data.record.id,second.revision),[]);

  const payload=ui.duelPublicMessage(second);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0,'expired invitations expose no Accept/Decline controls');

  store.markDuelPublished(data.record.id,first.revision-1);
  assert.equal(publicRevision(data.record.id),data.record.revision,'a stale ACK cannot advance the publication cursor');
  assert.ok(store.expireDueDuels(deadline).some(record=>record.id===data.record.id),'stale ACK leaves the terminal revision queued');

  store.markDuelPublished(data.record.id,first.revision);
  assert.equal(publicRevision(data.record.id),first.revision);
  assert.equal(store.expireDueDuels(deadline).some(record=>record.id===data.record.id),false,'matching ACK clears the outbox entry');
  store.markDuelPublished(data.record.id,first.revision);
  assert.equal(publicRevision(data.record.id),first.revision,'duplicate ACK is harmless');
  assert.deepEqual(assetSnapshot(),beforeAssets,'timeout polling never changes collection, starter receipts or Decks');
});

test('repeated 1v1 decision timeout polling persists one W.O., preserves physical cards and waits for the matching public ACK',async()=>{
  const base=Date.now();
  const data=await withClock(base,async()=>startDuel('late-decision'));
  const actorIndex=engine.decisionPlayer(data.started.state);
  const actor=data.started.state.players[actorIndex].id;
  const winner=data.started.state.players.find(player=>player.id!==actor).id;
  const physicalBefore=physicalSnapshot(data.started.state);
  const privateUids=data.started.state.players.flatMap(player=>player.hand.map(card=>card.uid));
  publish(data.started);
  const beforeAssets=assetSnapshot();
  const deadline=data.started.updated+store.DECISION_TIMEOUT_MS;

  const first=store.expireDueDuels(deadline).find(record=>record.id===data.started.id);
  assert.ok(first,'the exact 30-minute decision deadline is processed');
  assert.equal(first.status,'finished');
  assert.equal(first.state.phase,'finished');
  assert.equal(first.state.winner,winner,'W.O. belongs to the opponent of the player who had to act');
  assert.match(first.state.reason,/W\\.O\\./i);
  assert.equal(first.revision,data.started.revision+1);
  assert.equal(publicRevision(data.started.id),data.started.revision,'terminal revision is not acknowledged before rendering');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.started.id).n,0);
  assert.equal(store.currentDuel(data.owner),undefined);
  assert.equal(store.currentDuel(data.opponent),undefined);
  assert.deepEqual(physicalSnapshot(first.state),physicalBefore,'timeout changes the result, not physical hands, Decks or zones');

  const events=store.duelEventsAt(data.started.id,first.revision).filter(event=>event.type==='duelFinished');
  assert.equal(events.length,1);
  assert.equal(events[0].winner,winner);

  const second=store.expireDueDuels(deadline).find(record=>record.id===data.started.id);
  assert.ok(second,'the terminal W.O. remains in the publication outbox');
  assert.equal(second.revision,first.revision,'repeated polling does not create another revision');
  assert.equal(store.duelEventsAt(data.started.id,second.revision).filter(event=>event.type==='duelFinished').length,1,'repeated polling cannot duplicate duelFinished');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE duel_id=?').get(data.started.id).n,0,'timeout polling creates no action receipt');

  const payload=ui.duelPublicMessage(second);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0,'finished duels expose no active controls');
  const serialized=JSON.stringify(payload);
  for(const uid of privateUids)assert.equal(serialized.includes(uid),false,'the public panel never exposes private hand UIDs');

  store.markDuelPublished(data.started.id,first.revision-1);
  assert.equal(publicRevision(data.started.id),data.started.revision,'a stale ACK cannot clear or advance the terminal revision');
  assert.ok(store.expireDueDuels(deadline).some(record=>record.id===data.started.id));

  store.markDuelPublished(data.started.id,first.revision);
  assert.equal(publicRevision(data.started.id),first.revision);
  assert.equal(store.expireDueDuels(deadline).some(record=>record.id===data.started.id),false,'the matching ACK removes the terminal revision from the outbox');
  store.markDuelPublished(data.started.id,first.revision);
  assert.equal(publicRevision(data.started.id),first.revision,'duplicate ACK remains idempotent');
  assert.equal(store.duelEventsAt(data.started.id,first.revision).filter(event=>event.type==='duelFinished').length,1);
  assert.deepEqual(assetSnapshot(),beforeAssets,'timeout and publication never mutate players, collection, grants or Decks');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
