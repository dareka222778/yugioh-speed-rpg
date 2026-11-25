'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m526-duel-receipt-timeout-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const {duelPublicMessage}=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const GUILD='m526-guild',CHANNEL='m526-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function startDuel(){
  const owner='m526-owner',opponent='m526-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invite=store.challenge(owner,opponent,GUILD,CHANNEL);
  const started=store.acceptChallenge(invite.id,opponent,GUILD,invite.revision);
  assert.equal(started.status,'playing');
  return {owner,opponent,invite,started};
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function physicalSnapshot(state){
  return JSON.stringify(state.players.map(player=>({
    id:player.id,
    deck:player.deck.map(card=>({uid:card.uid,id:card.id})),
    hand:player.hand.map(card=>({uid:card.uid,id:card.id})),
    extra:(player.extra??[]).map(card=>({uid:card.uid,id:card.id})),
    monsters:player.monsters,
    backrow:player.backrow,
    grave:player.grave,
    banished:player.banished??[],
    field:player.field??null
  })));
}

test('a valid 1v1 action receipt replay at the exact deadline persists W.O. instead of bypassing timeout',()=>{
  const {owner,opponent,started}=startDuel();
  const actor=started.state.players[engine.decisionPlayer(started.state)].id;
  const actions=engine.legalActions(started.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.notEqual(index,-1,'End Turn is a legal action for the initial duel state');
  const requestId='m526-discord-request-unique';
  const first=store.performDuelAction(started.id,actor,GUILD,started.revision,index,requestId);
  assert.equal(first.status,'playing');
  assert.equal(first.revision,started.revision+1);
  assert.deepEqual(first.receipt,{
    requestId,committedRevision:first.revision,replayed:false
  });
  assert.equal(first.state.turn,started.state.turn+1);
  const originalEvents=store.duelEventsAt(started.id,first.revision);
  assert.ok(originalEvents.length>0);
  const beforeZones=physicalSnapshot(first.state);
  const privateUids=first.state.players.flatMap(player=>player.hand.map(card=>card.uid));
  const expectedActor=first.state.players[engine.decisionPlayer(first.state)].id;
  const expectedWinner=first.state.players.find(player=>player.id!==expectedActor).id;
  const beforeAssets=assetSnapshot();

  store.setDuelMessage(started.id,CHANNEL,'m526-public-message',first.revision);
  store.markDuelPublished(started.id,first.revision);
  const timeoutNow=Date.now();
  const staleUpdated=timeoutNow-store.DECISION_TIMEOUT_MS;
  db.prepare('UPDATE duels SET updated=? WHERE id=?').run(staleUpdated,started.id);
  assert.equal(staleUpdated+store.DECISION_TIMEOUT_MS,timeoutNow);

  const other=first.state.players.find(player=>player.id!==actor);
  assert.throws(
    ()=>store.performDuelAction(started.id,other.id,GUILD,started.revision,index,requestId),
    /já utilizado por outra solicitação/
  );
  assert.equal(db.prepare('SELECT status FROM duels WHERE id=?').get(started.id).status,'playing',
    'a request-ID collision is rejected before timeout side effects');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,2);

  const replay=store.performDuelAction(started.id,actor,GUILD,started.revision,index,requestId);
  assert.equal(replay.status,'finished','a valid receipt replay must apply the deadline check before returning');
  assert.equal(replay.revision,first.revision+1);
  assert.equal(replay.state.phase,'finished');
  assert.equal(replay.state.winner,expectedWinner);
  assert.match(replay.state.reason,/W\.O\./i);
  assert.deepEqual(replay.receipt,{
    requestId,committedRevision:first.revision,replayed:true
  });
  assert.equal(replay.state.turn,first.state.turn,'the original End Turn action is not applied twice');
  assert.deepEqual(store.duelEventsAt(started.id,first.revision),originalEvents);
  const finished=store.duelEventsAt(started.id,replay.revision).filter(event=>event.type==='duelFinished');
  assert.equal(finished.length,1);
  assert.equal(finished[0].winner,expectedWinner);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE duel_id=?').get(started.id).n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,0);
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.deepEqual(physicalSnapshot(replay.state),beforeZones,'timeout preserves all physical card zones');
  assert.deepEqual(assetSnapshot(),beforeAssets,'timeout grants no rewards and changes no persistent player assets');

  const payload=duelPublicMessage(replay);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0);
  const serialized=JSON.stringify(payload);
  for(const uid of privateUids)assert.equal(serialized.includes(uid),false,'the public W.O. panel never exposes private hand UIDs');

  assert.ok(store.expireDueDuels().some(record=>record.id===started.id),'the terminal revision remains queued for publication');
  store.markDuelPublished(started.id,first.revision);
  assert.ok(store.expireDueDuels().some(record=>record.id===started.id),'an acknowledgement for the action revision cannot clear the later W.O. revision');
  store.markDuelPublished(started.id,replay.revision);
  assert.equal(store.expireDueDuels().some(record=>record.id===started.id),false);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
