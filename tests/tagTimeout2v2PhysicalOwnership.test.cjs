'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m521-tag-timeout-2v2-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {
  createTagDuel,tagNormalCardIds,tagInventory,tagMemberHand,
  tagDecisionMember,publicTagDuel,timeoutTagDuel
}=require('../dist/tagDuel');
const {
  getTag,tagDeadline,dueTags,markTagPublished,currentTag,tagEventsAt
}=require('../dist/tagStore');
const GUILD='m521-guild',CHANNEL='m521-channel';
let sequence=0;

function createState(label='classic-timeout'){
  assert.ok(tagNormalCardIds.length>=20,'the enabled normal-monster pool must support a legal 20-card fixture');
  const cards=tagNormalCardIds.slice(0,20);
  const players=[0,1,2,3].map(index=>({
    id:'m521-'+label+'-p'+index,
    name:'Jogador '+index,
    cards:[...cards],
    extra:[]
  }));
  return createTagDuel(players,{seed:'m521-'+label,first:0,classic:true});
}
function memberDeck(state,index){
  const team=index%2;
  return state.active[team]===index
    ?state.core.players[team].deck
    :state.reserves[index].deck;
}
function memberExtra(state,index){
  const team=index%2;
  return state.active[team]===index
    ?(state.core.players[team].extra??[])
    :(state.reserves[index].extra??[]);
}
function physicalSnapshot(state){
  return state.members.map((member,index)=>({
    id:member.id,
    hand:tagMemberHand(state,member.id).map(card=>({uid:card.uid,id:card.id})),
    deck:memberDeck(state,index).map(card=>({uid:card.uid,id:card.id})),
    extra:memberExtra(state,index).map(card=>({uid:card.uid,id:card.id}))
  }));
}
function inventorySnapshot(state){
  return tagInventory(state).map(card=>({uid:card.uid,id:card.id})).sort((a,b)=>a.uid.localeCompare(b.uid));
}
function insertSession({id,status,updated,members,state,rules='classic-loan'}){
  db.prepare(`INSERT INTO tag_sessions
    (id,guild,channel,message,revision,updated,status,members,state,public_revision,rules)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,GUILD,CHANNEL,null,0,updated,status,JSON.stringify(members),state?JSON.stringify(state):null,-1,rules
    );
  for(const member of members.filter(member=>member.accepted)){
    db.prepare('INSERT INTO tag_members VALUES(?,?)').run(member.id,id);
  }
  const record={id,guild:GUILD,channel:CHANNEL,message:null,revision:0,updated,status,members,state,rules,public_revision:-1};
  return record;
}
function recordMembers(state,accepted=[true,true,true,true]){
  return state.members.map((member,index)=>({
    id:member.id,name:member.name,team:member.team,accepted:accepted[index]
  }));
}

test('the 2v2 decision timeout awards the opposing team and preserves all four physical Decks, hands and Extra Decks',()=>{
  const now=Date.now(),state=createState('decision');
  const original=structuredClone(state);
  const actor=tagDecisionMember(state);
  assert.equal(actor.id,state.members[0].id,'first=0 makes physical seat 0 the initial decision player');
  assert.equal(state.core.current,0);
  assert.deepEqual(state.active,[0,1]);
  assert.deepEqual(Object.keys(state.reserves).sort(),['2','3']);

  const beforePhysical=physicalSnapshot(state);
  const beforeInventory=inventorySnapshot(state);
  for(let index=0;index<4;index++){
    const snapshot=beforePhysical[index];
    assert.equal(snapshot.hand.length,4,'each physical participant keeps an independent opening hand');
    assert.equal(snapshot.deck.length+snapshot.hand.length,20,'each Main Deck starts at the legal 20-card minimum');
    assert.ok(snapshot.extra.length<=5,'each physical Extra Deck stays within the owner limit');
    for(const card of [...snapshot.hand,...snapshot.deck,...snapshot.extra]){
      assert.ok(card.uid.startsWith('m'+index+':'),'every card UID remains bound to its physical seat');
    }
  }

  const finished=timeoutTagDuel(state);
  assert.deepEqual(state,original,'timeoutTagDuel must not mutate the caller snapshot');
  assert.equal(finished.core.phase,'finished');
  assert.equal(finished.core.winner,'tag-team-1','the team opposite the required decision wins by W.O.');
  assert.match(finished.core.reason,/W\.O\./i);
  assert.deepEqual(finished.active,state.active,'timeout does not rotate physical representatives');
  assert.deepEqual(finished.reserves,state.reserves,'inactive partners keep their own Deck/hand/Extra references');
  assert.deepEqual(physicalSnapshot(finished),beforePhysical,'all four physical card zones remain byte-for-byte equivalent');
  assert.deepEqual(inventorySnapshot(finished),beforeInventory,'no card is created, lost, transferred or granted');
  const publicView=publicTagDuel(finished);
  const serialized=JSON.stringify(publicView);
  for(const seat of [0,1,2,3])assert.equal(serialized.includes('m'+seat+':'),false,'the public 2v2 view exposes counts, never private UIDs');
  assert.deepEqual(publicView.members.map(member=>member.handCount),[4,4,4,4]);
});

test('the persisted 2v2 timeout finishes exactly at 30 minutes, stores one duelFinished event and releases all four locks',()=>{
  const now=Date.now(),id='m521-playing-'+(++sequence),state=createState('persisted');
  const members=recordMembers(state);
  const record=insertSession({id,status:'playing',updated:now,members,state});
  const message='m521-public-'+sequence;
  const {setTagMessage}=require('../dist/tagStore');
  setTagMessage(id,message,CHANNEL);
  const beforePhysical=physicalSnapshot(state),beforeInventory=inventorySnapshot(state);
  const deadline=tagDeadline({...record,message,public_revision:-1});
  assert.equal(deadline,now+DECISION_TIMEOUT_MS);

  const before= getTag(id,deadline-1);
  assert.equal(before.status,'playing','the old decision remains active one millisecond before the deadline');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,4);

  const finished=getTag(id,deadline);
  assert.equal(finished.status,'finished');
  assert.equal(finished.revision,1);
  assert.equal(finished.state.core.phase,'finished');
  assert.equal(finished.state.core.winner,'tag-team-1');
  assert.deepEqual(physicalSnapshot(finished.state),beforePhysical);
  assert.deepEqual(inventorySnapshot(finished.state),beforeInventory);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
  for(const member of members)assert.equal(currentTag(member.id),undefined,'every human lock is released after the team timeout');
  const events=tagEventsAt(id,finished.revision).filter(event=>event.type==='duelFinished');
  assert.equal(events.length,1);
  assert.equal(events[0].winner,'tag-team-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0,'the timeout fixture never creates player profiles or grants inventory');

  const queued=dueTags().find(item=>item.id===id);
  assert.ok(queued,'the finished 2v2 panel remains queued until its revision is published');
  const publicView=publicTagDuel(queued.state);
  const serialized=JSON.stringify(publicView);
  for(const seat of [0,1,2,3])assert.equal(serialized.includes('m'+seat+':'),false);
  markTagPublished(id,finished.revision);
  assert.equal(dueTags().some(item=>item.id===id),false,'publication acknowledgement clears the terminal queue');
});

test('a 2v2 lobby expiring at five minutes releases every accepted participant lock without creating a duel',()=>{
  const now=Date.now(),id='m521-lobby-'+(++sequence);
  const members=[0,1,2,3].map(index=>({
    id:'m521-lobby-p'+index,name:'Lobby '+index,team:index%2,accepted:index<3
  }));
  const record=insertSession({id,status:'lobby',updated:now,members,state:null});
  const message='m521-lobby-message-'+sequence;
  const {setTagMessage}=require('../dist/tagStore');
  setTagMessage(id,message,CHANNEL);
  const deadline=tagDeadline({...record,message,public_revision:-1});
  assert.equal(deadline,now+5*60_000);

  const before=getTag(id,deadline-1);
  assert.equal(before.status,'lobby');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,3);

  const expired=getTag(id,deadline);
  assert.equal(expired.status,'expired');
  assert.equal(expired.state,null);
  assert.equal(expired.revision,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
  for(const member of members)assert.equal(currentTag(member.id),undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_transition_events WHERE session_id=?').get(id).n,0,
    'an unstarted lobby expiry does not fabricate duel transition events');
  const queued=dueTags().find(item=>item.id===id);
  assert.ok(queued,'the expired lobby panel is queued for terminal publication');
  markTagPublished(id,expired.revision);
  assert.equal(dueTags().some(item=>item.id===id),false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
