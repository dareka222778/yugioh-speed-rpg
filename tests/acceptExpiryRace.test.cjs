'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m543-accept-expiry-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const db=database.db;

const GUILD='m543-guild',CHANNEL='m543-channel';
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
function duelInventory(state){
  const rows=[];
  for(const player of state.players){
    for(const zone of ['deck','hand','monsters','backrow','grave','banished','extra']){
      for(const card of player[zone]??[])rows.push([card.uid,card.id]);
    }
    if(player.field)rows.push([player.field.uid,player.field.id]);
  }
  return rows;
}
function launch(kind,details,fixedNow,workerPath){
  const child=fork(workerPath,[],{
    cwd:process.cwd(),
    execArgv:[],
    stdio:['ignore','ignore','ignore','ipc'],
    env:{
      ...process.env,
      DATABASE_PATH:databasePath,
      M543_PROJECT_ROOT:process.cwd(),
      M543_KIND:kind,
      M543_FIXED_NOW:String(fixedNow),
      M543_DEADLINE:String(details.deadline),
      M543_DUEL_ID:details.duelId??'',
      M543_TAG_ID:details.tagId??'',
      M543_ACTOR:details.actor??'',
      M543_GUILD:GUILD,
      M543_REVISION:String(details.revision??0)
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
    if(!readySeen)readyReject(new Error('worker '+kind+' exited before ready: '+code+'/'+signal));
    if(!resultSeen)resultReject(new Error('worker '+kind+' exited without a result: '+code+'/'+signal));
  });
  return {child,ready,result,exited};
}
async function racePair(acceptKind,acceptDetails,acceptNow,sweepKind,sweepDetails,sweepNow,workerPath){
  const accept=launch(acceptKind,acceptDetails,acceptNow,workerPath);
  const sweep=launch(sweepKind,sweepDetails,sweepNow,workerPath);
  await Promise.all([accept.ready,sweep.ready]);
  accept.child.send({type:'go',delayMs:80});
  sweep.child.send({type:'go',delayMs:80});
  const outcomes=await Promise.all([accept.result,sweep.result]);
  await Promise.all([accept.exited,sweep.exited]);
  return outcomes;
}
async function retrySweep(kind,details,deadline,workerPath){
  const sweep=launch(kind,details,deadline,workerPath);
  await sweep.ready;
  sweep.child.send({type:'go',delayMs:0});
  const result=await sweep.result;
  await sweep.exited;
  return result;
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M543_PROJECT_ROOT;",
  "const kind=process.env.M543_KIND;",
  "const fixedNow=Number(process.env.M543_FIXED_NOW);",
  "Date.now=()=>fixedNow;",
  "const duel=require(path.join(root,'dist/duelStore'));",
  "const tag=require(path.join(root,'dist/tagStore'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(()=>{",
  "  try{",
  "   let value;",
  "   if(kind==='duel-accept')value=duel.acceptChallenge(process.env.M543_DUEL_ID,process.env.M543_ACTOR,process.env.M543_GUILD,Number(process.env.M543_REVISION));",
  "   else if(kind==='duel-sweep')value=duel.expireDueDuels(Number(process.env.M543_DEADLINE));",
  "   else if(kind==='tag-accept')value=tag.acceptTag(process.env.M543_TAG_ID,process.env.M543_ACTOR,process.env.M543_GUILD,Number(process.env.M543_REVISION));",
  "   else if(kind==='tag-sweep')value=tag.dueTags();",
  "   else throw new Error('unknown worker kind: '+kind);",
  "   const summary=Array.isArray(value)?value.map(row=>({status:row.status,revision:row.revision})):({status:value.status,revision:value.revision});",
  "   process.send({type:'result',kind,ok:true,summary},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',kind,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',kind});"
].join('\n'));

