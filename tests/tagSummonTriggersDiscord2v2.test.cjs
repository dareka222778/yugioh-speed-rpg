'use strict';
const {test:nodeTest,after}=require('node:test');
process.on('uncaughtExceptionMonitor',error=>console.error('[M276 file diagnostic]',error?.stack||error));
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M276 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m276-summon-triggers-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const GRAVEKEEPERS_CURSE='50712728';
const SACRED_CRANE='30914564';
const MONSTER_REBORN='83764718';

const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>![GRAVEKEEPERS_CURSE,SACRED_CRANE,MONSTER_REBORN].includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const normalIds=fillers.slice(0,8).map(entry=>entry.id);
test('M276 certified summon-trigger card and Deck preflight',()=>{
assert.equal(getPlayableCard(GRAVEKEEPERS_CURSE)?.englishName,"Gravekeeper's Curse");
assert.equal(getPlayableCard(GRAVEKEEPERS_CURSE)?.atk,800);
assert.equal(getCardStatus(GRAVEKEEPERS_CURSE)?.stage,'certified');
assert.equal(getEffect(GRAVEKEEPERS_CURSE)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.trigger,'onSummon');
assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.operation.kind,'burn');
assert.equal(getMonsterEffect(GRAVEKEEPERS_CURSE)?.operation.amount,500);
assert.deepEqual(getMonsterEffect(GRAVEKEEPERS_CURSE)?.summons,['normal','flip','special']);

assert.equal(getPlayableCard(SACRED_CRANE)?.englishName,'Sacred Crane');
assert.equal(getPlayableCard(SACRED_CRANE)?.atk,1600);
assert.equal(getCardStatus(SACRED_CRANE)?.stage,'certified');
assert.equal(getEffect(SACRED_CRANE)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(SACRED_CRANE)?.trigger,'onSummon');
assert.equal(getMonsterEffect(SACRED_CRANE)?.operation.kind,'draw');
assert.equal(getMonsterEffect(SACRED_CRANE)?.operation.count,1);
assert.deepEqual(getMonsterEffect(SACRED_CRANE)?.summons,['special']);
assert.equal(getEffect(MONSTER_REBORN)?.kind,'specialSummon');

const normalIds=fillers.slice(0,8).map(entry=>entry.id);

  assert.ok(fillers.length>=8,'the isolated 2v2 fixture needs eight certified Normal Monsters');
  assert.equal(new Set(normalIds).size,8);
});

