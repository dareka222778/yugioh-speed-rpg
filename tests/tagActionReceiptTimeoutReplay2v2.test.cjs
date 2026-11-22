'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m525-tag-receipt-timeout-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {
  createTagDuel,tagNormalCardIds,tagActions,tagDecisionMember,
  tagInventory,tagMemberHand,publicTagDuel
}=require('../dist/tagDuel');
const {
  actTag,tagEventsAt,tagDeadline,dueTags,markTagPublished,currentTag,setTagMessage
}=require('../dist/tagStore');
const {tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const GUILD='m525-guild',CHANNEL='m525-channel';

function createState(){
  assert.ok(tagNormalCardIds.length>=20);
  const cards=tagNormalCardIds.slice(0,20);
  const players=[0,1,2,3].map(index=>({
    id:'m525-p'+index,name:'Participante '+index,cards:[...cards],extra:[]
  }));
  return createTagDuel(players,{seed:'m525-receipt-timeout',first:0,classic:true});
}
function physicalSnapshot(state){
  return state.members.map((member,index)=>{
    const team=index%2;
    const held=state.active[team]===index?state.core.players[team]:state.reserves[index];
    return {
      id:member.id,
      hand:tagMemberHand(state,member.id).map(card=>({uid:card.uid,id:card.id})),
      deck:held.deck.map(card=>({uid:card.uid,id:card.id})),
      extra:(held.extra??[]).map(card=>({uid:card.uid,id:card.id}))
    };
  });
}
function inventorySnapshot(state){
  return tagInventory(state).map(card=>({uid:card.uid,id:card.id})).sort((a,b)=>a.uid.localeCompare(b.uid));
}
function insertSession(id,updated,state){
  const members=state.members.map(member=>({id:member.id,name:member.name,team:member.team,accepted:true}));
  db.prepare('INSERT INTO tag_sessions (id,guild,channel,message,revision,updated,status,members,state,public_revision,rules) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    id,GUILD,CHANNEL,null,0,updated,'playing',JSON.stringify(members),JSON.stringify(state),-1,'classic-loan'
  );
  for(const member of members)db.prepare('INSERT INTO tag_members VALUES(?,?)').run(member.id,id);
  return {id,guild:GUILD,channel:CHANNEL,message:null,revision:0,updated,status:'playing',members,state,rules:'classic-loan',public_revision:-1};
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()])));
}

test('a valid duplicate action receipt still replays once but first persists an already-due 2v2 timeout',()=>{
  const now=Date.now(),id='m525-playing',state=createState(),record=insertSession(id,now,state);
  setTagMessage(id,'m525-public-message',CHANNEL);
  const actor=tagDecisionMember(state);
  const actions=tagActions(state,actor.id);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.notEqual(index,-1,'End Turn is a legal, deterministic action for the initial physical seat');
  const requestId='m525-discord-request-unique';
  const beforeAssets=assetSnapshot();
  const first=actTag(id,actor.id,GUILD,record.revision,index,requestId);
  assert.equal(first.status,'playing');
  assert.equal(first.revision,1);
  assert.equal(first.receipt.replayed,false);
  assert.equal(first.receipt.committedRevision,1);
  assert.equal(first.state.core.turn,state.core.turn+1);
  const committedEvents=tagEventsAt(id,first.revision);
  assert.ok(committedEvents.length>0);
  const beforeReplayPhysical=physicalSnapshot(first.state);
  const beforeReplayInventory=inventorySnapshot(first.state);
  const nextActor=tagDecisionMember(first.state);
  const expectedWinner='tag-team-'+(1-nextActor.team);

  const staleUpdated=Date.now()-DECISION_TIMEOUT_MS;
  db.prepare('UPDATE tag_sessions SET updated=? WHERE id=?').run(staleUpdated,id);
  const staleRecord={...first,updated:staleUpdated};
  assert.equal(tagDeadline(staleRecord),Date.now(),'the replay is delivered exactly at the 30-minute deadline');
  const other=first.state.members.find(member=>member.id!==actor.id);

  assert.throws(
    ()=>actTag(id,other.id,GUILD,record.revision,index,requestId),
    /já utilizado por outra solicitação/
  );
  assert.equal(db.prepare('SELECT status FROM tag_sessions WHERE id=?').get(id).status,'playing',
    'a request-ID collision is rejected before any timeout side effect');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,4);

  const replay=actTag(id,actor.id,GUILD,record.revision,index,requestId);
  assert.equal(replay.status,'finished','a valid receipt replay must run the deadline check before returning');
  assert.equal(replay.revision,2);
  assert.equal(replay.state.core.phase,'finished');
  assert.equal(replay.state.core.winner,expectedWinner);
  assert.match(replay.state.core.reason,/W\.O\./i);
  assert.deepEqual(replay.receipt,{
    requestId,committedRevision:1,replayed:true
  });
  assert.equal(replay.state.core.turn,first.state.core.turn,'the already-committed action is not applied twice');
  assert.deepEqual(tagEventsAt(id,1),committedEvents,'the original action event revision is immutable');
  const finishedEvents=tagEventsAt(id,2).filter(event=>event.type==='duelFinished');
  assert.equal(finishedEvents.length,1);
  assert.equal(finishedEvents[0].winner,expectedWinner);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?').get(id).n,1);
  assert.deepEqual(physicalSnapshot(replay.state),beforeReplayPhysical);
  assert.deepEqual(inventorySnapshot(replay.state),beforeReplayInventory);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
  for(const member of state.members)assert.equal(currentTag(member.id),undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);
  assert.deepEqual(assetSnapshot(),beforeAssets);

  const queued=dueTags().find(item=>item.id===id);
  assert.ok(queued,'the W.O. revision is queued for public publication');
  const publicView=publicTagDuel(queued.state);
  const serialized=JSON.stringify(publicView);
  for(let seat=0;seat<4;seat++)assert.equal(serialized.includes('m'+seat+':'),false);
  const payload=tagPublicMessage(queued);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0);
  markTagPublished(id,1);
  assert.ok(dueTags().some(item=>item.id===id),'an ACK for the action revision cannot clear the later timeout revision');
  markTagPublished(id,2);
  assert.equal(dueTags().some(item=>item.id===id),false);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
