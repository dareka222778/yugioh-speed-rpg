'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m554-duel-discord-expiry-race-'));
const databasePath=path.join(folder,'isolated.sqlite');
process.env.DATABASE_PATH=databasePath;
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const Database=require('better-sqlite3');
const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const db=database.db;
const GUILD='m554-guild',CHANNEL='m554-channel';
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
      ...process.env,DATABASE_PATH:databasePath,M554_PROJECT_ROOT:process.cwd(),
      M554_MODE:mode,M554_FIXED_NOW:String(fixedNow),M554_DUEL_ID:item.duelId,
      M554_ACTOR:item.opponent,M554_GUILD:GUILD,M554_REVISION:String(item.revision),
      M554_DEADLINE:String(item.deadline)
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
  assert.ok(sweep.ok,'expiry sweeper must handle the race without an unhandled transaction failure');
  if(!accept.ok)assert.ok(
    String(accept.code??'').startsWith('SQLITE_BUSY')||
    String(accept.code??'').startsWith('SQLITE_LOCKED')||
    /O convite expirou ou já foi respondido|database is locked/i.test(accept.error??''),
    'Accept may fail only because expiry won or SQLite serialized the competing transaction: '+JSON.stringify(accept)
  );
  return accept;
}

const workerPath=path.join(folder,'worker.cjs');
fs.writeFileSync(workerPath,[
  "'use strict';",
  "const path=require('node:path');",
  "const root=process.env.M554_PROJECT_ROOT,mode=process.env.M554_MODE;",
  "Date.now=()=>Number(process.env.M554_FIXED_NOW);",
  "const database=require(path.join(root,'dist/database'));",
  "database.db.pragma('busy_timeout = 5000');",
  "const duel=require(path.join(root,'dist/duelStore'));",
  "const {validateDiscordPayload}=require(path.join(root,'dist/discordPayload'));",
  "const {duelPublicMessage}=require(path.join(root,'dist/duelUI'));",
  "process.on('message',command=>{",
  " if(!command||command.type!=='go')return;",
  " setTimeout(async()=>{",
  "  try{",
  "   let value,refreshedStatus=null,followUpCount=0;",
  "   if(mode==='accept'){",
  "    const {handleDuelComponent}=require(path.join(root,'dist/duelInteraction'));",
  "    const id=process.env.M554_DUEL_ID,revision=Number(process.env.M554_REVISION),actor=process.env.M554_ACTOR;",
  "    const interaction={id:'m554-accept',customId:'duel:accept:'+id+':'+revision,guildId:process.env.M554_GUILD,user:{id:actor},values:[],",
  "     isButton:()=>true,isStringSelectMenu:()=>false,deferUpdate:async()=>{},deferReply:async()=>{},editReply:async()=>{},reply:async()=>{},",
  "     followUp:async payload=>{validateDiscordPayload(payload);followUpCount++;}};",
  "    await handleDuelComponent(interaction,{refreshArena:async record=>{validateDiscordPayload(duelPublicMessage(record));refreshedStatus=record.status;}});",
  "    value={status:refreshedStatus,followUpCount};",
  "   }else if(mode==='sweep'){",
  "    value=duel.expireDueDuels(Number(process.env.M554_DEADLINE));",
  "    for(const record of value)validateDiscordPayload(duelPublicMessage(record));",
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
  const owner='m554-'+index+'-owner',opponent='m554-'+index+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invite=duel.challenge(owner,opponent,GUILD,CHANNEL);
  cases.push({duelId:invite.id,owner,opponent,revision:invite.revision,updated:invite.updated,deadline:invite.updated+120_000});
}
beforeAssets=assetSnapshot(db);
db.close();

test('real 1v1 Accept component racing the 120-second sweeper yields either a valid duel or an expired invitation',async()=>{
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
    const row=inspector.prepare('SELECT status,revision,state,invite FROM duels WHERE id=?').get(item.duelId);
    assert.equal(row.revision,item.revision+1);
    assert.equal(count(inspector,'tag_members',item.owner),0);
    assert.equal(count(inspector,'tag_members',item.opponent),0);
    if(accept.ok){
      assert.equal(accept.summary.status,'playing');
      assert.equal(accept.summary.followUpCount,1);
      assert.equal(row.status,'playing');
      assert.equal(row.invite,null);
      assert.ok(row.state);
      assert.equal(count(inspector,'duel_members',item.owner),1);
      assert.equal(count(inspector,'duel_members',item.opponent),1);
      const state=JSON.parse(row.state);
      assert.deepEqual(new Set(state.players.map(player=>player.id)),new Set([item.owner,item.opponent]));
      const uids=state.players.flatMap(player=>['deck','hand','monsters','backrow','grave','banished','extra'].flatMap(zone=>(player[zone]??[]).map(card=>card.uid)));
      assert.equal(new Set(uids).size,uids.length);
    }else{
      assert.equal(row.status,'expired');
      assert.equal(row.state,null);
      assert.equal(count(inspector,'duel_members',item.owner),0);
      assert.equal(count(inspector,'duel_members',item.opponent),0);
    }
  }
  assert.equal(assetSnapshot(inspector),beforeAssets,'timeout/Accept races cannot mutate player assets or grant inventory');
});

after(()=>{
  for(const child of children)if(child.exitCode===null)child.kill();
  if(inspector?.open)inspector.close();
  if(database?.db?.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
