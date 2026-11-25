'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m523-tag-timeout-publication-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {createTagDuel,tagNormalCardIds,tagInventory,tagMemberHand,publicTagDuel}=require('../dist/tagDuel');
const {dueTags,markTagPublished,tagEventsAt,tagDeadline,setTagMessage,currentTag}=require('../dist/tagStore');
const {tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const GUILD='m523-guild',CHANNEL='m523-channel';
let sequence=0;

async function withClock(now,work){
  const realNow=Date.now;
  Date.now=()=>now;
  try{return await work();}finally{Date.now=realNow;}
}
function insertSession({id,status,updated,members,state,rules='classic-loan'}){
  db.prepare('INSERT INTO tag_sessions (id,guild,channel,message,revision,updated,status,members,state,public_revision,rules) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    id,GUILD,CHANNEL,null,0,updated,status,JSON.stringify(members),state?JSON.stringify(state):null,-1,rules
  );
  for(const member of members.filter(p=>p.accepted))db.prepare('INSERT INTO tag_members VALUES(?,?)').run(member.id,id);
  return {id,guild:GUILD,channel:CHANNEL,message:null,revision:0,updated,status,members,state,rules,public_revision:-1};
}
function createState(){
  assert.ok(tagNormalCardIds.length>=20);
  const cards=tagNormalCardIds.slice(0,20);
  const players=[0,1,2,3].map(index=>({
    id:'m523-p'+index,name:'Participante '+index,cards:[...cards],extra:[]
  }));
  return createTagDuel(players,{seed:'m523-timeout-publication',first:0,classic:true});
}
function physicalSnapshot(state){
  return state.members.map((member,index)=>{
    const team=index%2;
    const hand=tagMemberHand(state,member.id);
    const held=state.active[team]===index?state.core.players[team]:state.reserves[index];
    return {
      id:member.id,
      hand:hand.map(c=>({uid:c.uid,id:c.id})),
      deck:held.deck.map(c=>({uid:c.uid,id:c.id})),
      extra:(held.extra??[]).map(c=>({uid:c.uid,id:c.id}))
    };
  });
}
function inventorySnapshot(state){
  return tagInventory(state).map(c=>({uid:c.uid,id:c.id})).sort((a,b)=>a.uid.localeCompare(b.uid));
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()])));
}
function publicRevision(id){
  return db.prepare('SELECT public_revision FROM tag_sessions WHERE id=?').get(id).public_revision;
}

test('repeated lobby timeout polling is idempotent and a stale publisher acknowledgement cannot clear the terminal revision',async()=>{
  const now=Date.now(),id='m523-lobby-'+(++sequence);
  const members=[0,1,2,3].map(index=>({
    id:'m523-lobby-p'+index,name:'Lobby '+index,team:index%2,accepted:index<2
  }));
  const record=insertSession({id,status:'lobby',updated:now,members,state:null});
  setTagMessage(id,'m523-lobby-message',CHANNEL);
  const beforeAssets=assetSnapshot();
  const deadline=tagDeadline(record);
  assert.equal(deadline,now+5*60_000);

  await withClock(deadline,async()=>{
    const first=dueTags().find(r=>r.id===id);
    assert.ok(first);
    assert.equal(first.status,'expired');
    assert.equal(first.revision,1);
    assert.equal(publicRevision(id),-1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
    for(const member of members)assert.equal(currentTag(member.id),undefined);

    const second=dueTags().find(r=>r.id===id);
    assert.ok(second,'an unacknowledged terminal revision remains queued');
    assert.equal(second.status,'expired');
    assert.equal(second.revision,first.revision,'polling cannot increment an already terminal revision');
    assert.equal(tagEventsAt(id,first.revision).length,0,'lobby expiry creates no duel transition event');

    const payload=tagPublicMessage(second);
    validateDiscordPayload(payload);
    assert.equal(payload.components.length,0,'expired lobby controls are removed');

    markTagPublished(id,first.revision-1);
    assert.equal(publicRevision(id),-1,'a stale publisher acknowledgement is ignored');
    assert.ok(dueTags().some(r=>r.id===id),'the current terminal revision remains queued after a stale acknowledgement');

    markTagPublished(id,first.revision);
    assert.equal(publicRevision(id),first.revision);
    assert.equal(dueTags().some(r=>r.id===id),false,'the matching acknowledgement clears the outbox entry');
    markTagPublished(id,first.revision);
    assert.equal(publicRevision(id),first.revision,'duplicate acknowledgements are harmless');
  });

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);
  assert.deepEqual(assetSnapshot(),beforeAssets);
});

test('repeated 2v2 decision timeout polling persists exactly one W.O. and requires the matching publication revision',async()=>{
  const now=Date.now(),id='m523-playing-'+(++sequence),state=createState();
  const members=state.members.map(p=>({id:p.id,name:p.name,team:p.team,accepted:true}));
  const record=insertSession({id,status:'playing',updated:now,members,state});
  setTagMessage(id,'m523-playing-message',CHANNEL);
  const beforePhysical=physicalSnapshot(state);
  const beforeInventory=inventorySnapshot(state);
  const beforeAssets=assetSnapshot();
  const deadline=tagDeadline(record);
  assert.equal(deadline,now+DECISION_TIMEOUT_MS);

  await withClock(deadline,async()=>{
    const first=dueTags().find(r=>r.id===id);
    assert.ok(first);
    assert.equal(first.status,'finished');
    assert.equal(first.state.core.phase,'finished');
    assert.equal(first.revision,1);
    assert.equal(publicRevision(id),-1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
    for(const member of members)assert.equal(currentTag(member.id),undefined);

    const terminalEvents=tagEventsAt(id,first.revision).filter(event=>event.type==='duelFinished');
    assert.equal(terminalEvents.length,1);
    assert.equal(terminalEvents[0].winner,'tag-team-1');

    const second=dueTags().find(r=>r.id===id);
    assert.ok(second,'the terminal duel remains queued until publication is acknowledged');
    assert.equal(second.revision,first.revision);
    assert.equal(tagEventsAt(id,second.revision).filter(event=>event.type==='duelFinished').length,1,'repeated polling cannot duplicate duelFinished');

    assert.deepEqual(physicalSnapshot(second.state),beforePhysical);
    assert.deepEqual(inventorySnapshot(second.state),beforeInventory);
    const publicView=publicTagDuel(second.state);
    const serialized=JSON.stringify(publicView);
    for(let seat=0;seat<4;seat++)assert.equal(serialized.includes('m'+seat+':'),false,'public projection never exposes physical card UIDs');
    assert.deepEqual(publicView.members.map(member=>member.handCount),[4,4,4,4]);
    const payload=tagPublicMessage(second);
    validateDiscordPayload(payload);
    assert.equal(payload.components.length,0,'a finished 2v2 duel exposes no active controls');

    markTagPublished(id,first.revision-1);
    assert.equal(publicRevision(id),-1,'a stale acknowledgement cannot hide the current W.O. revision');
    assert.ok(dueTags().some(r=>r.id===id));

    markTagPublished(id,first.revision);
    assert.equal(publicRevision(id),first.revision);
    assert.equal(dueTags().some(r=>r.id===id),false);
    markTagPublished(id,first.revision);
    assert.equal(publicRevision(id),first.revision);
    assert.equal(tagEventsAt(id,first.revision).filter(event=>event.type==='duelFinished').length,1);
  });

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);
  assert.deepEqual(assetSnapshot(),beforeAssets);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
