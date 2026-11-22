'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m522-tag-timeout-discord-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {createTagDuel,tagNormalCardIds,tagDecisionMember,tagMemberHand,tagInventory,publicTagDuel}=require('../dist/tagDuel');
const {getTag,tagDeadline,dueTags,markTagPublished,tagEventsAt,currentTag,setTagMessage}=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPublicMessage,tagPrivateMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const GUILD='m522-guild',CHANNEL='m522-channel';
let sequence=0;

async function withClock(now,work){
  const realNow=Date.now;
  Date.now=()=>now;
  try{return await work();}finally{Date.now=realNow;}
}
function createState(){
  assert.ok(tagNormalCardIds.length>=20);
  const cards=tagNormalCardIds.slice(0,20);
  const players=[0,1,2,3].map(index=>({
    id:'m522-p'+index,name:'Participante '+index,cards:[...cards],extra:[]
  }));
  return createTagDuel(players,{seed:'m522-discord-timeout',first:0,classic:true});
}
function recordMembers(state,accepted=[true,true,true,true]){
  return state.members.map((member,index)=>({
    id:member.id,name:member.name,team:member.team,accepted:accepted[index]
  }));
}
function insertSession({id,status,updated,members,state,rules='classic-loan'}){
  db.prepare(`INSERT INTO tag_sessions
    (id,guild,channel,message,revision,updated,status,members,state,public_revision,rules)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,GUILD,CHANNEL,null,0,updated,status,JSON.stringify(members),state?JSON.stringify(state):null,-1,rules
    );
  for(const member of members.filter(p=>p.accepted))db.prepare('INSERT INTO tag_members VALUES(?,?)').run(member.id,id);
  return {id,guild:GUILD,channel:CHANNEL,message:null,revision:0,updated,status,members,state,rules,public_revision:-1};
}
function components(payload){return payload.components.flatMap(row=>row.toJSON().components);}
function makeInteraction(customId,userId,values=[]){
  const calls={deferUpdate:0,editReply:[],reply:[],followUp:[],refresh:[],deferKinds:[]};
  const interaction={
    id:'m522-request-'+(++sequence),customId,guildId:GUILD,user:{id:userId},values,
    deferUpdate:async()=>{calls.deferUpdate++;},
    deferReply:async()=>{throw new Error('Este caminho deve deferir update, não reply.');},
    editReply:async payload=>{calls.editReply.push(payload);},
    reply:async payload=>{calls.reply.push(payload);},
    followUp:async payload=>{calls.followUp.push(payload);}
  };
  return {interaction,calls};
}
function physicalSnapshot(state){
  return state.members.map((member,index)=>{
    const team=index%2;
    const hand=tagMemberHand(state,member.id);
    const held=state.active[team]===index?state.core.players[team]:state.reserves[index];
    return {id:member.id,hand:hand.map(c=>({uid:c.uid,id:c.id})),deck:held.deck.map(c=>({uid:c.uid,id:c.id})),extra:(held.extra??[]).map(c=>({uid:c.uid,id:c.id}))};
  });
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()])));
}

test('the real 2v2 Accept button at five minutes expires the lobby and releases accepted locks without starting a duel',async()=>{
  const now=Date.now(),id='m522-lobby-'+(++sequence);
  const members=[0,1,2,3].map(index=>({id:'m522-lobby-p'+index,name:'Lobby '+index,team:index%2,accepted:index<2}));
  const record=insertSession({id,status:'lobby',updated:now,members,state:null});
  setTagMessage(id,'m522-lobby-message',CHANNEL);
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const accept=components(payload).find(component=>component.custom_id.startsWith('tag:accept:'));
  assert.ok(accept,'the public lobby exposes the real Accept button');
  const beforeAssets=assetSnapshot();
  const deadline=tagDeadline(record);
  assert.equal(deadline,now+5*60_000);
  const delivered=makeInteraction(accept.custom_id,members[2].id);

  await withClock(deadline,async()=>{
    await assert.rejects(handleTagComponent(
      delivered.interaction,
      async r=>{delivered.calls.refresh.push(r);},
      kind=>delivered.calls.deferKinds.push(kind)
    ),/Convite atualizado ou encerrado/);
  });
  assert.equal(delivered.calls.deferUpdate,1);
  assert.deepEqual(delivered.calls.deferKinds,['update']);
  assert.equal(delivered.calls.editReply.length,0);
  assert.equal(delivered.calls.refresh.length,0,'the handler currently leaves terminal publication to dueTags after a rejected Accept');

  const expired=getTag(id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(expired.state,null);
  assert.equal(expired.revision,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
  assert.equal(tagEventsAt(id,expired.revision).length,0);
  for(const member of members)assert.equal(currentTag(member.id),undefined);
  assert.deepEqual(assetSnapshot(),beforeAssets);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);

  const queued=dueTags().find(r=>r.id===id);
  assert.ok(queued,'the terminal lobby remains queued for the public publisher');
  const terminalPayload=tagPublicMessage(queued);
  validateDiscordPayload(terminalPayload);
  assert.equal(terminalPayload.components.length,0,'expired lobbies no longer expose Accept/Cancel controls');
  markTagPublished(id,expired.revision);
  assert.equal(dueTags().some(r=>r.id===id),false);
});

test('the real 2v2 action menu at thirty minutes rejects the late move, persists W.O. and queues a private-safe terminal panel',async()=>{
  const now=Date.now(),id='m522-playing-'+(++sequence),state=createState(),members=recordMembers(state);
  const record=insertSession({id,status:'playing',updated:now,members,state});
  setTagMessage(id,'m522-playing-message',CHANNEL);
  const actor=tagDecisionMember(state).id;
  assert.equal(actor,state.members[0].id);
  const privatePayload=tagPrivateMessage(record,actor);
  validateDiscordPayload(privatePayload);
  const menu=components(privatePayload).find(component=>component.custom_id.startsWith('tag:act:'));
  assert.ok(menu,'the active physical player receives the real private action menu');
  assert.ok(menu.options.length>0);
  const beforePhysical=physicalSnapshot(state);
  const beforeInventory=tagInventory(state).map(c=>({uid:c.uid,id:c.id})).sort((a,b)=>a.uid.localeCompare(b.uid));
  const beforeAssets=assetSnapshot();
  const deadline=tagDeadline(record);
  assert.equal(deadline,now+DECISION_TIMEOUT_MS);
  const delivered=makeInteraction(menu.custom_id,actor,[menu.options[0].value]);

  await withClock(deadline,async()=>{
    await assert.rejects(handleTagComponent(
      delivered.interaction,
      async r=>{delivered.calls.refresh.push(r);},
      kind=>delivered.calls.deferKinds.push(kind)
    ),/Painel desatualizado/);
  });
  assert.equal(delivered.calls.deferUpdate,1);
  assert.deepEqual(delivered.calls.deferKinds,['update']);
  assert.equal(delivered.calls.editReply.length,0);
  assert.equal(delivered.calls.refresh.length,0,'the current handler does not refresh when actTag rejects before its try/finally');

  const finished=getTag(id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(finished.state.core.phase,'finished');
  assert.equal(finished.state.core.winner,'tag-team-1');
  assert.equal(finished.revision,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
  for(const member of members)assert.equal(currentTag(member.id),undefined);
  const events=tagEventsAt(id,finished.revision).filter(event=>event.type==='duelFinished');
  assert.equal(events.length,1);
  assert.equal(events[0].winner,'tag-team-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(delivered.interaction.id).n,0);
  assert.deepEqual(physicalSnapshot(finished.state),beforePhysical);
  assert.deepEqual(tagInventory(finished.state).map(c=>({uid:c.uid,id:c.id})).sort((a,b)=>a.uid.localeCompare(b.uid)),beforeInventory);
  assert.deepEqual(assetSnapshot(),beforeAssets);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);

  const queued=dueTags().find(r=>r.id===id);
  assert.ok(queued,'the W.O. revision remains queued for the public publisher');
  const publicPayload=tagPublicMessage(queued);
  validateDiscordPayload(publicPayload);
  assert.equal(publicPayload.components.length,0,'a finished 2v2 duel has no active controls');
  const publicView=publicTagDuel(queued.state);
  const serialized=JSON.stringify(publicView);
  for(let seat=0;seat<4;seat++)assert.equal(serialized.includes('m'+seat+':'),false,'public state never reveals physical hand UIDs');
  assert.deepEqual(publicView.members.map(member=>member.handCount),[4,4,4,4]);
  markTagPublished(id,finished.revision);
  assert.equal(dueTags().some(r=>r.id===id),false);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
