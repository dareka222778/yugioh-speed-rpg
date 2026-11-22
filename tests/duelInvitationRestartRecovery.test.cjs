'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m532-duel-invite-restart-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

let database,decks,store;
function loadModules(){
  const dist=path.resolve(__dirname,'../dist')+path.sep;
  for(const filename of Object.keys(require.cache))if(filename.startsWith(dist))delete require.cache[filename];
  database=require('../dist/database');
  decks=require('../dist/decks');
  store=require('../dist/duelStore');
}
loadModules();

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,database.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function runAfterRestart(lines,env){
  const child=spawnSync(process.execPath,['-e',lines.join('\n')],{
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,DATABASE_PATH:databasePath,...env},
    encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024
  });
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.status,0,child.stderr||child.stdout);
  const line=child.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(line,'the restarted process must return machine-readable state');
  return JSON.parse(line);
}

test('pending 1v1 invitation survives process restart and can be accepted exactly once',()=>{
  const owner='m532-accept-owner',opponent='m532-accept-opponent';
  createDuelist(owner);createDuelist(opponent);
  const beforeAssets=assetSnapshot();
  const invitation=store.challenge(owner,opponent,'m532-guild','m532-channel');
  const originalInvite=structuredClone(invitation.invite);
  const originalRevision=invitation.revision;
  database.db.close();

  const recovered=runAfterRestart([
    "const database=require('./dist/database');",
    "const store=require('./dist/duelStore');",
    "const id=process.env.M532_DUEL_ID;",
    "try{",
    "  const pending=store.getDuel(id);",
    "  const accepted=store.acceptChallenge(id,process.env.M532_OPPONENT,process.env.M532_GUILD,Number(process.env.M532_REVISION));",
    "  const result={pendingStatus:pending.status,pendingRevision:pending.revision,invite:pending.invite,acceptedStatus:accepted.status,acceptedRevision:accepted.revision,players:accepted.state.players.map(player=>player.id),locks:database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(id).n,events:database.db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(id).n};",
    "  console.log(JSON.stringify(result));",
    "}finally{database.db.close();}"
  ],{M532_DUEL_ID:invitation.id,M532_OPPONENT:opponent,M532_GUILD:'m532-guild',M532_REVISION:String(originalRevision)});
  loadModules();

  assert.equal(recovered.pendingStatus,'pending');
  assert.equal(recovered.pendingRevision,originalRevision);
  assert.deepEqual(recovered.invite,originalInvite,'the persisted consent target and Deck snapshot survive restart');
  assert.equal(recovered.acceptedStatus,'playing');
  assert.equal(recovered.acceptedRevision,originalRevision+1);
  assert.deepEqual(new Set(recovered.players),new Set([owner,opponent]));
  assert.equal(recovered.locks,2,'acceptance creates exactly the owner and invited-player locks');
  assert.equal(recovered.events,0,'acceptance does not fabricate a duel action');
  const saved=store.getDuel(invitation.id);
  assert.equal(saved.status,'playing');
  assert.equal(saved.invite,null);
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent).id,invitation.id);
  assert.deepEqual(assetSnapshot(),beforeAssets,'restart and acceptance do not mutate player, collection, starter-grant or Deck rows');
});

test('pending 1v1 invitation can be declined after restart and stale Accept cannot recreate locks',()=>{
  const owner='m532-decline-owner',opponent='m532-decline-opponent';
  createDuelist(owner);createDuelist(opponent);
  const beforeAssets=assetSnapshot();
  const invitation=store.challenge(owner,opponent,'m532-guild','m532-channel');
  database.db.close();

  const recovered=runAfterRestart([
    "const database=require('./dist/database');",
    "const store=require('./dist/duelStore');",
    "const id=process.env.M532_DUEL_ID;",
    "try{",
    "  const pending=store.getDuel(id);",
    "  const declined=store.declineChallenge(id,process.env.M532_OPPONENT,process.env.M532_GUILD);",
    "  let staleAcceptError=null;",
    "  try{store.acceptChallenge(id,process.env.M532_OPPONENT,process.env.M532_GUILD,Number(process.env.M532_REVISION));}",
    "  catch(error){staleAcceptError=error instanceof Error?error.message:String(error);}",
    "  const result={pendingStatus:pending.status,pendingRevision:pending.revision,declinedStatus:declined.status,declinedRevision:declined.revision,staleAcceptError,locks:database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(id).n};",
    "  console.log(JSON.stringify(result));",
    "}finally{database.db.close();}"
  ],{M532_DUEL_ID:invitation.id,M532_OPPONENT:opponent,M532_GUILD:'m532-guild',M532_REVISION:String(invitation.revision)});
  loadModules();

  assert.equal(recovered.pendingStatus,'pending');
  assert.equal(recovered.pendingRevision,invitation.revision);
  assert.equal(recovered.declinedStatus,'declined');
  assert.equal(recovered.declinedRevision,invitation.revision+1);
  assert.match(recovered.staleAcceptError,/convite expirou|já foi respondido/i);
  assert.equal(recovered.locks,0,'decline after restart releases the creator lock');
  assert.equal(store.getDuel(invitation.id).status,'declined');
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.deepEqual(assetSnapshot(),beforeAssets,'decline/replay never changes player inventory or Deck data');
});

after(()=>{
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
