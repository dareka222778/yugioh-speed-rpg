'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m349-mystic-tomato-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MYSTIC_TOMATO='83011277';
const AXE_RAIDER='48305365';
const ACTIVE_CANDIDATE='26202165'; // Sangan: DARK, 1000 ATK
const PARTNER_DECOY='78010363'; // Witch of the Black Forest: DARK, 1100 ATK
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return ![AXE_RAIDER,ACTIVE_CANDIDATE,PARTNER_DECOY].includes(id)&&
    card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&
    !(card.attribute==='DARK'&&card.atk<=1500);
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks need twenty Normal Monsters outside the Tomato DARK/1500 filter');
assert.equal(getPlayableCard(MYSTIC_TOMATO)?.englishName,'Mystic Tomato');
assert.equal(getCardStatus(MYSTIC_TOMATO)?.stage,'certified');
assert.equal(getPlayableCard(MYSTIC_TOMATO)?.atk,1400);
assert.equal(getEffect(MYSTIC_TOMATO)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(MYSTIC_TOMATO),{
  trigger:'onBattleDestroyed',
  operation:{kind:'specialSummon',attribute:'DARK',maximumAtk:1500}
});
assert.equal(getMonsterDefinition(MYSTIC_TOMATO)?.activation.policy,'optional');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getCardStatus(AXE_RAIDER)?.stage,'certified');
for(const id of [ACTIVE_CANDIDATE,PARTNER_DECOY]){
  const card=getPlayableCard(id);
  assert.equal(getCardStatus(id)?.stage,'certified');
  assert.equal(card?.attribute,'DARK');
  assert.ok(card?.atk<=1500);
}
assert.equal(getPlayableCard(ACTIVE_CANDIDATE)?.englishName,'Sangan');
assert.equal(getPlayableCard(PARTNER_DECOY)?.englishName,'Witch of the Black Forest');

