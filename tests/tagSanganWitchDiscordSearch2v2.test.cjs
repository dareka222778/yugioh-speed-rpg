'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m284-grave-search-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M284 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const SANGAN='26202165';
const WITCH='78010363';
const AXE_RAIDER='48305365';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const FILLERS=NORMALS.map(entry=>entry.id).filter(id=>![AXE_RAIDER].includes(id));
assert.ok(FILLERS.length>=20,'each isolated physical Deck needs twenty certified Normal Monster identities');

for(const [id,name,stat,atk] of [
  [SANGAN,'Sangan','atk',1000],
  [WITCH,'Witch of the Black Forest','defense',1100]
]){
  const card=getPlayableCard(id);
  const effect=getMonsterEffect(id);
  assert.equal(card?.englishName,name);
  assert.equal(card?.atk,atk);
  assert.equal(getCardStatus(id)?.stage,'certified');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(effect?.trigger,'onSentToGrave');
  assert.equal(effect?.operation.kind,'search');
  assert.equal(effect?.operation.stat,stat);
  assert.equal(effect?.operation.maximum,1500);
}

function member(seat){return 'm284-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...FILLERS])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct certified cards');
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
  throw new Error('M284 physical card missing from seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const handIndex=physical.hand.findIndex(card=>card.id===id);
  if(handIndex>=0)physical.deck.push(physical.hand.splice(handIndex,1)[0]);
  const found=physical.deck.find(card=>card.id===id);
  assert.ok(found,'eligible search card must remain in physical Deck '+seat);
  return found;
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
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
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
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
  assert.ok(menu,'the active physical seat must receive a real private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public Discord field must refresh after the committed action');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m284-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'a forged partner action must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate persisted duel state');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m284-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(entry,scenario){
  const activeCandidate=NORMALS.find(x=>x.id!==AXE_RAIDER&&x.card[entry.stat]<=1500);
  const partnerCandidate=NORMALS.find(x=>x.id!==AXE_RAIDER&&x.id!==activeCandidate?.id&&x.card[entry.stat]<=1500);
  const ineligible=NORMALS.find(x=>x.id!==AXE_RAIDER&&x.card[entry.stat]>1500);
  assert.ok(activeCandidate&&partnerCandidate&&ineligible,
    entry.name+' needs two distinct eligible Normal Monsters and one ineligible Normal Monster');
  const required=[
    [activeCandidate.id,ineligible.id],
    [],
    [entry.id,partnerCandidate.id],
    [AXE_RAIDER]
  ];
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M284 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m284-'+scenario});
  state.cursor=1;
  state.core.turn=3;
  state.core.current=1;
  state.core.priority=1;
  state.core.teamRotation.cursor=1;
  const actor=ids[1];
  assert.equal(tag.tagDecisionMember(state).id,actor,
    'the opposing active physical seat must initiate the battle through Discord');
  const source=deploy(state,2,entry.id);
  const attacker=deploy(state,3,AXE_RAIDER);
  const activeTarget=ensureInDeck(state,0,activeCandidate.id);
  const partnerTarget=ensureInDeck(state,2,partnerCandidate.id);
  const rejectedTarget=ensureInDeck(state,0,ineligible.id);
  assert.match(source.uid,/^m2:/,'the search source retains inactive physical seat 2 ownership');
  assert.match(attacker.uid,/^m3:/,'the attacker retains inactive physical seat 3 ownership');
  assert.match(activeTarget.uid,/^m0:/,'the eligible result belongs to active physical seat 0 Deck');
  assert.match(partnerTarget.uid,/^m2:/,'the partner has a separate eligible private Deck card');
  assert.match(rejectedTarget.uid,/^m0:/,'the over-limit card belongs to active physical seat 0 Deck');
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m284-'+scenario,guild='m284-guild',channel='m284-channel';
  const members=ids.map((id,seat)=>({id,name:'M284 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,entry,source,attacker,activeTarget,partnerTarget,rejectedTarget,before,record:store.getTag(id)};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active physical opponent must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,index,fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attackSource(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.source.uid
  );
  assert.ok(index>=0,'the active teammate must see the partner-owned source as a legal attack target');
  await rejectInactivePartner(record,fixture.actor,member(3),index,fixture.id+'-attack');
  const current=await submit(record,fixture.actor,index,fixture.id+'-attack');
  return settleResponses(current,fixture.id+'-attack-resolve');
}
async function chooseSearchResult(fixture,record){
  assert.equal(record.state.core.phase,'choice','a mandatory grave-search trigger must open its private choice');
  assert.equal(record.state.core.choice?.source,'monsterSearch');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(0),'the active representative of the source team controls the search');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.activeTarget.uid);
  assert.ok(index>=0,'the private search menu must expose the eligible card from active physical Deck 0');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.partnerTarget.uid),
    'the private search menu must not borrow a card from inactive partner Deck 2');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.rejectedTarget.uid),
    'the search filter must reject a Normal Monster above 1500 '+fixture.entry.stat.toUpperCase());
  await rejectInactivePartner(record,actor,member(2),index,fixture.id+'-search');
  return submit(record,actor,index,fixture.id+'-search');
}
function assertFinal(fixture,record){
  const state=record.state;
  const expectedDamage=fixture.attacker.atk-fixture.source.atk;
  assert.equal(state.core.players[0].lp,4000-expectedDamage,
    'ordinary battle damage must be applied to the source team shared LP');
  assert.equal(state.core.players[1].lp,4000,'the attacking team must not receive battle damage');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid&&card.id===fixture.entry.id),
    'the source must enter its team shared Graveyard with the original physical UID');
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===fixture.activeTarget.uid),
    'the selected card must enter active physical seat 0 hand');
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===fixture.activeTarget.uid),
    'the search result must not be transferred to the inactive partner hand');
  assert.ok(state.reserves[2].deck.some(card=>card.uid===fixture.partnerTarget.uid),
    'the inactive partner Deck must remain unchanged');
  assert.ok(state.core.players[0].deck.some(card=>card.uid===fixture.rejectedTarget.uid),
    'the card outside the stat filter must remain in the active physical Deck');
  assert.ok(!state.core.players[0].deck.some(card=>card.uid===fixture.activeTarget.uid));
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
for(const entry of [
  {id:SANGAN,name:'Sangan',stat:'atk'},
  {id:WITCH,name:'Witch of the Black Forest',stat:'defense'}
]){
  test(entry.name+' resolves its filtered search through the private Discord panel in classic 2v2',async()=>{
    const fixture=setup(entry,entry.name.toLowerCase().replaceAll(' ','-'));
    let current=await enterBattle(fixture);
    current=await attackSource(fixture,current);
    current=await chooseSearchResult(fixture,current);
    assertFinal(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
