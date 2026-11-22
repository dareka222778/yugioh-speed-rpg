'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m520-duel-timeout-discord-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const ui=require('../dist/duelUI');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const guild='m520-guild',channel='m520-channel';
let sequence=0;

async function withClock(now,work){
  const realNow=Date.now;
  Date.now=()=>now;
  try{return await work();}finally{Date.now=realNow;}
}
function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function invitation(label,base){
  const owner='m520-'+label+'-owner',opponent='m520-'+label+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  const record=store.challenge(owner,opponent,guild,channel);
  return {owner,opponent,record};
}
function startDuel(label,base){
  const {owner,opponent,record}=invitation(label,base);
  const started=store.acceptChallenge(record.id,opponent,guild,record.revision);
  return {owner,opponent,invite:record,started};
}
function publish(record){
  store.setDuelMessage(record.id,channel,'m520-message-'+(++sequence),record.revision);
  store.markDuelPublished(record.id,record.revision);
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function makeInteraction(customId,userId,{button=false,menu=false,values=[]}={}){
  const calls={deferUpdate:0,deferReply:[],editReply:[],reply:[],followUp:[]};
  const interaction={
    id:'m520-interaction-'+(++sequence),customId,guildId:guild,user:{id:userId},values,
    isButton:()=>button,isStringSelectMenu:()=>menu,
    deferReply:async options=>{calls.deferReply.push(options);},
    deferUpdate:async()=>{calls.deferUpdate++;},
    editReply:async payload=>{calls.editReply.push(payload);},
    reply:async payload=>{calls.reply.push(payload);},
    followUp:async payload=>{calls.followUp.push(payload);}
  };
  return {interaction,calls};
}
async function deliver(interaction,refresh=()=>{}){
  return handleDuelComponent(interaction,{
    refreshArena:async record=>refresh(record),
    privatePayload:async(record,viewer,page)=>ui.duelPrivateMessage(record,viewer,page)
  });
}
function components(payload){
  return payload.components.flatMap(row=>row.toJSON().components);
}

test('duel:accept at the exact 120-second boundary expires the invitation and never creates a session',async()=>{
  const base=Date.now();
  const data=await withClock(base,async()=>invitation('expired-invite',base));
  const payload=ui.invitationMessage(data.record);
  validateDiscordPayload(payload);
  const accept=components(payload).find(component=>component.custom_id.startsWith('duel:accept:'));
  assert.ok(accept,'the live invitation exposes its real Accept component');
  publish(data.record);
  const beforeAssets=assetSnapshot();
  const deadline=data.record.updated+120_000;
  const delivered=makeInteraction(accept.custom_id,data.opponent,{button:true});

  await withClock(deadline,async()=>{
    await assert.rejects(deliver(delivered.interaction),/convite expirou ou já foi respondido/i);
  });
  assert.equal(delivered.calls.deferUpdate,1,'the component interaction is acknowledged');
  assert.equal(delivered.calls.editReply.length,0);
  assert.equal(delivered.calls.followUp.length,0);

  const expired=store.getDuel(data.record.id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(expired.state,null,'an expired invitation must not create a duel state');
  assert.equal(expired.revision,data.record.revision+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.record.id).n,0);
  assert.equal(store.currentDuel(data.owner),undefined,'the creator lock is released');
  assert.equal(store.currentDuel(data.opponent),undefined,'the invited player never acquired a lock');
  assert.deepEqual(store.duelEventsAt(data.record.id,expired.revision),[],
    'an invitation timeout must not fabricate duel transition events');
  assert.deepEqual(assetSnapshot(),beforeAssets,'the stale Accept component cannot change collections, grants or Decks');

  const queued=store.expireDueDuels(deadline).find(record=>record.id===data.record.id);
  assert.ok(queued,'the terminal invitation remains queued until its revision is published');
  const terminalPayload=ui.duelPublicMessage(queued);
  validateDiscordPayload(terminalPayload);
  assert.equal(terminalPayload.components.length,0,'expired invitations expose no Accept/Decline buttons');
  store.markDuelPublished(data.record.id,expired.revision);
  assert.equal(store.expireDueDuels(deadline).some(record=>record.id===data.record.id),false);
});

test('a decision menu delivered at the exact 30-minute boundary is replaced by the terminal W.O. panel',async()=>{
  const base=Date.now();
  const data=await withClock(base,async()=>startDuel('late-action',base));
  const actorIndex=engine.decisionPlayer(data.started.state);
  const actor=data.started.state.players[actorIndex].id;
  const winner=data.started.state.players.find(player=>player.id!==actor).id;
  const privateUids=data.started.state.players.flatMap(player=>player.hand.map(card=>card.uid));
  const privatePayload=ui.duelPrivateMessage(data.started,actor);
  validateDiscordPayload(privatePayload);
  const actionMenu=components(privatePayload).find(component=>component.custom_id.startsWith('duel:act:'));
  assert.ok(actionMenu,'the active player receives a real private action menu');
  assert.ok(actionMenu.options.length>0,'the action menu contains legal choices');
  publish(data.started);
  const beforeAssets=assetSnapshot();
  const deadline=data.started.updated+store.DECISION_TIMEOUT_MS;
  const delivered=makeInteraction(actionMenu.custom_id,actor,{menu:true,values:[actionMenu.options[0].value]});
  let refreshes=0;

  await withClock(deadline,async()=>deliver(delivered.interaction,()=>{refreshes++;}));
  assert.equal(delivered.calls.deferUpdate,1);
  assert.equal(delivered.calls.editReply.length,1,'the stale component is replaced with the terminal public panel');
  assert.equal(delivered.calls.followUp.length,0);
  assert.equal(refreshes,0,'a terminal stale action is not re-applied or re-published as a new turn');
  validateDiscordPayload(delivered.calls.editReply[0]);
  assert.equal(delivered.calls.editReply[0].components.length,0,'finished duels have no active controls');

  const terminal=store.getDuel(data.started.id,deadline);
  assert.equal(terminal.status,'finished');
  assert.equal(terminal.state.phase,'finished');
  assert.equal(terminal.state.winner,winner,'W.O. belongs to the opponent of the player required to decide');
  assert.match(terminal.state.reason,/W\\.O\\./i);
  assert.equal(terminal.revision,data.started.revision+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(data.started.id).n,0);
  assert.equal(store.currentDuel(data.owner),undefined);
  assert.equal(store.currentDuel(data.opponent),undefined);
  const finished=store.duelEventsAt(data.started.id,terminal.revision).filter(event=>event.type==='duelFinished');
  assert.equal(finished.length,1);
  assert.equal(finished[0].winner,winner);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE request_id=?')
    .get(delivered.interaction.id).n,0,'the late action creates no receipt');
  const serialized=JSON.stringify(delivered.calls.editReply[0]);
  for(const uid of privateUids)assert.equal(serialized.includes(uid),false,'the public W.O. panel never exposes private hand UIDs');
  assert.deepEqual(assetSnapshot(),beforeAssets,'the late action cannot alter economy, collection, starter grants or Decks');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