function member(seat){return 'm276-seat-'+seat;}
function deck(){const ids=[...new Set([GRAVEKEEPERS_CURSE,SACRED_CRANE,MONSTER_REBORN,...normalIds])];return Array.from({length:20},(_,index)=>ids[index%ids.length]);}
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
  throw new Error('M276 physical card missing from seat '+seat+': '+id);
}
function placeFaceDown(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
    assert.ok(team.monsters.length<=3,'each shared team field has only three Monster Zones');
    assert.ok(team.backrow.length<=3,'each shared team field has only three Spell/Trap Zones');
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
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
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
  assert.ok(menu,'the real private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord menu must contain the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1);
  return store.getTag(record.id);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the mandatory summon-trigger response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m276-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,partner),[],
    'the inactive physical partner cannot receive the active teammate action menu');
  const forged=interaction(record,partner,index,'m276-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the duel');
}
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M276 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m276-summon-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const id='m276-'+scenario,guild='m276-guild',channel='m276-channel';
  const members=ids.map((id,seat)=>({id,name:'M276 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,actor,record:store.getTag(id)};
}

test("Gravekeeper's Curse burns 500 shared-team LP after a partner-controlled Normal Summon",async()=>{
  const fixture=setup('gravekeepers-normal');
  const source=takePhysical(fixture.record.state,0,GRAVEKEEPERS_CURSE);
  holder(fixture.record.state,0).hand.push(source);
  assert.match(source.uid,/^m0:/);
  const beforeOwnLP=fixture.record.state.core.players[0].lp;
  const beforeOppLP=fixture.record.state.core.players[1].lp;
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const summon=actions.findIndex(action=>
    action.kind==='summon'&&action.card===source.uid&&action.position==='atk'
  );
  assert.ok(summon>=0,'the active physical owner must see the Normal Summon action in Discord');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),summon,'gravekeepers-normal');
  let current=await submit(fixture.record,fixture.actor,summon,'m276-gravekeepers-normal-summon');
  current=await settleResponses(current,'gravekeepers-normal');
  assert.equal(current.state.core.players[0].lp,beforeOwnLP);
  assert.equal(current.state.core.players[1].lp,beforeOppLP-500,
    'the mandatory on-Summon trigger inflicts exactly 500 damage to the opposing shared team');
  assert.ok(current.state.core.players[0].monsters.some(card=>
    card.uid===source.uid&&card.id===GRAVEKEEPERS_CURSE&&card.faceUp
  ));
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test("Gravekeeper's Curse burns 500 shared-team LP after a partner-owned Flip Summon",async()=>{
  const fixture=setup('gravekeepers-flip');
  const source=placeFaceDown(fixture.record.state,2,GRAVEKEEPERS_CURSE);
  assert.match(source.uid,/^m2:/);
  assertRules(fixture.record.state);
  const beforeOwnLP=fixture.record.state.core.players[0].lp;
  const beforeOppLP=fixture.record.state.core.players[1].lp;
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const flip=actions.findIndex(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(flip>=0,'the active teammate must see the partner-owned Flip Summon action');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),flip,'gravekeepers-flip');
  let current=await submit(fixture.record,fixture.actor,flip,'m276-gravekeepers-flip-summon');
  current=await settleResponses(current,'gravekeepers-flip');
  assert.equal(current.state.core.players[0].lp,beforeOwnLP);
  assert.equal(current.state.core.players[1].lp,beforeOppLP-500,
    'the Flip Summon trigger inflicts exactly 500 damage to the opposing shared team');
  assert.ok(current.state.core.players[0].monsters.some(card=>
    card.uid===source.uid&&card.id===GRAVEKEEPERS_CURSE&&card.faceUp
  ));
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Sacred Crane draws one card from the active physical Deck when a partner-owned copy is Special Summoned',async()=>{
  const fixture=setup('sacred-crane-special');
  const crane=takePhysical(fixture.record.state,2,SACRED_CRANE);
  fixture.record.state.core.players[0].grave.push(crane);
  const reborn=takePhysical(fixture.record.state,0,MONSTER_REBORN);
  holder(fixture.record.state,0).hand.push(reborn);
  assert.match(crane.uid,/^m2:/);
  assert.match(reborn.uid,/^m0:/);
  const drawUid=fixture.record.state.core.players[0].deck[0].uid;
  const deckBefore=fixture.record.state.core.players[0].deck.length;
  const handBefore=holder(fixture.record.state,0).hand.length;
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const revive=actions.findIndex(action=>
    action.kind==='spell'&&action.card===reborn.uid&&action.target===crane.uid
  );
  assert.ok(revive>=0,'the active player must see Monster Reborn targeting the partner-owned Sacred Crane');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),revive,'sacred-crane-special');
  let current=await submit(fixture.record,fixture.actor,revive,'m276-sacred-crane-reborn');
  current=await settleResponses(current,'sacred-crane-special');
  assert.ok(current.state.core.players[0].monsters.some(card=>
    card.uid===crane.uid&&card.id===SACRED_CRANE&&card.faceUp
  ),'the Special Summoned Crane must retain its original physical partner UID');
  assert.ok(current.state.core.players[0].grave.some(card=>
    card.uid===reborn.uid&&card.id===MONSTER_REBORN
  ),'Monster Reborn must enter the shared Graveyard after resolution');
  assert.equal(current.state.core.players[0].deck.length,deckBefore-1,
    'Sacred Crane must draw exactly one card from the active physical Deck');
  assert.ok(holder(current.state,0).hand.some(card=>card.uid===drawUid),
    'the exact top card of the active physical Deck must enter the active physical hand');
  assert.equal(holder(current.state,0).hand.length,handBefore,
    'one Spell is spent and one card is drawn');
  assert.ok(!holder(current.state,2).hand.some(card=>card.uid===drawUid),
    'the inactive partner physical hand must not receive the draw');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Sacred Crane does not draw when it is Normal Summoned through Discord',async()=>{
  const fixture=setup('sacred-crane-normal-negative');
  const crane=takePhysical(fixture.record.state,0,SACRED_CRANE);
  holder(fixture.record.state,0).hand.push(crane);
  const deckBefore=fixture.record.state.core.players[0].deck.length;
  const drawUid=fixture.record.state.core.players[0].deck[0].uid;
  const handBefore=holder(fixture.record.state,0).hand.length;
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const summon=actions.findIndex(action=>
    action.kind==='summon'&&action.card===crane.uid&&action.position==='atk'
  );
  assert.ok(summon>=0);
  let current=await submit(fixture.record,fixture.actor,summon,'m276-sacred-crane-normal-summon');
  current=await settleResponses(current,'sacred-crane-normal-negative');
  assert.equal(current.state.core.players[0].deck.length,deckBefore,
    'a Normal Summon must not satisfy Sacred Crane special-summon trigger');
  assert.ok(!holder(current.state,0).hand.some(card=>card.uid===drawUid));
  assert.equal(holder(current.state,0).hand.length,handBefore-1);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===crane.uid));
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
