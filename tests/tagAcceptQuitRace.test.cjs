'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m550-tag-accept-quit-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const db=database.db;
const GUILD='m550-guild',CHANNEL='m550-channel';
const children=new Set();
let inspector;
let beforeAssets;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=decks.activateDeck(id,1);
  assert.equal(active.total,20);
  assert.ok(active.extraTotal<=5);
  assert.equal(active.errors.length,0);
}
function assetSnapshot(connection){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,connection.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function count(connection,table,owner){
  return connection.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function launch(mode,item,fixedNow,workerPath){
  const child=fork(workerPath,[],{
    cwd:process.cwd(),execArgv:[],stdio:['ignore','ignore','ignore','ipc'],
    env:{
      ...process.env,DATABASE_PATH:databasePath,M550_PROJECT_ROOT:process.cwd(),
      M550_MODE:mode,M550_FIXED_NOW:String(fixedNow),M550_TAG_ID:item.tagId,
      M550_ACTOR:mode==='tag-accept'?item.finalSeat:item.host,
      M550_GUILD:GUILD,M550_REVISION:String(item.revision)
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
    children.delete(child);
    if(!readySeen)readyReject(new Error('worker '+mode+' exited before ready: '+code+'/'+signal));
    if(!resultSeen)resultReject(new Error('worker '+mode+' exited without a result: '+code+'/'+signal));
  });
  return {child,ready,result,exited};
}
async function racePair(item,workerPath){
  const now=item.updated+1_000;
  const accept=launch('tag-accept',item,now,workerPath);
  const quit=launch('tag-quit',item,now,workerPath);
  await Promise.all([accept.ready,quit.ready]);
  accept.child.send({type:'go',delayMs:60});
  quit.child.send({type:'go',delayMs:60});
  const outcomes=await Promise.all([accept.result,quit.result]);
  await Promise.all([accept.exited,quit.exited]);
  return outcomes;
}
function assertOneWinner(outcomes){
  assert.equal(outcomes.length,2);
  assert.equal(outcomes.filter(result=>result.ok).length,1,'Accept and host cancellation must not both commit');
  assert.equal(outcomes.filter(result=>!result.ok).length,1,'the stale competing operation must fail closed');
  const loser=outcomes.find(result=>!result.ok);
  assert.ok(
    String(loser.code??'').startsWith('SQLITE_BUSY')||
    String(loser.code??'').startsWith('SQLITE_LOCKED')||
    /Convite atualizado ou encerrado|Partida atualizada ou encerrada|database is locked/i.test(loser.error??''),
    'only a lock conflict or stale-revision rejection is allowed: '+JSON.stringify(loser)
  );
  return outcomes.find(result=>result.ok);
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M550_PROJECT_ROOT;",
  "const mode=process.env.M550_MODE;",
  "Date.now=()=>Number(process.env.M550_FIXED_NOW);",
  "const database=require(path.join(root,'dist/database'));",
  "database.db.pragma('busy_timeout = 5000');",
  "const tag=require(path.join(root,'dist/tagStore'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(()=>{",
  "  try{",
  "   const value=mode==='tag-accept'",
  "    ?tag.acceptTag(process.env.M550_TAG_ID,process.env.M550_ACTOR,process.env.M550_GUILD,Number(process.env.M550_REVISION))",
  "    :mode==='tag-quit'",
  "     ?tag.quitTag(process.env.M550_TAG_ID,process.env.M550_ACTOR,process.env.M550_GUILD,Number(process.env.M550_REVISION))",
  "     :(()=>{throw new Error('unknown worker mode: '+mode);})();",
  "   process.send({type:'result',mode,ok:true,status:value.status,revision:value.revision},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',mode});"
].join('\n'));

const cases=[];
for(let index=0;index<3;index++){
  const ids=['host','seat-1','seat-2','seat-3'].map(part=>'m550-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  let lobby=tag.createTagLobby(ids,GUILD,CHANNEL,'classic-loan');
  lobby=tag.acceptTag(lobby.id,ids[1],GUILD,lobby.revision);
  lobby=tag.acceptTag(lobby.id,ids[2],GUILD,lobby.revision);
  assert.equal(lobby.revision,2);
  cases.push({
    tagId:lobby.id,ids,host:ids[0],finalSeat:ids[3],
    revision:lobby.revision,updated:lobby.updated
  });
}
beforeAssets=assetSnapshot(db);
db.close();

test('TagDuel final-seat Accept racing host cancellation commits exactly one terminal outcome',async()=>{
  const winners=[];
  for(const item of cases)winners.push(assertOneWinner(await racePair(item,workerPath)));
  inspector=new Database(databasePath);
  for(let index=0;index<cases.length;index++){
    const item=cases[index],winner=winners[index];
    const row=inspector.prepare('SELECT status,revision,members,state FROM tag_sessions WHERE id=?').get(item.tagId);
    assert.equal(row.revision,item.revision+1,'the competing operation advances the lobby revision exactly once');
    const members=JSON.parse(row.members);
    const locks=item.ids.map(id=>count(inspector,'tag_members',id));
    const duelLocks=item.ids.map(id=>count(inspector,'duel_members',id));
    if(winner.mode==='tag-accept'){
      assert.equal(row.status,'playing');
      assert.ok(row.state);
      assert.ok(members.every(member=>member.accepted),'all four physical seats must be accepted');
      assert.deepEqual(locks,[1,1,1,1]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
      const state=JSON.parse(row.state);
      tagEngine.assertTagDuel(state);
      const uids=tagEngine.tagInventory(state).map(card=>card.uid);
      assert.equal(new Set(uids).size,uids.length,'physical card UIDs remain unique after the race');
    }else{
      assert.equal(winner.mode,'tag-quit');
      assert.equal(row.status,'cancelled');
      assert.equal(row.state,null);
      assert.equal(members.filter(member=>member.accepted).length,3);
      assert.deepEqual(locks,[0,0,0,0]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'Accept/cancel races cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
