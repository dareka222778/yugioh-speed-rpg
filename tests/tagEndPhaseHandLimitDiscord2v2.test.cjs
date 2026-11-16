'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m262-end-phase-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,10);
assert.equal(NORMALS.length,10,'four physical Decks require ten enabled Normal Monsters');
function member(caseKey,seat){return 'm262-'+caseKey+'-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>NORMALS[index%NORMALS.length]);}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function moveDeckCardsToHand(state,seat,count){
  const physical=holder(state,seat);
  for(let i=0;i<count;i++){
    const card=physical.deck.shift();
    assert.ok(card,'the physical Deck must contain the card moved to hand');
    physical.hand.push(card);
  }
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must remain unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'a Discord discard must not create or delete a physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state,ids){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const id of ids)for(const card of tag.tagMemberHand(state,id)){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for '+id+': '+card.uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))),
    'the End Phase discard state must survive persisted JSON restoration');
}
function setup(caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  const players=ids.map((id,seat)=>({id,name:'M262 '+caseKey+' seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m262-'+caseKey});
  // The opening hand is four cards. Seat 0 reaches seven; inactive partner seat 2 has six.
  moveDeckCardsToHand(state,0,3);
  moveDeckCardsToHand(state,2,2);
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  assertPrivateHands(state,ids);
  assertRestorable(state);
  const id='m262-'+caseKey;
  const guild='m262-guild-'+caseKey;
  const channel='m262-channel-'+caseKey;
  const members=ids.map((id,seat)=>({id,name:'M262 '+caseKey+' seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,guild,ids,before,record:store.getTag(id)};
}
function interaction(sessionId,requestId,customId,actor,index,expectedRevision,guildId){
  const calls=[];
  return {
    id:requestId,guildId,user:{id:actor},customId,values:[String(index)],
    isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(sessionId).revision,expectedRevision,
        'Discord must acknowledge the persisted revision before mutation');
      calls.push('defer');
    },
    editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},
    calls
  };
}
async function submit(record,actor,index,requestId){
  const customId='tag:act:'+record.id+':'+record.revision+':'+actor;
  const i=interaction(record.id,requestId,customId,actor,index,record.revision,record.guild);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit'],
    'the real Discord route must acknowledge before editing the private panel');
  assert.ok(refreshes>=1,'the shared public field must refresh after the action');
  return store.getTag(record.id);
}
async function settleThroughDiscord(record,prefix){
  let current=store.getTag(record.id);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'Discord response windows must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const index=actions.findIndex(action=>action.kind==='pass');
    assert.ok(index>=0,'the physical responder must receive a legal pass action');
    current=await submit(current,actor,index,prefix+'-pass-'+guard);
  }
  return current;
}
async function endTurnThroughDiscord(record,actor,requestId){
  const current=store.getTag(record.id);
  assert.equal(tag.tagDecisionMember(current.state).id,actor);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the active physical participant must receive the End Phase action');
  return settleThroughDiscord(await submit(current,actor,index,requestId),requestId);
}
async function discardThroughDiscord(record,actor,cardUid,requestId){
  const current=store.getTag(record.id);
  assert.equal(current.state.core.phase,'discard');
  assert.equal(tag.tagDecisionMember(current.state).id,actor,
    'only the physical owner whose hand overflowed may choose a discard');
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='discard'&&action.card===cardUid);
  assert.ok(index>=0,'the private action list must expose the selected physical hand card');
  const panel=tagPrivateMessage(current,actor);
  validateDiscordPayload(panel);
  const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+actor);
  assert.ok(menu,'the active owner must receive the real Discord discard menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the menu option must retain the exact legal action index');
  return settleThroughDiscord(await submit(current,actor,index,requestId),requestId);
}

