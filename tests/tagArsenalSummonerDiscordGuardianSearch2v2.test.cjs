'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m297-arsenal-summoner-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const ARSENAL='85489096';
const THRONE_GUARDIAN='47879985';
const METAL_GUARDIAN='68339286';
const EXCLUDED=[
  '91152256', // Celtic Guardian
  '87796900', // Winged Dragon, Guardian of the Fortress #1
  '57405307', // Winged Dragon, Guardian of the Fortress #2
  '89272878', // Guardian of the Labyrinth
  '16430187'  // The Reliable Guardian
];
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monster fillers');
for(const id of [ARSENAL,THRONE_GUARDIAN,METAL_GUARDIAN,...EXCLUDED]){
  assert.ok(getPlayableCard(id),'card must be playable: '+id);
  assert.equal(getCardStatus(id)?.stage,'certified','card must remain certified: '+id);
}
assert.equal(getPlayableCard(ARSENAL).englishName,'Arsenal Summoner');
assert.equal(getPlayableCard(ARSENAL).atk,1600);
assert.equal(getPlayableCard(ARSENAL).defense,1600);
assert.deepEqual(getMonsterEffect(ARSENAL),{
  trigger:'flip',
  operation:{kind:'searchFiltered',rule:{
    from:'deck',
    filter:{
      archetype:'Guardian',
      excludeNames:[
        'Celtic Guardian',
        'Winged Dragon, Guardian of the Fortress #1',
        'Winged Dragon, Guardian of the Fortress #2',
        'Guardian of the Labyrinth',
        'The Reliable Guardian'
      ]
    }
  }}
});
assert.equal(getMonsterDefinition(ARSENAL)?.activation.policy,'mandatory');
assert.equal(getMonsterDefinition(ARSENAL)?.activation.window,'flip');
assert.equal(getEffect(THRONE_GUARDIAN)?.kind,'normal');
assert.equal(getEffect(METAL_GUARDIAN)?.kind,'normal');

function member(seat){return 'm297-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS])];
  assert.ok(ids.length>=20,'each physical Deck must contain at least twenty unique cards');
  return ids.slice(0,20);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const handIndex=physical.hand.findIndex(card=>card.id===id);
  if(handIndex>=0)physical.deck.push(physical.hand.splice(handIndex,1)[0]);
  const found=physical.deck.find(card=>card.id===id);
  assert.ok(found,'required search card must remain in physical Deck '+seat+': '+id);
  return found;
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M297 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must remain unique');
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
    'the private Discord panel must expose legal action index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m297-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function setup(){
  const required=[
    [THRONE_GUARDIAN,METAL_GUARDIAN,...EXCLUDED],
    [],
    [ARSENAL,METAL_GUARDIAN],
    []
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M297 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m297-arsenal-guardian-search'});
  state.core.turn=3;
  const source=placeFaceDown(state,2,ARSENAL);
  const activeThrone=ensureInDeck(state,0,THRONE_GUARDIAN);
  const activeMetal=ensureInDeck(state,0,METAL_GUARDIAN);
  const partnerMetal=ensureInDeck(state,2,METAL_GUARDIAN);
  const excluded=EXCLUDED.map(id=>ensureInDeck(state,0,id));
  assert.match(source.uid,/^m2:/,'Arsenal Summoner must retain inactive partner physical ownership');
  assert.match(activeThrone.uid,/^m0:/,'eligible result must belong to active physical Deck 0');
  assert.match(activeMetal.uid,/^m0:/,'second eligible result must belong to active physical Deck 0');
  assert.match(partnerMetal.uid,/^m2:/,'partner must retain a separate eligible private Deck copy');
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m297-arsenal-guardian-search',guild='m297-guild',channel='m297-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M297 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor:member(0),source,activeThrone,activeMetal,partnerMetal,excluded,before,record:store.getTag(id)};
}
async function flipThroughDiscord(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.mode==='flip'&&action.card===fixture.source.uid
  );
  assert.ok(index>=0,'active physical seat 0 must see Flip Summon for partner-owned Arsenal Summoner');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),index,'flip');
  const current=await submit(fixture.record,fixture.actor,index,'m297-arsenal-flip');
  assert.equal(current.state.core.phase,'choice','Arsenal Summoner must open a private search choice after flipping face-up');
  return current;
}
async function chooseGuardian(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const choices=actions.filter(action=>action.kind==='choose');
  const targets=choices.map(action=>action.target);
  assert.ok(targets.includes(fixture.activeThrone.uid),'the search must expose Guardian of the Throne Room');
  assert.ok(targets.includes(fixture.activeMetal.uid),'the search must expose Metal Guardian');
  assert.ok(!targets.includes(fixture.partnerMetal.uid),'the search must not borrow from inactive partner Deck 2');
  for(const card of fixture.excluded){
    assert.ok(!targets.includes(card.uid),'the official exclusion list must filter '+card.id);
  }
  assert.deepEqual(new Set(targets),new Set([fixture.activeThrone.uid,fixture.activeMetal.uid]),
    'only the two eligible Guardian cards from the active Deck may be offered');
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.activeThrone.uid);
  assert.ok(index>=0);
  await rejectInactivePartner(record,fixture.actor,member(2),index,'search');
  return submit(record,fixture.actor,index,'m297-arsenal-search');
}
test('partner-owned Arsenal Summoner searches only eligible Guardian cards from the active physical Deck through Discord 2v2',async()=>{
  const fixture=setup();
  const publicBefore=JSON.stringify(tag.publicTagDuel(fixture.record.state));
  assert.ok(!publicBefore.includes(ARSENAL),'face-down Arsenal Summoner identity must stay hidden before Flip Summon');
  assert.ok(!JSON.stringify(tagPublicMessage(fixture.record)).includes(ARSENAL));
  let current=await flipThroughDiscord(fixture);
  current=await chooseGuardian(fixture,current);
  const state=current.state;
  assert.ok(state.core.players[0].hand.some(card=>card.uid===fixture.activeThrone.uid&&card.id===THRONE_GUARDIAN),
    'selected Guardian must enter active physical seat 0 hand');
  assert.ok(!state.core.players[0].deck.some(card=>card.uid===fixture.activeThrone.uid));
  assert.ok(!tag.tagMemberHand(state,member(2)).some(card=>card.uid===fixture.activeThrone.uid),
    'search result must not be transferred to inactive partner hand');
  assert.ok(state.reserves[2].deck.some(card=>card.uid===fixture.partnerMetal.uid),
    'inactive partner Deck must remain unchanged');
  assert.ok(state.core.players[0].deck.some(card=>card.uid===fixture.activeMetal.uid),
    'the unselected eligible Guardian must remain in active Deck');
  for(const card of fixture.excluded){
    assert.ok(state.core.players[0].deck.some(entry=>entry.uid===card.uid),
      'excluded card must remain in active Deck: '+card.id);
  }
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.id===ARSENAL&&card.faceUp),
    'the flipped source remains face-up on the shared field');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
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