const duelCases=[];
for(let index=0;index<3;index++){
  const ids=['owner','opponent','ally-1','ally-2','ally-3'].map(part=>'m543-duel-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  const invitation=duel.challenge(ids[0],ids[1],GUILD,CHANNEL);
  duelCases.push({
    duelId:invitation.id,
    owner:ids[0],
    opponent:ids[1],
    allies:ids.slice(2),
    revision:invitation.revision,
    deadline:invitation.updated+120_000
  });
}

const tagCases=[];
for(let index=0;index<3;index++){
  const ids=['host','seat-1','seat-2','seat-3','opponent'].map(part=>'m543-tag-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  let lobby=tag.createTagLobby(ids.slice(0,4),GUILD,CHANNEL,'classic-loan');
  lobby=tag.acceptTag(lobby.id,ids[1],GUILD,lobby.revision);
  lobby=tag.acceptTag(lobby.id,ids[2],GUILD,lobby.revision);
  tagCases.push({
    tagId:lobby.id,
    ids,
    actor:ids[3],
    revision:lobby.revision,
    deadline:tag.tagDeadline(lobby)
  });
}
beforeAssets=assetSnapshot(db);
db.close();

test('1v1 final Accept racing the 120-second expiry sweeper never leaves a partial invitation or orphan lock',async()=>{
  const outcomes=[];
  for(const item of duelCases){
    const details={duelId:item.duelId,actor:item.opponent,revision:item.revision,deadline:item.deadline};
    const race=await racePair(
      'duel-accept',details,item.deadline-1,
      'duel-sweep',details,item.deadline,
      workerPath
    );
    outcomes.push(race);
    await retrySweep('duel-sweep',details,item.deadline,workerPath);
  }
  inspector=new Database(databasePath);
  for(const item of duelCases){
    const row=inspector.prepare('SELECT status,revision,state,invite FROM duels WHERE id=?').get(item.duelId);
    assert.ok(['playing','expired'].includes(row.status),'race must settle to playing or expired');
    const ownerLock=count(inspector,'duel_members',item.owner);
    const opponentLock=count(inspector,'duel_members',item.opponent);
    const ownerTagLock=count(inspector,'tag_members',item.owner);
    const opponentTagLock=count(inspector,'tag_members',item.opponent);
    if(row.status==='playing'){
      assert.ok(row.state);
      assert.equal(row.invite,null);
      assert.equal(ownerLock,1);
      assert.equal(opponentLock,1);
      assert.equal(ownerTagLock,0);
      assert.equal(opponentTagLock,0);
      const state=JSON.parse(row.state);
      const uids=duelInventory(state).map(card=>card[0]);
      assert.equal(new Set(uids).size,uids.length,'all physical card UIDs remain unique after accepted race');
    }else{
      assert.equal(row.state,null);
      assert.ok(row.invite);
      assert.equal(ownerLock,0);
      assert.equal(opponentLock,0);
      assert.equal(ownerTagLock,0);
      assert.equal(opponentTagLock,0);
    }
  }
  assert.equal(outcomes.length,3);
  assert.equal(assetSnapshot(inspector),beforeAssets,'Accept/expiry races cannot mutate player assets or grant inventory');
});

test('TagDuel fourth-seat Accept racing the five-minute lobby expiry never leaves a partially started team or orphan lock',async()=>{
  const outcomes=[];
  for(const item of tagCases){
    const details={tagId:item.tagId,actor:item.actor,revision:item.revision,deadline:item.deadline};
    const race=await racePair(
      'tag-accept',details,item.deadline-1,
      'tag-sweep',details,item.deadline,
      workerPath
    );
    outcomes.push(race);
    await retrySweep('tag-sweep',details,item.deadline,workerPath);
  }
  for(const item of tagCases){
    const row=inspector.prepare('SELECT status,revision,members,state FROM tag_sessions WHERE id=?').get(item.tagId);
    assert.ok(['playing','expired'].includes(row.status),'race must settle to playing or expired');
    const members=JSON.parse(row.members);
    const locks=item.ids.slice(0,4).map(id=>count(inspector,'tag_members',id));
    const duelLocks=item.ids.slice(0,4).map(id=>count(inspector,'duel_members',id));
    if(row.status==='playing'){
      assert.ok(row.state);
      assert.ok(members.every(member=>member.accepted),'all four seats must be accepted atomically');
      assert.deepEqual(locks,[1,1,1,1]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
      const state=JSON.parse(row.state);
      tagEngine.assertTagDuel(state);
      const uids=tagEngine.tagInventory(state).map(card=>card.uid);
      assert.equal(new Set(uids).size,uids.length,'physical card UIDs remain unique after the final-seat race');
    }else{
      assert.equal(row.state,null);
      assert.deepEqual(locks,[0,0,0,0]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
      assert.equal(members.filter(member=>member.accepted).length,3,'host and two earlier seats remain recorded, but no partial lock survives expiry');
    }
  }
  assert.equal(outcomes.length,3);
  assert.equal(assetSnapshot(inspector),beforeAssets,'TagDuel expiry/Accept races cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
