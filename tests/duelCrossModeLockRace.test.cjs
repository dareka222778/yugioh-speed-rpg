'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m538-cross-mode-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');

const GUILD='m538-guild',CHANNEL='m538-channel';
const children=new Set();
let inspector;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=duel.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
}
function createGroup(prefix){
  const ids=['host','invitee','c','d','duel-owner'].map(s=>prefix+'-'+s);
  for(const id of ids)createDuelist(id);
  return ids;
}
function assetSnapshot(db){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function count(db,table,owner){
  return db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function launch(mode,invitation,lobby,actor,workerPath){
  const child=fork(workerPath,[],{
    cwd:process.cwd(),
    execArgv:[],
    stdio:['ignore','ignore','ignore','ipc'],
    env:{
      ...process.env,
      DATABASE_PATH:databasePath,
      M538_PROJECT_ROOT:process.cwd(),
      M538_MODE:mode,
      M538_DUEL_ID:invitation.id,
      M538_TAG_ID:lobby.id,
      M538_ACTOR:actor,
      M538_GUILD:GUILD,
      M538_DUEL_REVISION:String(invitation.revision),
      M538_TAG_REVISION:String(lobby.revision)
    }
  });
  children.add(child);
  let readySeen=false,resultSeen=false;
  let readyResolve,readyReject,resultResolve,resultReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const result=new Promise((resolve,reject)=>{resultResolve=resolve;resultReject=reject;});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  child.on('message',message=>{
    if(message?.type==='ready'){readySeen=true;readyResolve();}
    if(message?.type==='result'){resultSeen=true;resultResolve(message);}
  });
  child.on('error',error=>{readyReject(error);resultReject(error);});
  child.on('exit',(code,signal)=>{
    if(!readySeen)readyReject(new Error('worker '+mode+' exited before ready: '+code+'/'+signal));
    if(!resultSeen)resultReject(new Error('worker '+mode+' exited without a result: '+code+'/'+signal));
  });
  return {child,ready,result,exited};
}

test('independent 1v1 and TagDuel processes cannot acquire both locks for the same invitee',async()=>{
  const [host,invitee,c,d,duelOwner]=createGroup('m538-race');
  const lobby=tag.createTagLobby([host,invitee,c,d],GUILD,CHANNEL,'classic-loan');
  const invitation=duel.challenge(duelOwner,invitee,GUILD,CHANNEL);
  const beforeAssets=assetSnapshot(database.db);
  assert.equal(count(database.db,'tag_members',invitee),0,'a pending TagDuel invitee has no lock yet');
  assert.equal(count(database.db,'duel_members',invitee),0,'a pending 1v1 invitee has no lock yet');
  assert.equal(count(database.db,'tag_members',host),1,'the TagDuel host lock is already held');
  assert.equal(count(database.db,'duel_members',duelOwner),1,'the 1v1 creator lock is already held');

  const workerPath=path.join(folder,'accept-worker.cjs');
  fs.writeFileSync(workerPath,[
    "'use strict';",
    "const path=require('node:path');",
    "const root=process.env.M538_PROJECT_ROOT;",
    "const mode=process.env.M538_MODE;",
    "const store=mode==='duel'?require(path.join(root,'dist/duelStore')):require(path.join(root,'dist/tagStore'));",
    "process.on('message',command=>{",
    " if(command!=='go')return;",
    " try{",
    "  const result=mode==='duel'",
    "   ?store.acceptChallenge(process.env.M538_DUEL_ID,process.env.M538_ACTOR,process.env.M538_GUILD,Number(process.env.M538_DUEL_REVISION))",
    "   :store.acceptTag(process.env.M538_TAG_ID,process.env.M538_ACTOR,process.env.M538_GUILD,Number(process.env.M538_TAG_REVISION));",
    "  process.send({type:'result',mode,ok:true,status:result.status},()=>process.exit(0));",
    " }catch(error){",
    "  process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
    " }",
    "});",
    "process.send({type:'ready',mode});"
  ].join('\n'));

  // The parent closes its connection before the race. Each worker then owns
  // an independent SQLite connection to the same temporary database.
  database.db.close();
  const duelWorker=launch('duel',invitation,lobby,invitee,workerPath);
  await duelWorker.ready;
  const tagWorker=launch('tag',invitation,lobby,invitee,workerPath);
  await tagWorker.ready;

  // Both workers are ready before either transaction starts.
  duelWorker.child.send('go');
  tagWorker.child.send('go');
  const results=await Promise.all([duelWorker.result,tagWorker.result]);
  await Promise.all([duelWorker.exited,tagWorker.exited]);

  assert.equal(results.filter(result=>result.ok).length,1,'exactly one mode may win: '+JSON.stringify(results));
  const loser=results.find(result=>!result.ok);
  assert.ok(
    /reservado em um 2v2|já possui um duelo ou convite aberto|database is locked|SQLITE_BUSY/i.test(loser.error||'')||loser.code==='SQLITE_BUSY',
    'the losing transaction must fail closed on the conflicting lock: '+JSON.stringify(loser)
  );

  inspector=new Database(databasePath);
  const duelRow=inspector.prepare('SELECT status FROM duels WHERE id=?').get(invitation.id);
  const tagRow=inspector.prepare('SELECT status,members FROM tag_sessions WHERE id=?').get(lobby.id);
  const inviteeTagMember=JSON.parse(tagRow.members).find(member=>member.id===invitee);
  const duelLock=count(inspector,'duel_members',invitee);
  const tagLock=count(inspector,'tag_members',invitee);
  const duelAccepted=duelRow.status==='playing';
  const tagAccepted=inviteeTagMember.accepted;

  assert.equal(Number(duelAccepted)+Number(tagAccepted),1,'persisted session state must have one winner');
  assert.equal(duelLock+tagLock,1,'the invitee must own exactly one cross-mode lock');
  assert.equal(duelLock,duelAccepted?1:0);
  assert.equal(tagLock,tagAccepted?1:0);
  assert.equal(count(inspector,'tag_members',host),1,'the original TagDuel host lock is preserved');
  assert.equal(count(inspector,'duel_members',duelOwner),1,'the original 1v1 creator lock is preserved');
  assert.deepEqual(assetSnapshot(inspector),beforeAssets,'racing Accept operations never grant or mutate player inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
