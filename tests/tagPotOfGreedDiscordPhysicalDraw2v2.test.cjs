'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m303-pot-of-greed-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M303 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const POT_OF_GREED='55144522';
assert.equal(getPlayableCard(POT_OF_GREED)?.kind,'spell');
assert.equal(getEffect(POT_OF_GREED)?.kind,'potOfGreed');
assert.equal(getCardStatus(POT_OF_GREED)?.stage,'certified');
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');

function member(seat){return 'm303-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct cards');
  return ids.slice(0,20);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M303 physical card missing from seat '+seat+': '+id);
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
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
function interaction(record,userId,index,requestId,actionOwner=userId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:userId},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actionOwner,
    values:[String(index)],isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(record.id).revision,record.revision);
      calls.push('defer');
    },
    editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},
    calls
  };
}
async function submit(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'the active physical representative must receive a real private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public duel panel must refresh after the committed action');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index){
  const forged=interaction(record,partner,index,'m303-pot-of-greed-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M303 Seat '+seat,cards:deck(seat===0?[POT_OF_GREED]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m303-pot-of-greed-discord'});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0),'seat 0 must be the active Main Phase representative');
  const pot=takePhysical(state,0,POT_OF_GREED);
  holder(state,0).hand.push(pot);
  const physical=holder(state,0);
  while(physical.hand.length<6){
    const [card]=physical.deck.splice(0,1);
    assert.ok(card,'the active physical Deck must provide a card to prepare the six-card hand');
    physical.hand.push(card);
  }
  assert.equal(physical.hand.length,6,'the active physical player begins at the six-card hand limit');
  const topTwo=physical.deck.slice(0,2).map(card=>({uid:card.uid,id:card.id}));
  assert.equal(topTwo.length,2,'the active physical Deck must have two cards available to draw');
  const partnerDeckBefore=holder(state,2).deck.map(card=>card.uid);
  const partnerHandBefore=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const before=inventory(state);
  assert.match(pot.uid,/^m0:/,'Pot of Greed retains active physical seat 0 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m303-pot-of-greed',guild='m303-guild',channel='m303-channel';
  const members=ids.map((id,seat)=>({id,name:'M303 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {pot,topTwo,partnerDeckBefore,partnerHandBefore,before,record:store.getTag(id)};
}
test('Pot of Greed draws exactly two cards from the active physical Deck through the Discord Spell menu',async()=>{
  const fixture=setup();
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.pot.uid);
  assert.ok(index>=0,'the active representative must receive the legal Pot of Greed Spell action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical partner cannot execute the Main Phase Spell');
  await rejectInactivePartner(fixture.record,actor,member(2),index);
  const current=await submit(fixture.record,actor,index,'m303-pot-of-greed-activate');
  const state=current.state;
  assert.equal(state.core.phase,'main','Pot of Greed resolves during the Main Phase');
  const activeHand=tag.tagMemberHand(state,actor);
  for(const card of fixture.topTwo){
    assert.ok(activeHand.some(entry=>entry.uid===card.uid&&entry.id===card.id),
      'the active physical representative draws the exact top Deck UID '+card.uid);
  }
  assert.equal(activeHand.length,7,
    'the Main Phase may temporarily exceed six cards; the limit is enforced at End Phase');
  assert.ok(!tag.tagActions(state,actor).some(action=>action.kind==='discard'),
    'the engine must not force a hand-limit discard during the Main Phase');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),fixture.partnerDeckBefore,
    'the inactive partner physical Deck must remain unchanged');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),fixture.partnerHandBefore,
    'the inactive partner private hand must remain unchanged');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.pot.uid),
    'Pot of Greed enters the active team shared Graveyard');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
