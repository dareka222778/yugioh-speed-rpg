'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m533-duel-decision-race-'));
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
  const active=store.activeCards(id);
  assert.equal(active.cards.length,20,'the fixture uses a legal 20-card Main Deck');
  assert.ok(active.extra.length<=5,'the fixture respects the five-card Extra Deck limit');
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,database.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}

const workerScript=[
  "const fs=require('node:fs');",
  "process.stdout.write('READY\\n');",
  "const waitCell=new Int32Array(new SharedArrayBuffer(4));",
  "const deadline=Date.now()+10000;",
  "while(!fs.existsSync(process.env.M533_BARRIER)){",
  "  if(Date.now()>deadline){console.error('barrier timeout');process.exitCode=2;break;}",
  "  Atomics.wait(waitCell,0,0,5);",
  "}",
  "if(process.exitCode!==2){",
  "  let database;",
  "  try{",
  "    database=require('./dist/database');",
  "    database.db.pragma('busy_timeout = 5000');",
  "    const store=require('./dist/duelStore');",
  "    const mode=process.env.M533_MODE;",
  "    let record;",
  "    if(mode==='accept'){",
  "      record=store.acceptChallenge(process.env.M533_DUEL_ID,process.env.M533_OPPONENT,process.env.M533_GUILD,Number(process.env.M533_REVISION));",
  "    }else if(mode==='decline'){",
  "      record=store.declineChallenge(process.env.M533_DUEL_ID,process.env.M533_DECLINE_ACTOR,process.env.M533_GUILD);",
  "    }else throw new Error('unknown worker mode');",
  "    process.stdout.write(JSON.stringify({ok:true,id:record.id,status:record.status,revision:record.revision,mode})+'\\n');",
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

async function runDecisionRace(suffix,invitation,declineActor){
  if(database.db.open)database.db.close();
  const barrier=path.join(folder,'barrier-'+suffix);
  const workers=[
    launchWorker({
      M533_MODE:'accept',M533_BARRIER:barrier,M533_DUEL_ID:invitation.id,
      M533_OPPONENT:invitation.invite.opponent,M533_REVISION:String(invitation.revision),
      M533_GUILD:'m533-guild'
    }),
    launchWorker({
      M533_MODE:'decline',M533_BARRIER:barrier,M533_DUEL_ID:invitation.id,
      M533_DECLINE_ACTOR:declineActor,M533_GUILD:'m533-guild'
    })
  ];
  try{
    await Promise.all(workers.map(worker=>worker.ready));
    fs.writeFileSync(barrier,'go');
    return await Promise.all(workers.map(worker=>worker.result));
  }finally{
    fs.rmSync(barrier,{force:true});
    loadModules();
  }
}

function assertExactlyOneDecision(results){
  assert.equal(results.length,2,'Accept and Decline must execute in separate processes');
  assert.equal(results.filter(result=>result.ok).length,1,'exactly one terminal decision may commit');
  assert.equal(results.filter(result=>!result.ok).length,1,'the competing stale decision must fail closed');
  const rejected=results.find(result=>!result.ok);
  assert.match(rejected.error,/(convite|cancelar|locked|busy|UNIQUE|constraint)/i);
  return results.find(result=>result.ok);
}

test('concurrent Accept and Decline on one 1v1 invitation commit exactly one terminal decision',async()=>{
  const rounds=6;
  const fixtures=[];
  for(let index=0;index<rounds;index++){
    const owner='m533-owner-'+index,opponent='m533-opponent-'+index;
    createDuelist(owner);createDuelist(opponent);
    fixtures.push({owner,opponent,declineActor:index%2===0?owner:opponent});
  }
  const beforeAssets=assetSnapshot();
  let accepted=0,declined=0;

  for(let index=0;index<fixtures.length;index++){
    const fixture=fixtures[index];
    const invitation=store.challenge(fixture.owner,fixture.opponent,'m533-guild','m533-channel');
    const results=await runDecisionRace(String(index),invitation,fixture.declineActor);
    const winner=assertExactlyOneDecision(results);
    const record=store.getDuel(invitation.id);
    const lockCount=database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n;

    assert.equal(record.revision,invitation.revision+1,'the revision advances exactly once');
    if(winner.mode==='accept'){
      accepted++;
      assert.equal(record.status,'playing');
      assert.equal(record.invite,null);
      assert.ok(record.state,'Accept creates the actual DuelState');
      assert.deepEqual(new Set(record.state.players.map(player=>player.id)),new Set([fixture.owner,fixture.opponent]));
      assert.equal(lockCount,2,'Accept creates exactly the two physical-player locks');
      assert.equal(store.currentDuel(fixture.owner).id,invitation.id);
      assert.equal(store.currentDuel(fixture.opponent).id,invitation.id);
    }else{
      declined++;
      assert.equal(record.status,'declined');
      assert.equal(record.state,null,'Decline never creates a DuelState');
      assert.ok(record.invite,'the historical invitation snapshot remains auditable');
      assert.equal(lockCount,0,'Decline releases the creator lock');
      assert.equal(store.currentDuel(fixture.owner),undefined);
      assert.equal(store.currentDuel(fixture.opponent),undefined);
    }

    const revisionBeforeReplay=record.revision;
    const locksBeforeReplay=lockCount;
    if(winner.mode==='accept'){
      assert.throws(
        ()=>store.declineChallenge(invitation.id,fixture.declineActor,'m533-guild'),
        /não é possível cancelar|cannot cancel|convite/i
      );
    }else{
      assert.throws(
        ()=>store.acceptChallenge(invitation.id,fixture.opponent,'m533-guild',invitation.revision),
        /convite expirou|já foi respondido/i
      );
    }
    assert.equal(store.getDuel(invitation.id).revision,revisionBeforeReplay,'a stale losing action cannot advance the revision');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,locksBeforeReplay,'a stale losing action cannot recreate or remove locks');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(invitation.id).n,0,'invitation decisions do not fabricate duel transitions');
  }

  assert.equal(accepted+declined,rounds);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS n FROM duels WHERE status='pending'").get().n,0,'no invitation remains pending after both decisions complete');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members').get().n,accepted*2,'only accepted duels retain exactly two membership locks');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM duel_members m LEFT JOIN duels d ON d.id=m.duel_id WHERE d.id IS NULL').get().n,0,'no orphan membership locks remain');
  assert.deepEqual(assetSnapshot(),beforeAssets,'Accept/Decline races do not change players, collection, starter grants, Decks or economy');
});

after(()=>{
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
