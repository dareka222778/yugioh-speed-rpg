'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m553-duel-discord-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const db=database.db;
const GUILD='m553-guild',CHANNEL='m553-channel';
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
function launch(mode,item,fixedNow,workerPath){
  const child=fork(workerPath,[],{
    cwd:process.cwd(),execArgv:[],stdio:['ignore','ignore','ignore','ipc'],
    env:{
      ...process.env,DATABASE_PATH:databasePath,M553_PROJECT_ROOT:process.cwd(),
      M553_MODE:mode,M553_FIXED_NOW:String(fixedNow),M553_DUEL_ID:item.duelId,
      M553_ACTOR:mode==='accept'?item.opponent:item.declineActor,
      M553_GUILD:GUILD,M553_REVISION:String(item.revision)
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
  const decline=launch('decline',item,now,workerPath);
  await Promise.all([accept.ready,decline.ready]);
  accept.child.send({type:'go',delayMs:60});
  decline.child.send({type:'go',delayMs:60});
  const outcomes=await Promise.all([accept.result,decline.result]);
  await Promise.all([accept.exited,decline.exited]);
  return outcomes;
}
function assertOneHandlerWins(outcomes){
  assert.equal(outcomes.length,2);
  assert.equal(outcomes.filter(result=>result.ok).length,1,'the real 1v1 component handlers must not both commit');
  assert.equal(outcomes.filter(result=>!result.ok).length,1,'the stale competing component must fail closed');
  const loser=outcomes.find(result=>!result.ok);
  assert.ok(
    String(loser.code??'').startsWith('SQLITE_BUSY')||
    String(loser.code??'').startsWith('SQLITE_LOCKED')||
    /O convite expirou ou já foi respondido|Não é possível cancelar esse convite|database is locked/i.test(loser.error??''),
    'only a lock conflict or stale-invitation rejection is allowed: '+JSON.stringify(loser)
  );
  return outcomes.find(result=>result.ok);
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M553_PROJECT_ROOT;",
  "const mode=process.env.M553_MODE;",
  "Date.now=()=>Number(process.env.M553_FIXED_NOW);",
  "const database=require(path.join(root,'dist/database'));",
  "database.db.pragma('busy_timeout = 5000');",
  "const {handleDuelComponent}=require(path.join(root,'dist/duelInteraction'));",
  "const {duelPublicMessage}=require(path.join(root,'dist/duelUI'));",
  "const {validateDiscordPayload}=require(path.join(root,'dist/discordPayload'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(async()=>{",
  "  try{",
  "   const actor=process.env.M553_ACTOR,id=process.env.M553_DUEL_ID,revision=Number(process.env.M553_REVISION);",
  "   let refreshedStatus=null,followUpCount=0;",
  "   const interaction={",
  "    id:'m553-'+mode,customId:'duel:'+mode+':'+id+':'+revision,guildId:process.env.M553_GUILD,user:{id:actor},values:[],",
  "    isButton:()=>true,isStringSelectMenu:()=>false,deferUpdate:async()=>{},deferReply:async()=>{},editReply:async()=>{},reply:async()=>{},",
  "    followUp:async payload=>{validateDiscordPayload(payload);followUpCount++;}",
  "   };",
  "   await handleDuelComponent(interaction,{refreshArena:async record=>{validateDiscordPayload(duelPublicMessage(record));refreshedStatus=record.status;}});",
  "   process.send({type:'result',mode,ok:true,status:refreshedStatus,followUpCount},()=>process.exit(0));",
  "  }catch(error){",
  "   process.send({type:'result',mode,ok:false,error:String(error&&error.message||error),code:error&&error.code||null},()=>process.exit(0));",
  "  }",
  " },Math.max(0,Number(command.delayMs)||0));",
  "});",
  "process.send({type:'ready',mode});"
].join('\n'));

const cases=[];
for(let index=0;index<3;index++){
  const owner='m553-'+index+'-owner',opponent='m553-'+index+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invite=duel.challenge(owner,opponent,GUILD,CHANNEL);
  cases.push({
    duelId:invite.id,owner,opponent,
    declineActor:index%2===0?owner:opponent,
    revision:invite.revision,updated:invite.updated
  });
}
beforeAssets=assetSnapshot(db);
db.close();

test('real 1v1 Discord Accept and Decline handlers race on the same invitation revision and commit exactly one outcome',async()=>{
  const winners=[];
  for(const item of cases)winners.push(assertOneHandlerWins(await racePair(item,workerPath)));
  inspector=new Database(databasePath);
  for(let index=0;index<cases.length;index++){
    const item=cases[index],winner=winners[index];
    const row=inspector.prepare('SELECT status,revision,state,invite FROM duels WHERE id=?').get(item.duelId);
    assert.equal(row.revision,item.revision+1,'only one terminal decision may advance the revision');
    assert.equal(winner.status,winner.mode==='accept'?'playing':'declined');
    const ownerLocks=count(inspector,'duel_members',item.owner);
    const opponentLocks=count(inspector,'duel_members',item.opponent);
    assert.equal(count(inspector,'tag_members',item.owner),0);
    assert.equal(count(inspector,'tag_members',item.opponent),0);
    if(winner.mode==='accept'){
      assert.equal(row.status,'playing');
      assert.equal(row.invite,null);
      assert.ok(row.state);
      assert.equal(winner.followUpCount,1,'the real Accept handler sends its private success acknowledgement');
      assert.equal(ownerLocks,1);
      assert.equal(opponentLocks,1);
      const state=JSON.parse(row.state);
      const ids=state.players.map(player=>player.id);
      assert.equal(new Set(ids).size,2);
      assert.deepEqual(new Set(ids),new Set([item.owner,item.opponent]));
      const uids=duelInventory(state).map(card=>card[0]);
      assert.equal(new Set(uids).size,uids.length);
    }else{
      assert.equal(winner.mode,'decline');
      assert.equal(row.status,'declined');
      assert.equal(row.state,null);
      assert.equal(winner.followUpCount,0);
      assert.equal(ownerLocks,0);
      assert.equal(opponentLocks,0);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'real 1v1 component handlers cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
