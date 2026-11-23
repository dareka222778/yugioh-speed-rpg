'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m552-tag-discord-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const db=database.db;
const GUILD='m552-guild',CHANNEL='m552-channel';
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
      ...process.env,DATABASE_PATH:databasePath,M552_PROJECT_ROOT:process.cwd(),
      M552_MODE:mode,M552_FIXED_NOW:String(fixedNow),M552_TAG_ID:item.tagId,
      M552_ACTOR:mode==='accept'?item.finalSeat:item.host,
      M552_GUILD:GUILD,M552_REVISION:String(item.revision)
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
  const accept=launch('accept',item,now,workerPath);
  const cancel=launch('cancel',item,now,workerPath);
  await Promise.all([accept.ready,cancel.ready]);
  accept.child.send({type:'go',delayMs:60});
  cancel.child.send({type:'go',delayMs:60});
  const outcomes=await Promise.all([accept.result,cancel.result]);
  await Promise.all([accept.exited,cancel.exited]);
  return outcomes;
}
function assertOneHandlerWins(outcomes){
  assert.equal(outcomes.length,2);
  assert.equal(outcomes.filter(result=>result.ok).length,1,'the real Discord handlers must not both commit');
  assert.equal(outcomes.filter(result=>!result.ok).length,1,'the stale competing component must fail closed');
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
  "const root=process.env.M552_PROJECT_ROOT;",
  "const mode=process.env.M552_MODE;",
  "Date.now=()=>Number(process.env.M552_FIXED_NOW);",
  "const database=require(path.join(root,'dist/database'));",
  "database.db.pragma('busy_timeout = 5000');",
  "const {handleTagComponent}=require(path.join(root,'dist/tagInteraction'));",
  "const {validateDiscordPayload}=require(path.join(root,'dist/discordPayload'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(async()=>{",
  "  try{",
  "   const actor=process.env.M552_ACTOR,id=process.env.M552_TAG_ID,revision=Number(process.env.M552_REVISION);",
  "   const interaction={",
  "    id:'m552-'+mode,customId:'tag:'+mode+':'+id+':'+revision,guildId:process.env.M552_GUILD,user:{id:actor},values:[],",
  "    deferUpdate:async()=>{},deferReply:async()=>{},reply:async()=>{},followUp:async()=>{},",
  "    editReply:async payload=>{validateDiscordPayload(payload);interaction.editComponents=payload.components.length;}",
  "   };",
  "   let refreshedStatus=null;",
  "   await handleTagComponent(interaction,async record=>{refreshedStatus=record.status;},()=>{});",
  "   process.send({type:'result',mode,ok:true,status:refreshedStatus,editComponents:interaction.editComponents??null},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',mode});"
].join('\n'));

const cases=[];
for(let index=0;index<3;index++){
  const ids=['host','seat-1','seat-2','seat-3'].map(part=>'m552-'+index+'-'+part);
  for(const id of ids)createDuelist(id);
  let lobby=tag.createTagLobby(ids,GUILD,CHANNEL,'classic-loan');
  lobby=tag.acceptTag(lobby.id,ids[1],GUILD,lobby.revision);
  lobby=tag.acceptTag(lobby.id,ids[2],GUILD,lobby.revision);
  cases.push({tagId:lobby.id,ids,host:ids[0],finalSeat:ids[3],revision:lobby.revision,updated:lobby.updated});
}
beforeAssets=assetSnapshot(db);
db.close();

test('real TagDuel Discord Accept and Cancel handlers race on the same revision and commit exactly one outcome',async()=>{
  const winners=[];
  for(const item of cases)winners.push(assertOneHandlerWins(await racePair(item,workerPath)));
  inspector=new Database(databasePath);
  for(let index=0;index<cases.length;index++){
    const item=cases[index],winner=winners[index];
    const row=inspector.prepare('SELECT status,revision,members,state FROM tag_sessions WHERE id=?').get(item.tagId);
    assert.equal(row.revision,item.revision+1);
    const members=JSON.parse(row.members);
    const locks=item.ids.map(id=>count(inspector,'tag_members',id));
    const duelLocks=item.ids.map(id=>count(inspector,'duel_members',id));
    assert.equal(winner.status,winner.mode==='accept'?'playing':'cancelled','the handler winner and persisted terminal state must agree');
    if(winner.mode==='accept'){
      assert.equal(row.status,'playing');
      assert.ok(row.state);
      assert.ok(members.every(member=>member.accepted));
      assert.deepEqual(locks,[1,1,1,1]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
      const state=JSON.parse(row.state);
      tagEngine.assertTagDuel(state);
      const uids=tagEngine.tagInventory(state).map(card=>card.uid);
      assert.equal(new Set(uids).size,uids.length);
    }else{
      assert.equal(winner.mode,'cancel');
      assert.equal(row.status,'cancelled');
      assert.equal(row.state,null);
      assert.equal(members.filter(member=>member.accepted).length,3);
      assert.deepEqual(locks,[0,0,0,0]);
      assert.deepEqual(duelLocks,[0,0,0,0]);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'real component handlers cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
