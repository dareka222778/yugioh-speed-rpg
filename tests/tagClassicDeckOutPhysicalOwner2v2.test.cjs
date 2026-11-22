'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'m496-tag-deckout-'));
process.env.DATABASE_PATH=path.join(temp,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {rulesFor}=require('../dist/rulesProfile');
const {getPlayableCard}=require('../dist/effectRegistry');

const ids=tag.tagNormalCardIds
  .filter(id=>(getPlayableCard(id).level??0)<=4)
  .slice(0,10)
  .flatMap(id=>[id,id]);
assert.equal(ids.length,20,'each physical participant must begin with a legal 20-card Main Deck');

let serial=0;
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:'m496-seat-'+seat,
    name:'M496 Seat '+seat,
    cards:[...ids]
  }));
  const state=tag.createTagDuel(players,{seed:'m496-incoming-seat-deckout',first:3,classic:true});
  assert.deepEqual(state.active,[0,3]);
  assert.equal(state.cursor,3);
  assert.equal(tag.tagDecisionMember(state).id,'m496-seat-3');
  assert.equal(state.core.players[0].deck.length,16);
  assert.equal(state.reserves[2].deck.length,16);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  return state;
}
function exhaustIncomingPhysicalSeat(state){
  // Seat 0 is the next decision owner. Its partner (seat 2) still has a
  // separate 16-card physical Deck in the reserve and must not lend it.
  assert.equal(state.active[0],0);
  assert.equal(state.cursor,3);
  const exhausted=state.core.players[0].deck.splice(0);
  assert.equal(exhausted.length,16);
  state.core.players[0].grave.push(...exhausted);
  assert.equal(state.core.players[0].deck.length,0);
  assert.equal(state.reserves[2].deck.length,16);
  tag.assertTagDuel(state);
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Main Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function register(state){
  const id='m496-deckout-'+(++serial);
  const members=state.members.map(member=>({...member,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m496-guild','m496-channel','m496-message',0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function economySnapshot(){
  return JSON.stringify({
    players:database.db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
    cards:database.db.prepare('SELECT * FROM player_cards ORDER BY discord_id,card_key').all()
  });
}
function publicHasNoPrivateUids(record){
  const payload=ui.tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(let seat=0;seat<4;seat++){
    for(const card of tag.tagMemberHand(record.state,'m496-seat-'+seat)){
      assert.ok(!rendered.includes(card.uid),'public Discord payload leaked private hand UID '+card.uid);
    }
  }
  return payload;
}

test('incoming physical seat loses on deck-out; the active teammate deck is never substituted',()=>{
  let state=exhaustIncomingPhysicalSeat(game());
  const before=inventorySnapshot(state);
  const actor=tag.tagDecisionMember(state).id;
  const end=tag.tagActions(state,actor).find(action=>action.kind==='end');
  assert.ok(end,'the outgoing seat must have its legal End action');

  state=tag.stepTagDuel(state,actor,end);

  assert.equal(state.core.phase,'finished');
  assert.equal(state.core.winner,'tag-team-1','the team whose turn did not draw wins');
  assert.match(state.core.reason,/comprar/i);
  assert.equal(state.active[0],0,'the incoming physical seat remains the team representative');
  assert.equal(state.core.players[0].deck.length,0);
  assert.equal(state.reserves[2].deck.length,16,'the partner deck must remain untouched');
  assert.equal(tag.tagMemberHand(state,'m496-seat-0').length,4);
  assert.equal(tag.tagMemberHand(state,'m496-seat-2').length,4);
  assertInventoryConserved(state,before);
  tag.assertTagDuel(JSON.parse(JSON.stringify(state)));
});

test('Discord End action persists deck-out once and publishes a private-UID-free terminal panel',async()=>{
  const state=exhaustIncomingPhysicalSeat(game());
  const before=inventorySnapshot(state);
  const economy=economySnapshot();
  const record=register(state);
  const actor=tag.tagDecisionMember(record.state).id;
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the current physical representative must be able to end the turn');

  const privatePanel=ui.tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(privatePanel);
  const components=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),'the menu must expose the exact End action index');

  const calls=[];
  const interaction={
    id:'m496-deckout-request-'+serial,
    guildId:record.guild,
    user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
    values:[String(index)],
    isButton:()=>false,
    isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(record.id).revision,record.revision,
        'Discord acknowledgement must precede the persisted mutation');
      calls.push('defer');
    },
    editReply:async payload=>{
      validateDiscordPayload(payload);
      calls.push('edit');
    }
  };
  let refreshes=0;
  await handleTagComponent(interaction,async next=>{
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  },()=>{});

  const done=store.getTag(record.id);
  assert.deepEqual(calls,['defer','edit']);
  assert.equal(refreshes,1);
  assert.equal(done.status,'finished');
  assert.equal(done.revision,record.revision+1);
  assert.equal(done.state.core.winner,'tag-team-1');
  assert.equal(done.state.core.players[0].deck.length,0);
  assert.equal(done.state.reserves[2].deck.length,16);
  const events=store.tagEventsAt(done.id,done.revision);
  assert.equal(events.filter(event=>event.type==='duelFinished').length,1,
    'the terminal result must be journaled exactly once');

  const publicPanel=publicHasNoPrivateUids(done);
  assert.deepEqual(publicPanel.components,[],'finished games must not retain actionable Discord controls');
  assertInventoryConserved(done.state,before);
  assert.equal(economySnapshot(),economy,'the duel must not mutate player economy or collection');
});

after(()=>{
  try{database.db.close();}catch{}
  fs.rmSync(temp,{recursive:true,force:true});
});
