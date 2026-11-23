'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m542-cross-mode-timeout-discord-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const duel=require('../dist/duelStore');
const tag=require('../dist/tagStore');
const tagEngine=require('../dist/tagDuel');
const duelUI=require('../dist/duelUI');
const tagUI=require('../dist/tagUI');
const duelEngine=require('../dist/duelEngine');
const {handleDuelComponent}=require('../dist/duelInteraction');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;

const GUILD='m542-guild',CHANNEL='m542-channel';
let serial=0;

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
  assert.equal(duel.activeCards(id).cards.length,20);
}
function group(prefix,count){
  return Array.from({length:count},(_,i)=>{
    const id=prefix+'-'+i;
    createDuelist(id);
    return id;
  });
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function count(table,owner){
  return db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner=?').get(owner).n;
}
function components(payload){
  return payload.components.flatMap(row=>row.toJSON().components);
}
function makeInteraction(customId,userId,{button=false,menu=false,values=[]}={}){
  const calls={deferUpdate:0,deferReply:[],editReply:[],reply:[],followUp:[],refresh:[],deferKinds:[]};
  const interaction={
    id:'m542-interaction-'+(++serial),customId,guildId:GUILD,user:{id:userId},values,
    isButton:()=>button,isStringSelectMenu:()=>menu,
    deferReply:async options=>{calls.deferReply.push(options);},
    deferUpdate:async()=>{calls.deferUpdate++;},
    editReply:async payload=>{calls.editReply.push(payload);},
    reply:async payload=>{calls.reply.push(payload);},
    followUp:async payload=>{calls.followUp.push(payload);}
  };
  return {interaction,calls};
}
async function deliverDuel(interaction){
  return handleDuelComponent(interaction,{
    refreshArena:async record=>{},
    privatePayload:async(record,viewer,page)=>duelUI.duelPrivateMessage(record,viewer,page)
  });
}
async function deliverTag(interaction,calls){
  return handleTagComponent(
    interaction,
    async record=>{calls.refresh.push(record);},
    kind=>calls.deferKinds.push(kind)
  );
}
function publishDuel(record){
  duel.setDuelMessage(record.id,CHANNEL,'m542-duel-message-'+(++serial),record.revision);
  duel.markDuelPublished(record.id,record.revision);
}
function publishTag(record){
  tag.setTagMessage(record.id,'m542-tag-message-'+(++serial),CHANNEL);
  return tag.getTag(record.id);
}
function tagCards(state){
  return tagEngine.tagInventory(state).map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}

test('real 1v1 Accept at 120 seconds releases the creator for a TagDuel lobby',async()=>{
  const [owner,opponent,ally1,ally2,ally3]=group('m542-pending-1v1',5);
  const invite=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const payload=duelUI.invitationMessage(invite);
  validateDiscordPayload(payload);
  const accept=components(payload).find(component=>component.custom_id.startsWith('duel:accept:'));
  assert.ok(accept);
  publishDuel(invite);
  const beforeAssets=assetSnapshot();
  const deadline=invite.updated+120_000;
  const delivered=makeInteraction(accept.custom_id,opponent,{button:true});

  await withClock(deadline,async()=>{
    await assert.rejects(deliverDuel(delivered.interaction),/convite expirou ou já foi respondido/i);
  });
  assert.equal(delivered.calls.deferUpdate,1);
  const expired=duel.getDuel(invite.id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);

  const lobby=tag.createTagLobby([owner,ally1,ally2,ally3],GUILD,CHANNEL,'classic-loan');
  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',owner),1);
  assert.equal(assetSnapshot(),beforeAssets);

  const terminal=duel.expireDueDuels(deadline).find(row=>row.id===invite.id);
  assert.ok(terminal,'terminal invitation remains queued until its Discord revision is published');
  const terminalPayload=duelUI.duelPublicMessage(terminal);
  validateDiscordPayload(terminalPayload);
  assert.equal(terminalPayload.components.length,0);
});

test('real 1v1 action menu at 30 minutes ends the duel and releases the creator for TagDuel',async()=>{
  const [owner,opponent,ally1,ally2,ally3]=group('m542-playing-1v1',5);
  const invite=duel.challenge(owner,opponent,GUILD,CHANNEL);
  const started=duel.acceptChallenge(invite.id,opponent,GUILD,invite.revision);
  const actor=started.state.players[duelEngine.decisionPlayer(started.state)].id;
  const privatePayload=duelUI.duelPrivateMessage(started,actor);
  validateDiscordPayload(privatePayload);
  const menu=components(privatePayload).find(component=>component.custom_id.startsWith('duel:act:'));
  assert.ok(menu&&menu.options.length>0);
  publishDuel(started);
  const beforeAssets=assetSnapshot();
  const privateUids=started.state.players.flatMap(player=>player.hand.map(card=>card.uid));
  const deadline=started.updated+duel.DECISION_TIMEOUT_MS;
  const delivered=makeInteraction(menu.custom_id,actor,{menu:true,values:[menu.options[0].value]});

  await withClock(deadline,async()=>deliverDuel(delivered.interaction));
  assert.equal(delivered.calls.deferUpdate,1);
  assert.equal(delivered.calls.editReply.length,1);
  validateDiscordPayload(delivered.calls.editReply[0]);
  assert.equal(delivered.calls.editReply[0].components.length,0);

  const finished=duel.getDuel(started.id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(count('duel_members',owner),0);
  assert.equal(count('duel_members',opponent),0);
  const publicJson=JSON.stringify(delivered.calls.editReply[0]);
  for(const uid of privateUids)assert.equal(publicJson.includes(uid),false);

  const lobby=tag.createTagLobby([owner,ally1,ally2,ally3],GUILD,CHANNEL,'classic-loan');
  assert.equal(lobby.status,'lobby');
  assert.equal(count('tag_members',owner),1);
  assert.equal(assetSnapshot(),beforeAssets);
});

test('real TagDuel Accept at five minutes expires the lobby and releases its host for 1v1',async()=>{
  const [host,invited1,invited2,invited3,opponent]=group('m542-pending-tag',5);
  const created=tag.createTagLobby([host,invited1,invited2,invited3],GUILD,CHANNEL,'classic-loan');
  const lobby=publishTag(created);
  const payload=tagUI.tagPublicMessage(lobby);
  validateDiscordPayload(payload);
  const accept=components(payload).find(component=>component.custom_id.startsWith('tag:accept:'));
  assert.ok(accept);
  const beforeAssets=assetSnapshot();
  const deadline=tag.tagDeadline(lobby);
  const delivered=makeInteraction(accept.custom_id,invited1,{button:true});

  await withClock(deadline,async()=>{
    await assert.rejects(deliverTag(delivered.interaction,delivered.calls),/Convite atualizado ou encerrado/i);
  });
  assert.equal(delivered.calls.deferUpdate,1);
  const expired=tag.getTag(lobby.id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(count('tag_members',host),0);
  assert.equal(count('tag_members',invited1),0);

  const invitation=duel.challenge(host,opponent,GUILD,CHANNEL);
  assert.equal(invitation.status,'pending');
  assert.equal(count('duel_members',host),1);
  assert.equal(assetSnapshot(),beforeAssets);

  const terminal=tag.dueTags().find(row=>row.id===lobby.id);
  assert.ok(terminal,'expired lobby remains queued for terminal publication');
  const terminalPayload=tagUI.tagPublicMessage(terminal);
  validateDiscordPayload(terminalPayload);
  assert.equal(terminalPayload.components.length,0);
});

test('real TagDuel action menu at 30 minutes releases all four physical members for 1v1',async()=>{
  const ids=group('m542-playing-tag',8);
  const [a,b,c,d,e,f,g,h]=ids;
  let lobby=tag.createTagLobby([a,b,c,d],GUILD,CHANNEL,'classic-loan');
  for(const actor of [b,c,d])lobby=tag.acceptTag(lobby.id,actor,GUILD,lobby.revision);
  assert.equal(lobby.status,'playing');
  lobby=publishTag(lobby);
  const actor=tagEngine.tagDecisionMember(lobby.state).id;
  const privatePayload=tagUI.tagPrivateMessage(lobby,actor);
  validateDiscordPayload(privatePayload);
  const menu=components(privatePayload).find(component=>component.custom_id.startsWith('tag:act:'));
  assert.ok(menu&&menu.options.length>0);
  const beforeAssets=assetSnapshot();
  const beforeInventory=tagCards(lobby.state);
  const privateUids=tagEngine.tagMemberHand(lobby.state,actor).map(card=>card.uid);
  const deadline=tag.tagDeadline(lobby);
  const delivered=makeInteraction(menu.custom_id,actor,{menu:true,values:[menu.options[0].value]});

  await withClock(deadline,async()=>{
    await assert.rejects(deliverTag(delivered.interaction,delivered.calls),/Painel desatualizado/i);
  });
  assert.equal(delivered.calls.deferUpdate,1);
  const finished=tag.getTag(lobby.id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(count('tag_members',a)+count('tag_members',b)+count('tag_members',c)+count('tag_members',d),0);
  assert.deepEqual(tagCards(finished.state),beforeInventory);

  const terminal=tag.dueTags().find(row=>row.id===lobby.id);
  assert.ok(terminal);
  const publicPayload=tagUI.tagPublicMessage(terminal);
  validateDiscordPayload(publicPayload);
  assert.equal(publicPayload.components.length,0);
  const publicState=tagEngine.publicTagDuel(terminal.state);
  const publicJson=JSON.stringify(publicState);
  for(const uid of privateUids)assert.equal(publicJson.includes(uid),false);

  for(const [owner,opponent] of [[a,e],[b,f],[c,g],[d,h]]){
    const invitation=duel.challenge(owner,opponent,GUILD,CHANNEL);
    assert.equal(invitation.status,'pending');
    assert.equal(count('duel_members',owner),1);
    assert.equal(count('tag_members',owner),0);
  }
  assert.equal(assetSnapshot(),beforeAssets);
});

after(()=>{
  if(db?.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
