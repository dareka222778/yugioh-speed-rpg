'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m531-duel-lobby-race-'));
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

const workerScript=[
  "const fs=require('node:fs');",
  "let database;",
  "process.stdout.write('READY\\n');",
  "const waitCell=new Int32Array(new SharedArrayBuffer(4));",
  "const deadline=Date.now()+10000;",
  "while(!fs.existsSync(process.env.M531_BARRIER)){",
  "  if(Date.now()>deadline){console.error('barrier timeout');process.exitCode=2;break;}",
  "  Atomics.wait(waitCell,0,0,5);",
  "}",
  "if(process.exitCode!==2){",
  "  try{",
  "    database=require('./dist/database');",
  "    const store=require('./dist/duelStore');",
  "    const mode=process.env.M531_MODE;",
  "    let result;",
  "    if(mode==='challenge'){",
  "      const record=store.challenge(process.env.M531_OWNER,process.env.M531_OPPONENT,process.env.M531_GUILD,process.env.M531_CHANNEL);",
  "      result={ok:true,id:record.id,status:record.status,revision:record.revision,opponent:record.invite.opponent};",
  "    }else if(mode==='accept'){",
  "      const record=store.acceptChallenge(process.env.M531_DUEL_ID,process.env.M531_ACTOR,process.env.M531_GUILD,Number(process.env.M531_REVISION));",
  "      result={ok:true,id:record.id,status:record.status,revision:record.revision,players:record.state.players.map(player=>player.id)};",
  "    }else throw new Error('unknown worker mode');",
  "    process.stdout.write(JSON.stringify(result)+'\\n');",
  "  }catch(error){",
  "    process.stdout.write(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error),code:error&&typeof error==='object'?error.code??null:null})+'\\n');",
  "  }finally{",
  "    if(database?.db?.open)database.db.close();",
  "  }",
  "}"
].join('\n');

function launchWorker(env){
  const child=spawn(process.execPath,['-e',workerScript],{
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,DATABASE_PATH:databasePath,...env},
    stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr='',readySeen=false;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const result=new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{
      stdout+=chunk.toString();
      if(!readySeen&&stdout.split(/\r?\n/).includes('READY')){
        readySeen=true;
        resolveReady();
      }
    });
    child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    child.once('error',reject);
    child.once('close',code=>{
      if(!readySeen)rejectReady(new Error('worker exited before barrier readiness: '+stderr));
      const line=stdout.trim().split(/\r?\n/).at(-1);
      if(code!==0)return reject(new Error('worker exited '+code+': '+stderr+' '+stdout));
      try{resolve(JSON.parse(line));}
      catch(error){reject(new Error('worker did not return JSON: '+String(error)+' '+stdout+' '+stderr));}
    });
  });
  return {ready,result};
}

async function runRace(mode,suffix,workers){
  if(database.db.open)database.db.close();
  const barrier=path.join(folder,'barrier-'+suffix);
  const launched=workers.map(worker=>launchWorker({
    M531_MODE:mode,
    M531_BARRIER:barrier,
    M531_GUILD:'m531-guild',
    M531_CHANNEL:'m531-channel',
    ...worker
  }));
  try{
    await Promise.all(launched.map(worker=>worker.ready));
    fs.writeFileSync(barrier,'go');
    return await Promise.all(launched.map(worker=>worker.result));
  }finally{
    fs.rmSync(barrier,{force:true});
    loadModules();
  }
}

function assertOneWinner(results,description){
  assert.equal(results.length,2,description+' must use two independent processes');
  assert.equal(results.filter(result=>result.ok).length,1,description+' must commit exactly once');
  assert.equal(results.filter(result=>!result.ok).length,1,description+' must reject the competing writer');
  const rejected=results.find(result=>!result.ok);
  assert.match(rejected.error,/(duelista|duelo|convite|locked|busy|UNIQUE|constraint)/i,description+' must fail closed on the database/lock invariant');
  return results.find(result=>result.ok);
}

test('independent processes cannot create two pending 1v1 invitations for the same creator',async()=>{
  const rounds=4;
  const fixtures=[];
  for(let index=0;index<rounds;index++){
    const suffix=String(index);
    const owner='m531-owner-'+suffix;
    const first='m531-opponent-a-'+suffix;
    const second='m531-opponent-b-'+suffix;
    createDuelist(owner);createDuelist(first);createDuelist(second);
    fixtures.push({owner,first,second});
  }
  const beforeAssets=assetSnapshot();

  for(let index=0;index<fixtures.length;index++){
    const fixture=fixtures[index];
    const results=await runRace('challenge','challenge-'+index,[
      {M531_OWNER:fixture.owner,M531_OPPONENT:fixture.first},
      {M531_OWNER:fixture.owner,M531_OPPONENT:fixture.second}
    ]);
    const winner=assertOneWinner(results,'same-owner challenge race');
    const record=store.getDuel(winner.id);
    assert.equal(record.status,'pending');
    assert.equal(record.revision,0);
    assert.equal(record.invite.owner,fixture.owner);
    assert.equal(record.invite.opponent,winner.opponent);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duels WHERE id=?').get(winner.id).n,1);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(winner.id).n,1);
    assert.equal(database.db.prepare('SELECT owner FROM duel_members WHERE duel_id=?').get(winner.id).owner,fixture.owner);
    assert.equal(store.currentDuel(fixture.owner).id,winner.id);
    assert.equal(store.currentDuel(fixture.first),undefined,'the invited seat is not locked before consent');
    assert.equal(store.currentDuel(fixture.second),undefined,'the losing invitation creates no opponent lock');
    assert.equal(database.db.prepare("SELECT COUNT(*) AS n FROM duels WHERE guild_id='m531-guild' AND status='pending'").get().n,1);

    store.declineChallenge(winner.id,fixture.owner,'m531-guild');
    assert.equal(store.getDuel(winner.id).status,'declined');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(winner.id).n,0);
    assert.equal(store.currentDuel(fixture.owner),undefined,'decline releases the creator lock');
  }

  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members').get().n,0,'no orphan membership locks remain');
  assert.deepEqual(assetSnapshot(),beforeAssets,'concurrent invitation attempts never mutate players, collection, starter grants or Decks');
});

test('two simultaneous Accept operations start one duel and create exactly two membership locks',async()=>{
  const owner='m531-accept-owner',opponent='m531-accept-opponent';
  createDuelist(owner);createDuelist(opponent);
  const beforeAssets=assetSnapshot();
  const invitation=store.challenge(owner,opponent,'m531-guild','m531-channel');

  const results=await runRace('accept','accept-same-invite',[
    {M531_DUEL_ID:invitation.id,M531_ACTOR:opponent,M531_REVISION:String(invitation.revision)},
    {M531_DUEL_ID:invitation.id,M531_ACTOR:opponent,M531_REVISION:String(invitation.revision)}
  ]);
  const winner=assertOneWinner(results,'duplicate Accept race');
  const record=store.getDuel(invitation.id);
  assert.equal(winner.id,invitation.id);
  assert.equal(record.status,'playing');
  assert.equal(record.revision,invitation.revision+1);
  assert.deepEqual(new Set(record.state.players.map(player=>player.id)),new Set([owner,opponent]));
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,2);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE owner IN (?,?)').get(owner,opponent).n,2);
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent).id,invitation.id);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(invitation.id).n,0,'acceptance does not fabricate duel actions/events');
  assert.deepEqual(assetSnapshot(),beforeAssets,'acceptance races do not grant inventory or mutate player economy/Deck rows');
});

after(()=>{
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
