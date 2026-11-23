'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m555-tag-discord-expiry-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const db=database.db;
const GUILD='m555-guild',CHANNEL='m555-channel';
const children=new Set();
let inspector;
let beforeAssets;

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  const deck=decks.openDeck(id);
  assert.equal(deck.total,20);
  assert.ok(deck.extraTotal<=5);
  assert.equal(decks.activateDeck(id,1).errors.length,0);
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
      ...process.env,DATABASE_PATH:databasePath,M555_PROJECT_ROOT:process.cwd(),
      M555_MODE:mode,M555_FIXED_NOW:String(fixedNow),M555_TAG_ID:item.tagId,
      M555_ACTOR:item.finalSeat,M555_GUILD:GUILD,M555_REVISION:String(item.revision),
      M555_DEADLINE:String(item.deadline)
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
  const accept=launch('accept',item,item.deadline-1,workerPath);
  const sweep=launch('sweep',item,item.deadline,workerPath);
  await Promise.all([accept.ready,sweep.ready]);
  accept.child.send({type:'go',delayMs:60});
  sweep.child.send({type:'go',delayMs:60});
  const outcomes=await Promise.all([accept.result,sweep.result]);
  await Promise.all([accept.exited,sweep.exited]);
  return outcomes;
}
async function retrySweep(item,workerPath){
  const sweep=launch('sweep',item,item.deadline,workerPath);
  await sweep.ready;
  sweep.child.send({type:'go',delayMs:0});
  const result=await sweep.result;
  await sweep.exited;
  return result;
}
function assertRaceResponses(outcomes){
  assert.equal(outcomes.length,2);
  const accept=outcomes.find(result=>result.mode==='accept');
  const sweep=outcomes.find(result=>result.mode==='sweep');
  assert.ok(accept&&sweep);
  assert.ok(sweep.ok,'TagDuel expiry worker must not leak a transaction failure');
  if(!accept.ok)assert.ok(
    String(accept.code??'').startsWith('SQLITE_BUSY')||
    String(accept.code??'').startsWith('SQLITE_LOCKED')||
    /Convite atualizado ou encerrado|Partida atualizada ou encerrada|database is locked/i.test(accept.error??''),
    'Accept may fail only because expiry won or SQLite serialized the competing transaction: '+JSON.stringify(accept)
  );
  return accept;
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M555_PROJECT_ROOT,mode=process.env.M555_MODE;",
  "Date.now=()=>Number(process.env.M555_FIXED_NOW);",
  "const database=require(path.join(root,'dist/database'));",
  "database.db.pragma('busy_timeout = 5000');",
  "const tag=require(path.join(root,'dist/tagStore'));",
  "const {validateDiscordPayload}=require(path.join(root,'dist/discordPayload'));",
  "const {tagPublicMessage}=require(path.join(root,'dist/tagUI'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(async()=>{",
  "  try{",
  "   let value,refreshedStatus=null;",
  "   if(mode==='accept'){",
  "    const {handleTagComponent}=require(path.join(root,'dist/tagInteraction'));",
  "    const id=process.env.M555_TAG_ID,revision=Number(process.env.M555_REVISION),actor=process.env.M555_ACTOR;",
  "    const interaction={id:'m555-accept',customId:'tag:accept:'+id+':'+revision,guildId:process.env.M555_GUILD,user:{id:actor},values:[],",
  "     deferUpdate:async()=>{},deferReply:async()=>{},editReply:async payload=>{validateDiscordPayload(payload);},reply:async()=>{},followUp:async()=>{}};",
  "    await handleTagComponent(interaction,async record=>{validateDiscordPayload(tagPublicMessage(record));refreshedStatus=record.status;},()=>{});",
  "    value={status:refreshedStatus};",
  "   }else if(mode==='sweep'){",
  "    value=tag.dueTags();",
  "    for(const record of value)validateDiscordPayload(tagPublicMessage(record));",
  "   }else throw new Error('unknown mode: '+mode);",
  "   process.send({type:'result',mode,ok:true,summary:Array.isArray(value)?value.map(row=>({status:row.status,revision:row.revision})):value},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',mode});"
].join('\n'));

const cases=[];
for(let index=0;index<3;index++){
  const ids=['host','seat-1','seat-2','seat-3'].map(part=>'m555-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  let lobby=tag.createTagLobby(ids,GUILD,CHANNEL,'classic-loan');
  lobby=tag.acceptTag(lobby.id,ids[1],GUILD,lobby.revision);
  lobby=tag.acceptTag(lobby.id,ids[2],GUILD,lobby.revision);
  cases.push({
    tagId:lobby.id,ids,finalSeat:ids[3],revision:lobby.revision,
    updated:lobby.updated,deadline:tag.tagDeadline(lobby)
  });
}
beforeAssets=assetSnapshot(db);
db.close();

test('real TagDuel Accept component racing the five-minute sweeper yields either a valid 2v2 or an expired lobby',async()=>{
  const acceptOutcomes=[];
  for(const item of cases){
    const accept=assertRaceResponses(await racePair(item,workerPath));
    acceptOutcomes.push(accept);
    const retry=await retrySweep(item,workerPath);
    assert.ok(retry.ok);
  }
  inspector=new Database(databasePath);
  for(let index=0;index<cases.length;index++){
    const item=cases[index],accept=acceptOutcomes[index];
    const row=inspector.prepare('SELECT status,revision,members,state FROM tag_sessions WHERE id=?').get(item.tagId);
    assert.equal(row.revision,item.revision+1);
    const members=JSON.parse(row.members);
    const locks=item.ids.map(id=>count(inspector,'tag_members',id));
    const duelLocks=item.ids.map(id=>count(inspector,'duel_members',id));
    assert.deepEqual(duelLocks,[0,0,0,0]);
    if(accept.ok){
      assert.equal(accept.summary.status,'playing');
      assert.equal(row.status,'playing');
      assert.ok(row.state);
      assert.ok(members.every(member=>member.accepted));
      assert.deepEqual(locks,[1,1,1,1]);
      const state=JSON.parse(row.state);
      tagEngine.assertTagDuel(state);
      const uids=tagEngine.tagInventory(state).map(card=>card.uid);
      assert.equal(new Set(uids).size,uids.length);
    }else{
      assert.equal(row.status,'expired');
      assert.equal(row.state,null);
      assert.equal(members.filter(member=>member.accepted).length,3);
      assert.deepEqual(locks,[0,0,0,0]);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'TagDuel timeout/Accept races cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
