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

test('five independent-process races never acquire both 1v1 and TagDuel locks for one invitee',async()=>{
  const cases=[];
  for(let index=0;index<5;index++){
    const [host,invitee,c,d,duelOwner]=createGroup('m538-race-'+index);
    const lobby=tag.createTagLobby([host,invitee,c,d],GUILD,CHANNEL,'classic-loan');
    const invitation=duel.challenge(duelOwner,invitee,GUILD,CHANNEL);
    assert.equal(count(database.db,'tag_members',invitee),0);
    assert.equal(count(database.db,'duel_members',invitee),0);
    assert.equal(count(database.db,'tag_members',host),1);
    assert.equal(count(database.db,'duel_members',duelOwner),1);
    cases.push({host,invitee,duelOwner,lobby,invitation});
  }
  const beforeAssets=assetSnapshot(database.db);

  const workerPath=path.join(folder,'accept-worker.cjs');
  fs.writeFileSync(workerPath,[
    "'use strict';",
    "const path=require('node:path');",
    "const root=process.env.M538_PROJECT_ROOT;",
    "const mode=process.env.M538_MODE;",
    "const store=mode==='duel'?require(path.join(root,'dist/duelStore')):require(path.join(root,'dist/tagStore'));",
    "process.on('message',command=>{",
    " if(!command||command.type!=='go')return;",
    " const delay=Math.max(0,Number(command.startAt)-Date.now());",
    " setTimeout(()=>{",
    "  try{",
    "   const result=mode==='duel'",
    "    ?store.acceptChallenge(process.env.M538_DUEL_ID,process.env.M538_ACTOR,process.env.M538_GUILD,Number(process.env.M538_DUEL_REVISION))",
    "    :store.acceptTag(process.env.M538_TAG_ID,process.env.M538_ACTOR,process.env.M538_GUILD,Number(process.env.M538_TAG_REVISION));",
    "   process.send({type:'result',mode,ok:true,status:result.status},()=>process.exit(0));",
    "  }catch(error){",
    "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
    "  }",
    " },delay);",
    "});",
    "process.send({type:'ready',mode});"
  ].join('\n'));

  // Each worker owns a separate SQLite connection. The parent connection is
  // closed before the race; both workers signal ready before the shared start.
  database.db.close();
  const outcomes=[];
  for(const item of cases){
    const duelWorker=launch('duel',item.invitation,item.lobby,item.invitee,workerPath);
    await duelWorker.ready;
    const tagWorker=launch('tag',item.invitation,item.lobby,item.invitee,workerPath);
    await tagWorker.ready;
    const startAt=Date.now()+100;
    duelWorker.child.send({type:'go',startAt});
    tagWorker.child.send({type:'go',startAt});
    const results=await Promise.all([duelWorker.result,tagWorker.result]);
    await Promise.all([duelWorker.exited,tagWorker.exited]);
    assert.equal(results.filter(result=>result.ok).length,1,'exactly one mode may win: '+JSON.stringify(results));
    const loser=results.find(result=>!result.ok);
    assert.ok(
      /reservado em um 2v2|já possui um duelo ou convite aberto|database is locked|SQLITE_BUSY/i.test(loser.error||'')||loser.code==='SQLITE_BUSY',
      'the losing transaction must fail closed: '+JSON.stringify(loser)
    );
    outcomes.push(results);
  }

  inspector=new Database(databasePath);
  for(let index=0;index<cases.length;index++){
    const item=cases[index];
    const duelRow=inspector.prepare('SELECT status FROM duels WHERE id=?').get(item.invitation.id);
    const tagRow=inspector.prepare('SELECT status,members FROM tag_sessions WHERE id=?').get(item.lobby.id);
    const inviteeTagMember=JSON.parse(tagRow.members).find(member=>member.id===item.invitee);
    const duelLock=count(inspector,'duel_members',item.invitee);
    const tagLock=count(inspector,'tag_members',item.invitee);
    const duelAccepted=duelRow.status==='playing';
    const tagAccepted=inviteeTagMember.accepted;

    assert.equal(Number(duelAccepted)+Number(tagAccepted),1,'persisted state must have one winner in race '+index);
    assert.equal(duelLock+tagLock,1,'invitee must own exactly one cross-mode lock in race '+index);
    assert.equal(duelLock,duelAccepted?1:0);
    assert.equal(tagLock,tagAccepted?1:0);
    assert.equal(count(inspector,'tag_members',item.host),1,'original TagDuel host lock is preserved');
    assert.equal(count(inspector,'duel_members',item.duelOwner),1,'original 1v1 creator lock is preserved');
  }
  assert.equal(outcomes.length,5);
  assert.deepEqual(assetSnapshot(inspector),beforeAssets,'racing Accept operations never grant or mutate player inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