function member(seat){return 'm349-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain at least twenty distinct cards');
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
  throw new Error('M349 physical card missing from seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)physical.deck.push(physical.hand.splice(index,1)[0]);
  const card=physical.deck.find(card=>card.id===id);
  assert.ok(card,'required physical Deck card must remain in the Deck: '+id+' seat '+seat);
  return card;
}
function placeMonster(state,seat,id){
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
    assert.ok((team.extra??[]).length<=5);
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must be unique');
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
  assert.ok(menu,'the active physical representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose legal action index '+index);
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
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active representative action menu');
  const forged=interaction(record,partner,index,'m349-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass');
    current=await submit(current,actor,pass,'m349-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(key,{includeCandidate=true,includePartnerDecoy=true}={}){
  const required=[[],[],[],[]];
  required[0].push(MYSTIC_TOMATO);
  if(includePartnerDecoy)required[0].push(PARTNER_DECOY);
  required[2].push(ACTIVE_CANDIDATE);
  required[3].push(AXE_RAIDER);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M349 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m349-'+key});
  state.core.turn=3;
  // Keep the active representatives 2/3 but let team 1 begin the battle.
  state.cursor=3;
  state.core.current=1;
  state.core.teamRotation.cursor=3;
  assert.deepEqual(state.active,[2,3]);
  const source=placeMonster(state,0,MYSTIC_TOMATO);
  const attacker=placeMonster(state,3,AXE_RAIDER);
  const candidate=includeCandidate?ensureInDeck(state,2,ACTIVE_CANDIDATE):null;
  const partnerDecoy=includePartnerDecoy?ensureInDeck(state,0,PARTNER_DECOY):null;
  assert.match(source.uid,/^m0:/,'Mystic Tomato must retain inactive partner physical ownership');
  assert.match(attacker.uid,/^m3:/,'Axe Raider must retain active opponent physical ownership');
  if(candidate)assert.match(candidate.uid,/^m2:/);
  if(partnerDecoy)assert.match(partnerDecoy.uid,/^m0:/);
  assert.equal(tag.tagDecisionMember(state).id,member(3),
    'the active opponent seat must begin the battle');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const id='m349-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M349 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m349-guild','m349-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  const record=store.getTag(id);
  assertPublicPayload(record);
  return {id,key,source,attacker,candidate,partnerDecoy,before,record};
}
async function enterBattle(fixture,record){
  const actor=member(3);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active opponent must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,actor,index,'m349-'+fixture.key+'-battle'),fixture.key+'-battle');
}
async function attackTomato(fixture,record){
  const actor=member(3);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.source.uid
  );
  assert.ok(index>=0,'the active opponent must see the shared-field attack against Mystic Tomato');
  return settleResponses(await submit(record,actor,index,'m349-'+fixture.key+'-attack'),fixture.key+'-attack');
}
async function activateOptional(fixture,record){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'the active representative of the source team must receive the optional Tomato trigger');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.source.uid);
  assert.ok(index>=0,'the private Discord menu must offer Mystic Tomato optional activation');
  assert.ok(actions.some(action=>action.kind==='choose'&&action.target==='__skip__'),
    'the optional Tomato trigger must expose a decline action');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-optional');
  return submit(record,actor,index,'m349-'+fixture.key+'-activate');
}
async function specialSummon(fixture,record){
  current=record;
}
function assertOutcome(fixture,record,recruited){
  const state=record.state;
  assert.equal(state.core.players[0].lp,3700,'1700 ATK Axe Raider inflicts exactly 300 battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid&&card.id===MYSTIC_TOMATO),
    'destroyed Mystic Tomato must enter its team Graveyard with the original physical UID');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid));
  if(recruited){
    const monster=state.core.players[0].monsters.find(card=>
      card.uid===fixture.candidate.uid&&card.id===ACTIVE_CANDIDATE
    );
    assert.ok(monster,'the selected DARK monster must be Special Summoned to the shared field');
    assert.match(monster.uid,/^m2:/,'the Special Summoned monster retains active representative physical ownership');
    assert.ok(!holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid),
      'the inactive partner Deck must remain untouched');
  }else{
    if(fixture.candidate)assert.ok(holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    if(fixture.partnerDecoy)assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
    assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.candidate?.uid));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('M349 Mystic Tomato Special Summons only from the active physical Deck through Discord 2v2',async()=>{
  const fixture=setup('active-deck-special-summon');
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  current=await activateOptional(fixture,current);
  current=await settleResponses(current,'special-summon');
  assert.equal(current.state.core.phase,'choice');
  assert.equal(current.state.core.choice.source,'monsterRecruit');
  const actor=member(2);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.candidate.uid);
  assert.ok(index>=0,'active representative private menu must offer Sangan from its own physical Deck');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.partnerDecoy.uid),
    'inactive partner Deck decoy must never be offered');
  assert.ok(current.state.core.choice.targets.every(uid=>uid.startsWith('m2:')),
    'all Tomato targets must belong to the active physical Deck');
  await rejectInactivePartner(current,actor,member(0),index,'special-summon');
  current=await submit(current,actor,index,'m349-select-sangan');
  current=await settleResponses(current,'summon-response');
  assertOutcome(fixture,current,true);
});
test('M349 Mystic Tomato cannot use a DARK monster found only in the inactive partner Deck',async()=>{
  const fixture=setup('partner-deck-only',{includeCandidate:false,includePartnerDecoy:true});
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  assert.equal(current.state.core.phase,'battle','no eligible card in the active Deck means no recruiter trigger');
  assert.equal(current.state.core.choice,undefined);
  assert.ok(holder(current.state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
  assertOutcome(fixture,current,false);
});
test('M349 Mystic Tomato optional Special Summon can be declined without moving either physical Deck',async()=>{
  const fixture=setup('decline-optional');
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  assert.equal(current.state.core.choice.source,'triggerOptional');
  const actor=member(2);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target==='__skip__');
  assert.ok(index>=0,'optional Tomato trigger must expose a decline action');
  await rejectInactivePartner(current,actor,member(0),index,'decline');
  current=await submit(current,actor,index,'m349-decline');
  assert.equal(current.state.core.phase,'battle');
  assertOutcome(fixture,current,false);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
