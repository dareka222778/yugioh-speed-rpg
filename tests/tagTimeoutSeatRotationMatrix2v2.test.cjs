'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m524-tag-timeout-rotation-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const {DECISION_TIMEOUT_MS}=require('../dist/duelStore');
const {rulesFor}=require('../dist/rulesProfile');
const {
  createTagDuel,tagNormalCardIds,tagInventory,tagMemberHand,
  tagDecisionMember,publicTagDuel
}=require('../dist/tagDuel');
const {
  getTag,tagDeadline,dueTags,markTagPublished,currentTag,tagEventsAt,setTagMessage
}=require('../dist/tagStore');
const {tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const GUILD='m524-guild',CHANNEL='m524-channel';

function createState(first){
  assert.ok(tagNormalCardIds.length>=20);
  const cards=tagNormalCardIds.slice(0,20);
  const players=[0,1,2,3].map(index=>({
    id:'m524-seat-'+first+'-p'+index,
    name:'Jogador '+index,
    cards:[...cards],
    extra:[]
  }));
  return createTagDuel(players,{seed:'m524-rotation-'+first,first,classic:true});
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
function insertSession({id,updated,members,state}){
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

test('persisted 2v2 timeout awards the opposing team for each of the four possible physical decision seats',()=>{
  const beforeAssets=assetSnapshot();
  for(let seat=0;seat<4;seat++){
    const now=Date.now(),id='m524-timeout-seat-'+seat,state=createState(seat);
    const original=structuredClone(state);
    const actor=tagDecisionMember(state);
    assert.equal(actor.id,state.members[seat].id,'first seat must be the actual physical decision owner');
    assert.equal(state.cursor,seat);
    assert.equal(state.core.current,seat%2);
    const seatSnapshots=physicalSnapshot(state);
    for(const snapshot of seatSnapshots){
      assert.equal(snapshot.hand.length,4,'each physical seat starts with four private cards');
      assert.equal(snapshot.deck.length+snapshot.hand.length,20,'each physical Main Deck remains at the legal minimum');
      assert.ok(snapshot.extra.length<=5,'each physical Extra Deck remains within the five-card cap');
    }
    const rules=rulesFor(state.core);
    assert.equal(rules.mainDeckMin,20);
    assert.equal(rules.mainDeckMax,30);
    assert.equal(rules.handLimit,6);
    assert.equal(rules.handCheck,'end','the hand limit is checked in End Phase');
    assert.equal(rules.monsterZones,3,'the shared Monster Zone has three legal slots');
    assert.equal(rules.spellTrapZones,3,'the shared Spell/Trap Zone has three legal slots');
    assert.equal(rules.extraDeckMax,5);
    for(const team of state.core.players)assert.ok(Object.hasOwn(team,'field'),'the Field Zone remains a separate property');

    const members=state.members.map(member=>({id:member.id,name:member.name,team:member.team,accepted:true}));
    const record=insertSession({id,updated:now,members,state});
    setTagMessage(id,'m524-public-'+seat,CHANNEL);
    const deadline=tagDeadline(record);
    assert.equal(deadline,now+DECISION_TIMEOUT_MS);

    const beforePhysical=physicalSnapshot(state);
    const beforeInventory=inventorySnapshot(state);
    const before=getTag(id,deadline-1);
    assert.equal(before.status,'playing','the duel remains active one millisecond before the deadline');
    assert.equal(before.revision,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,4);

    const finished=getTag(id,deadline);
    assert.equal(finished.status,'finished');
    assert.equal(finished.revision,1);
    assert.equal(finished.state.core.phase,'finished');
    assert.equal(finished.state.core.winner,'tag-team-'+(1-(seat%2)),
      'the team opposite the physical seat that owed the decision wins by W.O.');
    assert.match(finished.state.core.reason,/W\.O\./i);
    assert.deepEqual(state,original,'timeout must not mutate the pre-timeout caller snapshot');
    assert.deepEqual(physicalSnapshot(finished.state),beforePhysical,'all four hands, Decks and Extra Decks remain with their physical owners');
    assert.deepEqual(inventorySnapshot(finished.state),beforeInventory,'timeout creates, destroys, transfers or grants no card');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(id).n,0);
    for(const member of members)assert.equal(currentTag(member.id),undefined);

    const terminal=tagEventsAt(id,finished.revision).filter(event=>event.type==='duelFinished');
    assert.equal(terminal.length,1);
    assert.equal(terminal[0].winner,finished.state.core.winner);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE duel_id=?').get(id).n,0);

    const queued=dueTags().find(item=>item.id===id);
    assert.ok(queued,'the terminal panel remains queued for publication');
    const publicView=publicTagDuel(queued.state);
    const serialized=JSON.stringify(publicView);
    for(let physicalSeat=0;physicalSeat<4;physicalSeat++)assert.equal(serialized.includes('m'+physicalSeat+':'),false);
    assert.deepEqual(publicView.members.map(member=>member.handCount),[4,4,4,4]);
    const payload=tagPublicMessage(queued);
    validateDiscordPayload(payload);
    assert.equal(payload.components.length,0,'a finished duel exposes no active controls');

    markTagPublished(id,finished.revision);
    assert.equal(dueTags().some(item=>item.id===id),false);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0);
  assert.deepEqual(assetSnapshot(),beforeAssets,'the rotation matrix never creates or mutates persistent player assets');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