test('End Phase Discord menu is private and only the active physical owner can discard to six',async()=>{
  const fixture=setup('active-owner');
  const {id,guild,ids,before}=fixture;
  let current=fixture.record;
  const partnerHandBefore=tag.tagMemberHand(current.state,ids[2]).map(card=>card.uid);
  assert.equal(tag.tagMemberHand(current.state,ids[0]).length,7);
  assert.equal(tag.tagMemberHand(current.state,ids[2]).length,6);

  current=await endTurnThroughDiscord(current,ids[0],'m262-active-end');
  assert.equal(current.state.core.phase,'discard');
  assert.equal(tag.tagDecisionMember(current.state).id,ids[0]);
  assert.equal(tag.tagMemberHand(current.state,ids[0]).length,7);
  assert.equal(tag.tagMemberHand(current.state,ids[2]).length,6);

  const activeActions=tag.tagActions(current.state,ids[0]).filter(action=>action.kind==='discard');
  assert.equal(activeActions.length,7);
  const activePanel=tagPrivateMessage(current,ids[0]);
  validateDiscordPayload(activePanel);
  const activeMenu=activePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+id+':'+current.revision+':'+ids[0]);
  assert.ok(activeMenu);
  assert.equal(activeMenu.options.length,7);

  const partnerPanel=tagPrivateMessage(current,ids[2]);
  validateDiscordPayload(partnerPanel);
  const partnerCustomIds=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .map(component=>component.custom_id);
  assert.ok(!partnerCustomIds.some(customId=>customId.startsWith('tag:act:')),
    'the inactive partner must not receive the active owner discard menu');
  assert.deepEqual(tag.tagActions(current.state,ids[2]),[],
    'the inactive partner has no legal action while seat 0 is discarding');

  const discardIndex=activeActions.findIndex(action=>action.card===tag.tagMemberHand(current.state,ids[0])[0].uid);
  const forged=interaction(id,'m262-forged-partner-discard',
    'tag:act:'+id+':'+current.revision+':'+ids[0],ids[2],discardIndex,current.revision,guild);
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\\./);
  assert.deepEqual(forged.calls,[],'the unauthorized interaction must be rejected before acknowledgement');
  assert.equal(store.getTag(id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(id).state),unchanged,
    'a forged partner action must not mutate the saved duel');

  const discardedUid=tag.tagMemberHand(current.state,ids[0])[0].uid;
  current=await discardThroughDiscord(current,ids[0],discardedUid,'m262-active-discard');
  assert.equal(tag.tagMemberHand(current.state,ids[0]).length,6);
  assert.deepEqual(tag.tagMemberHand(current.state,ids[2]).map(card=>card.uid),partnerHandBefore,
    'the inactive partner hand must remain byte-for-byte unchanged');
  assert.equal(tag.tagDecisionMember(current.state).id,ids[1],
    'the opposing physical seat receives the next turn only after the discard');
  assert.equal(current.state.core.phase,'main');
  assert.ok(tag.tagInventory(current.state).some(card=>card.uid===discardedUid),
    'the discarded card must remain in the duel inventory');
  assertConserved(current.state,before);
  assertPrivateHands(current.state,ids);
  assertRules(current.state);
  assertRestorable(current.state);
});

test('incoming partner draws from its own physical Deck and discards its own excess through Discord',async()=>{
  const fixture=setup('incoming-partner');
  const {id,ids,before}=fixture;
  let current=await endTurnThroughDiscord(fixture.record,ids[0],'m262-seat0-end');
  assert.equal(current.state.core.phase,'discard');
  const seat0Uid=tag.tagMemberHand(current.state,ids[0])[0].uid;
  current=await discardThroughDiscord(current,ids[0],seat0Uid,'m262-seat0-discard');
  assert.equal(tag.tagDecisionMember(current.state).id,ids[1]);

  const seat2DeckBefore=holder(current.state,2).deck.length;
  current=await endTurnThroughDiscord(current,ids[1],'m262-seat1-end');
  assert.equal(tag.tagDecisionMember(current.state).id,ids[2],
    'the inactive partner becomes the next physical seat for its team');
  assert.equal(tag.tagMemberHand(current.state,ids[2]).length,7,
    'the incoming partner draws one card from its own physical Deck');
  assert.equal(holder(current.state,2).deck.length,seat2DeckBefore-1);
  assert.equal(current.state.core.phase,'main');

  const seat0HandBefore=tag.tagMemberHand(current.state,ids[0]).map(card=>card.uid);
  current=await endTurnThroughDiscord(current,ids[2],'m262-seat2-end');
  assert.equal(current.state.core.phase,'discard');
  assert.equal(tag.tagDecisionMember(current.state).id,ids[2]);
  assert.equal(tag.tagMemberHand(current.state,ids[2]).length,7);
  assert.deepEqual(tag.tagMemberHand(current.state,ids[0]).map(card=>card.uid),seat0HandBefore,
    'the inactive teammate hand must not be included in the partner discard');
  const seat2Uid=tag.tagMemberHand(current.state,ids[2])[0].uid;
  current=await discardThroughDiscord(current,ids[2],seat2Uid,'m262-seat2-discard');
  assert.equal(tag.tagMemberHand(current.state,ids[2]).length,6);
  assert.deepEqual(tag.tagMemberHand(current.state,ids[0]).map(card=>card.uid),seat0HandBefore);
  assert.equal(tag.tagDecisionMember(current.state).id,ids[3]);
  assertConserved(current.state,before);
  assertPrivateHands(current.state,ids);
  assertRules(current.state);
  assertRestorable(current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
