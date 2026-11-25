'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m549-decline-expiry-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const db=database.db;
const GUILD='m549-guild',CHANNEL='m549-channel';
const children=new Set();
let inspector;
let beforeAssets;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=duel.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
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
function launch(mode,details,fixedNow,workerPath){
  const child=fork(workerPath,[],{
    cwd:process.cwd(),execArgv:[],stdio:['ignore','ignore','ignore','ipc'],
    env:{
      ...process.env,DATABASE_PATH:databasePath,M549_PROJECT_ROOT:process.cwd(),
      M549_MODE:mode,M549_FIXED_NOW:String(fixedNow),M549_DEADLINE:String(details.deadline),
      M549_DUEL_ID:details.duelId??'',M549_TAG_ID:details.tagId??'',
      M549_ACTOR:details.actor??'',M549_GUILD:GUILD,M549_REVISION:String(details.revision??0)
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
async function racePair(actionMode,actionDetails,actionNow,sweepMode,sweepDetails,sweepNow,workerPath){
  const action=launch(actionMode,actionDetails,actionNow,workerPath);
  const sweep=launch(sweepMode,sweepDetails,sweepNow,workerPath);
  await Promise.all([action.ready,sweep.ready]);
  action.child.send({type:'go',delayMs:60});
  sweep.child.send({type:'go',delayMs:60});
  const outcomes=await Promise.all([action.result,sweep.result]);
  await Promise.all([action.exited,sweep.exited]);
  return outcomes;
}
async function retrySweep(mode,details,deadline,workerPath){
  const sweep=launch(mode,details,deadline,workerPath);
  await sweep.ready;
  sweep.child.send({type:'go',delayMs:0});
  const result=await sweep.result;
  await sweep.exited;
  return result;
}
function assertRaceResponses(outcomes,allowedActionErrors){
  assert.equal(outcomes.length,2);
  for(const outcome of outcomes){
    if(outcome.ok)continue;
    assert.ok(
      String(outcome.code??'').startsWith('SQLITE_BUSY')||
      allowedActionErrors.includes(outcome.error),
      'only a transient SQLite busy result or a stale terminal-action rejection is allowed: '+JSON.stringify(outcome)
    );
  }
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M549_PROJECT_ROOT;",
  "const mode=process.env.M549_MODE;",
  "Date.now=()=>Number(process.env.M549_FIXED_NOW);",
  "const duel=require(path.join(root,'dist/duelStore'));",
  "const tag=require(path.join(root,'dist/tagStore'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(()=>{",
  "  try{",
  "   let value;",
  "   if(mode==='duel-decline')value=duel.declineChallenge(process.env.M549_DUEL_ID,process.env.M549_ACTOR,process.env.M549_GUILD);",
  "   else if(mode==='duel-sweep')value=duel.expireDueDuels(Number(process.env.M549_DEADLINE));",
  "   else if(mode==='tag-quit')value=tag.quitTag(process.env.M549_TAG_ID,process.env.M549_ACTOR,process.env.M549_GUILD,Number(process.env.M549_REVISION));",
  "   else if(mode==='tag-sweep')value=tag.dueTags();",
  "   else throw new Error('unknown worker mode: '+mode);",
  "   const summary=Array.isArray(value)?value.map(row=>({status:row.status,revision:row.revision})):({status:value.status,revision:value.revision});",
  "   process.send({type:'result',mode,ok:true,summary},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',mode});"
].join('\n'));

const duelCases=[];
for(let index=0;index<3;index++){
  const ids=['owner','opponent'].map(part=>'m549-duel-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  const invitation=duel.challenge(ids[0],ids[1],GUILD,CHANNEL);
  duelCases.push({duelId:invitation.id,owner:ids[0],opponent:ids[1],deadline:invitation.updated+120_000});
}

const tagCases=[];
for(let index=0;index<3;index++){
  const ids=['host','seat-1','seat-2','seat-3'].map(part=>'m549-tag-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  let lobby=tag.createTagLobby(ids,GUILD,CHANNEL,'classic-loan');
  lobby=tag.acceptTag(lobby.id,ids[1],GUILD,lobby.revision);
  lobby=tag.acceptTag(lobby.id,ids[2],GUILD,lobby.revision);
  tagCases.push({tagId:lobby.id,ids,actor:ids[0],revision:lobby.revision,deadline:tag.tagDeadline(lobby)});
}
beforeAssets=assetSnapshot(db);
db.close();

test('1v1 invitation decline racing the 120-second expiry sweeper settles once and releases both physical locks',async()=>{
  for(const item of duelCases){
    const details={duelId:item.duelId,actor:item.opponent,deadline:item.deadline};
    const outcomes=await racePair('duel-decline',details,item.deadline-1,'duel-sweep',details,item.deadline,workerPath);
    assertRaceResponses(outcomes,['Não é possível cancelar esse convite.']);
    const retry=await retrySweep('duel-sweep',details,item.deadline,workerPath);
    assert.ok(retry.ok);
  }
  inspector=new Database(databasePath);
  for(const item of duelCases){
    const row=inspector.prepare('SELECT status,revision,state FROM duels WHERE id=?').get(item.duelId);
    assert.ok(['declined','expired'].includes(row.status),'race must settle to declined or expired');
    assert.equal(row.revision,1,'the terminal transition is committed exactly once');
    assert.equal(row.state,null);
    assert.equal(count(inspector,'duel_members',item.owner),0);
    assert.equal(count(inspector,'duel_members',item.opponent),0);
    assert.equal(count(inspector,'tag_members',item.owner),0);
    assert.equal(count(inspector,'tag_members',item.opponent),0);
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'decline/expiry cannot mutate player assets or grant inventory');
});

test('TagDuel lobby cancellation racing the five-minute expiry sweeper releases all four physical locks',async()=>{
  for(const item of tagCases){
    const details={tagId:item.tagId,actor:item.actor,revision:item.revision,deadline:item.deadline};
    const outcomes=await racePair('tag-quit',details,item.deadline-1,'tag-sweep',details,item.deadline,workerPath);
    assertRaceResponses(outcomes,['Partida atualizada ou encerrada.']);
    const retry=await retrySweep('tag-sweep',details,item.deadline,workerPath);
    assert.ok(retry.ok);
  }
  for(const item of tagCases){
    const row=inspector.prepare('SELECT status,revision,members,state FROM tag_sessions WHERE id=?').get(item.tagId);
    assert.ok(['cancelled','expired'].includes(row.status),'race must settle to cancelled or expired');
    assert.equal(row.revision,item.revision+1,'the terminal transition is committed exactly once');
    assert.equal(row.state,null);
    assert.equal(JSON.parse(row.members).filter(member=>member.accepted).length,3);
    for(const id of item.ids){
      assert.equal(count(inspector,'tag_members',id),0);
      assert.equal(count(inspector,'duel_members',id),0);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'TagDuel cancel/expiry cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
