'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m291-puppeteer-discord-'));
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

const PUPPETEER='54098121';
const TRAP_HOLE='04206964';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
const SUMMONER=NORMALS.map(id=>({id,card:getPlayableCard(id)}))
  .find(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.level)&&entry.card.level<=4&&entry.card.atk>=1000);
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monsters');
assert.ok(SUMMONER,'a certified Level 4-or-lower Normal Monster with at least 1000 ATK is required');
assert.equal(getPlayableCard(PUPPETEER)?.englishName,'Mysterious Puppeteer');
assert.equal(getPlayableCard(PUPPETEER)?.atk,1000);
assert.equal(getPlayableCard(PUPPETEER)?.defense,1500);
assert.equal(getCardStatus(PUPPETEER)?.stage,'certified');
assert.equal(getEffect(PUPPETEER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(PUPPETEER),{
  trigger:'onOtherSummon',operation:{kind:'heal',amount:500}
});
assert.equal(getCardStatus(TRAP_HOLE)?.stage,'certified');

function member(seat){return 'm291-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS])];
  assert.ok(ids.length>=20,'each physical Deck must contain at least twenty unique cards');
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
  throw new Error('M291 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setTrap(state,seat,id){
  const card=takePhysical(state,seat,id);
  const backrow={...card,setTurn:0,faceUp:false};
  state.core.players[seat%2].backrow.push(backrow);
  return backrow;
}
function putInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
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
  const forged=interaction(record,partner,index,'m291-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the summon response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m291-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{first=1,puppeteers=[],faceDownPuppeteers=[],trapSeat=null,flipSeat=null,summonSeat=null}={}){
  const required=[[],[],[],[]];
  for(const seat of puppeteers)required[seat].push(PUPPETEER);
  for(const seat of faceDownPuppeteers)required[seat].push(PUPPETEER);
  if(trapSeat!==null)required[trapSeat].push(TRAP_HOLE);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M291 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m291-'+scenario});
  state.core.turn=3;
  const sources=[];
  for(const seat of puppeteers)sources.push(placeMonster(state,seat,PUPPETEER,true));
  for(const seat of faceDownPuppeteers)sources.push(placeMonster(state,seat,PUPPETEER,false));
  const flipTarget=flipSeat===null?null:placeMonster(state,flipSeat,SUMMONER.id,false);
  const trap=trapSeat===null?null:setTrap(state,trapSeat,TRAP_HOLE);
  const summonCard=summonSeat===null?null:putInHand(state,summonSeat,SUMMONER.id);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m291-'+scenario,guild='m291-guild',channel='m291-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M291 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor:tag.tagDecisionMember(state).id,sources,flipTarget,trap,summonCard,before,record:store.getTag(id)};
}
function assertFinal(fixture,record,expectedLP){
  const state=record.state;
  assert.equal(state.core.players[0].lp,expectedLP[0]);
  assert.equal(state.core.players[1].lp,expectedLP[1]);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
async function normalSummon(fixture,record,seat,suffix){
  const actor=member(seat);
  assert.equal(tag.tagDecisionMember(record.state).id,actor);
  const card=fixture.summonCard;
  assert.ok(card&&card.id===SUMMONER.id,'the fixture must persist the summoned card in the active physical hand');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='summon'&&action.card===card.uid&&action.position==='atk'
  );
  assert.ok(index>=0,'the active teammate must see a legal Normal Summon in its private Discord panel');
  return {record:await submit(record,actor,index,'m291-'+suffix+'-summon'),card};
}
async function flipSummon(fixture,record,seat,suffix){
  const actor=member(seat);
  assert.equal(tag.tagDecisionMember(record.state).id,actor);
  assert.ok(fixture.flipTarget);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.mode==='flip'&&action.card===fixture.flipTarget.uid
  );
  assert.ok(index>=0,'the active teammate must see Flip Summon for the partner-owned face-down monster');
  return submit(record,actor,index,'m291-'+suffix+'-flip');
}
test('opponent Normal Summon triggers each Puppeteer owned by a different physical seat, including the inactive teammate',async()=>{
  const fixture=setup('opponent-normal',{first:1,puppeteers:[0,3],summonSeat:1});
  assert.equal(fixture.actor,member(1));
  assert.match(fixture.sources[0].uid,/^m0:/);
  assert.match(fixture.sources[1].uid,/^m3:/);
  assert.deepEqual(tag.tagActions(fixture.record.state,member(0)),[]);
  assert.deepEqual(tag.tagActions(fixture.record.state,member(3)),[]);
  const {record,card}=await normalSummon(fixture,fixture.record,1,'opponent-normal');
  assert.equal(record.state.core.phase,'main');
  assert.ok(record.state.core.players[1].monsters.some(monster=>monster.uid===card.uid));
  assertFinal(fixture,record,[4500,4500]);
});
test('the summoning physical owner does not trigger its own Puppeteer, but the other physical owner does',async()=>{
  const fixture=setup('allied-normal',{first:0,puppeteers:[0,3],summonSeat:0});
  assert.equal(fixture.actor,member(0));
  assert.match(fixture.sources[0].uid,/^m2:/);
  assert.match(fixture.sources[1].uid,/^m3:/);
  const {record,card}=await normalSummon(fixture,fixture.record,0,'allied-normal');
  assert.equal(record.state.core.phase,'main');
  assert.ok(record.state.core.players[0].monsters.some(monster=>monster.uid===card.uid));
  assertFinal(fixture,record,[4000,4500]);
});
test('opponent Flip Summon triggers a face-up partner-owned Puppeteer',async()=>{
  const fixture=setup('opponent-flip',{first:1,puppeteers:[0],flipSeat:3});
  assert.equal(fixture.actor,member(1));
  assert.match(fixture.flipTarget.uid,/^m3:/);
  const publicBefore=JSON.stringify(tag.publicTagDuel(fixture.record.state));
  assert.ok(!publicBefore.includes(SUMMONER.id),'face-down summoned target identity must remain hidden publicly');
  const record=await flipSummon(fixture,fixture.record,1,'opponent-flip');
  assert.equal(record.state.core.phase,'main');
  assert.ok(record.state.core.players[1].monsters.some(monster=>monster.uid===fixture.flipTarget.uid&&monster.faceUp));
  assertFinal(fixture,record,[4500,4000]);
});
test('face-down Puppeteer does not trigger when the opponent Normal Summons',async()=>{
  const fixture=setup('facedown-puppeteer',{first:1,faceDownPuppeteers:[0],summonSeat:1});
  const {record}=await normalSummon(fixture,fixture.record,1,'facedown-puppeteer');
  assertFinal(fixture,record,[4000,4000]);
});
test('Puppeteer summon heal resolves even when an inactive-partner Trap Hole destroys the summoned monster',async()=>{
  const fixture=setup('trap-hole-after-trigger',{first:1,puppeteers:[0],trapSeat:0,summonSeat:1});
  assert.match(fixture.sources[0].uid,/^m0:/);
  assert.match(fixture.trap.uid,/^m0:/);
  const {record:afterSummon,card}=await normalSummon(fixture,fixture.record,1,'trap-hole-after-trigger');
  assert.equal(afterSummon.state.core.phase,'response');
  // The tag response window is settled before the mandatory summon trigger is reflected in team LP.
  assert.deepEqual(tag.tagActions(afterSummon.state,member(0)),[],
    'the inactive physical Trap Hole owner cannot respond for the active teammate');
  const actor=tag.tagDecisionMember(afterSummon.state).id;
  assert.equal(actor,member(2));
  const actions=tag.tagActions(afterSummon.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid&&action.target===card.uid
  );
  assert.ok(index>=0,'the active teammate must be able to activate the partner-owned set Trap Hole');
  let current=await submit(afterSummon,actor,index,'m291-trap-hole-activate');
  current=await settleResponses(current,'trap-hole-chain');
  assert.ok(current.state.core.players[1].grave.some(entry=>entry.uid===card.uid&&entry.id===SUMMONER.id));
  assert.ok(!current.state.core.players[1].monsters.some(monster=>monster.uid===card.uid));
  assert.ok(current.state.core.players[0].grave.some(entry=>entry.uid===fixture.trap.uid));
  assertFinal(fixture,current,[4500,4000]);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
