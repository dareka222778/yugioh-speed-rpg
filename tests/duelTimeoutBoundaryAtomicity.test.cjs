'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m515-duel-timeout-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const {duelPublicMessage}=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const guild='m515-guild',channel='m515-channel';
const pendingTimeout=120_000,decisionTimeout=store.DECISION_TIMEOUT_MS;
let sequence=0;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function pair(label){
  const owner='m515-'+label+'-owner',opponent='m515-'+label+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  return {owner,opponent};
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function startDuel(label){
  const {owner,opponent}=pair(label);
  const invite=store.challenge(owner,opponent,guild,channel);
  const started=store.acceptChallenge(invite.id,opponent,guild,invite.revision);
  assert.equal(started.status,'playing');
  return {owner,opponent,invite,started};
}
function publish(record){
  store.setDuelMessage(record.id,channel,'m515-message-'+(++sequence),record.revision);
  store.markDuelPublished(record.id,record.revision);
}

test('pending invitation expires at exactly 120 seconds, releases only its creator lock and publishes a terminal panel',()=>{
  const {owner,opponent}=pair('pending');
  const invite=store.challenge(owner,opponent,guild,channel);
  const base=invite.updated;
  publish(invite);
  const beforeAssets=assetSnapshot();

  const before=store.getDuel(invite.id,base+pendingTimeout-1);
  assert.equal(before.status,'pending','one millisecond before the deadline the invitation remains valid');
  assert.equal(before.revision,invite.revision);
  assert.equal(store.expireDueDuels(base+pendingTimeout-1).some(row=>row.id===invite.id),false);
  assert.equal(store.currentDuel(owner).id,invite.id);
  assert.equal(store.currentDuel(opponent),undefined,'the invited player has no lock before accepting');

  const [expired]=store.expireDueDuels(base+pendingTimeout).filter(row=>row.id===invite.id);
  assert.ok(expired,'the sweeper must pick the invitation at the exact deadline');
  assert.equal(expired.status,'expired');
  assert.equal(expired.revision,invite.revision+1);
  assert.equal(expired.state,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invite.id).n,0);
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.deepEqual(store.duelEventsAt(invite.id,expired.revision),[],'an invitation without a duel state has no fabricated transition events');

  const payload=duelPublicMessage(expired);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0,'an expired invitation must not retain Accept/Decline controls');
  assert.match(payload.embeds[0].toJSON().description,/convite expirou/i);
  assert.deepEqual(assetSnapshot(),beforeAssets,'timeout cannot change player, collection, starter-grant or Deck data');

  assert.ok(store.expireDueDuels(base+pendingTimeout).some(row=>row.id===invite.id),
    'the terminal panel remains queued until its exact revision is published');
  store.markDuelPublished(invite.id,expired.revision-1);
  assert.ok(store.expireDueDuels(base+pendingTimeout).some(row=>row.id===invite.id),
    'a stale publication receipt cannot clear the terminal refresh');
  store.markDuelPublished(invite.id,expired.revision);
  assert.equal(store.expireDueDuels(base+pendingTimeout).some(row=>row.id===invite.id),false);
});

test('a 30-minute decision timeout awards the W.O. to the actual decision opponent and persists one terminal event',()=>{
  const {owner,opponent,started}=startDuel('playing');
  const actor=started.state.players[engine.decisionPlayer(started.state)].id;
  const winner=started.state.players.find(player=>player.id!==actor).id;
  const base=started.updated;
  publish(started);
  const beforeAssets=assetSnapshot();
  const privateUids=started.state.players.flatMap(player=>player.hand.map(card=>card.uid));

  const before=store.getDuel(started.id,base+decisionTimeout-1);
  assert.equal(before.status,'playing','the active duel must survive until the exact decision deadline');
  assert.equal(before.revision,started.revision);
  assert.equal(store.expireDueDuels(base+decisionTimeout-1).some(row=>row.id===started.id),false);
  assert.equal(store.currentDuel(owner).id,started.id);
  assert.equal(store.currentDuel(opponent).id,started.id);

  const [terminal]=store.expireDueDuels(base+decisionTimeout).filter(row=>row.id===started.id);
  assert.ok(terminal,'the automatic sweeper must settle the due duel');
  assert.equal(terminal.status,'finished');
  assert.equal(terminal.state.phase,'finished');
  assert.equal(terminal.state.winner,winner,'W.O. belongs to the player who was not required to decide');
  assert.match(terminal.state.reason,/W\.O\./i);
  assert.equal(terminal.revision,started.revision+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,0);
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);

  const events=store.duelEventsAt(started.id,terminal.revision);
  const finished=events.filter(event=>event.type==='duelFinished');
  assert.equal(finished.length,1);
  assert.equal(finished[0].winner,winner);
  assert.match(finished[0].reason,/W\.O\./i);
  assert.equal(store.getDuel(started.id,base+decisionTimeout+60_000).revision,terminal.revision,
    're-reading a terminal duel cannot award a second W.O. or increment its revision');
  assert.equal(store.duelEventsAt(started.id,terminal.revision).filter(event=>event.type==='duelFinished').length,1);

  const payload=duelPublicMessage(terminal);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0,'finished duels have no active action controls');
  const serialized=JSON.stringify(payload);
  for(const uid of privateUids)assert.equal(serialized.includes(uid),false,'public timeout result must not reveal private hand UIDs');
  assert.deepEqual(assetSnapshot(),beforeAssets,'timeout cannot grant rewards, cards, DP, XP or modify Decks');

  assert.ok(store.expireDueDuels(base+decisionTimeout).some(row=>row.id===started.id),
    'the terminal result stays queued while its Discord revision is unpublished');
  store.markDuelPublished(started.id,terminal.revision);
  assert.equal(store.expireDueDuels(base+decisionTimeout).some(row=>row.id===started.id),false);
});

test('failure to persist the terminal event rolls back timeout status, revision and both locks; retry is safe',()=>{
  const {owner,opponent,started}=startDuel('rollback');
  const base=started.updated,deadline=base+decisionTimeout,beforeAssets=assetSnapshot();
  db.exec("CREATE TRIGGER m515_fail_timeout_event BEFORE INSERT ON duel_transition_events WHEN NEW.duel_id='"+started.id+"' BEGIN SELECT RAISE(ABORT,'m515 timeout event failure'); END");

  assert.throws(()=>store.getDuel(started.id,deadline),/m515 timeout event failure/);
  const rolledBack=store.getDuel(started.id,deadline-1);
  assert.equal(rolledBack.status,'playing');
  assert.equal(rolledBack.revision,started.revision);
  assert.deepEqual(store.duelEventsAt(started.id,started.revision+1),[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,2);
  assert.equal(store.currentDuel(owner).id,started.id);
  assert.equal(store.currentDuel(opponent).id,started.id);
  assert.deepEqual(assetSnapshot(),beforeAssets);

  db.exec('DROP TRIGGER m515_fail_timeout_event');
  const retried=store.getDuel(started.id,deadline);
  assert.equal(retried.status,'finished');
  assert.equal(retried.revision,started.revision+1);
  assert.equal(store.duelEventsAt(started.id,retried.revision).filter(event=>event.type==='duelFinished').length,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,0);
  assert.equal(store.getDuel(started.id,deadline+60_000).revision,retried.revision);
  assert.deepEqual(assetSnapshot(),beforeAssets);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
