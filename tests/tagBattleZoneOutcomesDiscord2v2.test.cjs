'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m295-battle-zone-discord-'));
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

const DD_WARRIOR='37043180';
const JUJITSU='25773409';
const CELTIC_GUARDIAN='91152256';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monster fillers');
for(const id of [DD_WARRIOR,JUJITSU,CELTIC_GUARDIAN]){
  assert.ok(getPlayableCard(id),'card must be playable: '+id);
  assert.equal(getCardStatus(id)?.stage,'certified','card must remain certified: '+id);
}
assert.equal(getPlayableCard(DD_WARRIOR).englishName,'D.D. Warrior');
assert.equal(getPlayableCard(JUJITSU).englishName,'Legendary Jujitsu Master');
assert.equal(getPlayableCard(CELTIC_GUARDIAN).englishName,'Celtic Guardian');
assert.deepEqual(getMonsterEffect(DD_WARRIOR),{
  trigger:'continuous',operation:{kind:'battleBanishBoth'}
});
assert.deepEqual(getMonsterEffect(JUJITSU),{
  trigger:'continuous',operation:{kind:'battleTopDeckAttacker'}
});
assert.equal(getMonsterDefinition(DD_WARRIOR)?.activation.policy,'continuous');
assert.equal(getMonsterDefinition(JUJITSU)?.activation.policy,'continuous');

function member(seat){return 'm295-seat-'+seat;}
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
  throw new Error('M295 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,position='atk',faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
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
  const forged=interaction(record,partner,index,'m295-'+suffix+'-forged',actor);
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
    assert.ok(guard<40,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m295-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{first,sourceSeat,sourceId,targetSeat,targetId,sourcePosition='atk',targetPosition='atk'}){
  const required=[[],[],[],[]];
  required[sourceSeat].push(sourceId);
  required[targetSeat].push(targetId);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M295 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m295-'+scenario});
  state.core.turn=3;
  const source=placeMonster(state,sourceSeat,sourceId,sourcePosition,true);
  const target=placeMonster(state,targetSeat,targetId,targetPosition,true);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m295-'+scenario,guild='m295-guild',channel='m295-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M295 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,source,target,sourceSeat,targetSeat,actor:tag.tagDecisionMember(state).id,before,record:store.getTag(id)};
}
async function enterBattle(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active teammate must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,fixture.actor,index,'m295-'+fixture.id+'-battle'),fixture.id+'-battle');
}
async function attack(fixture,record,attacker,defender,attackerSeat,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(index>=0,'the active teammate must see the shared-field attack against the partner-owned monster');
  await rejectInactivePartner(record,fixture.actor,member(attackerSeat),index,fixture.id+'-'+suffix);
  return settleResponses(await submit(record,fixture.actor,index,'m295-'+fixture.id+'-'+suffix),fixture.id+'-'+suffix);
}
function assertFinal(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}
test('partner-owned D.D. Warrior banishes itself and the opposing attacker through the Discord battle menu',async()=>{
  const fixture=setup('dd-warrior-attacking',{
    first:0,sourceSeat:2,sourceId:DD_WARRIOR,targetSeat:3,targetId:CELTIC_GUARDIAN
  });
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  let current=await enterBattle(fixture,fixture.record);
  current=await attack(fixture,current,fixture.source,fixture.target,fixture.sourceSeat,'attack');
  const state=current.state;
  assert.ok(state.core.players[0].banished.some(card=>card.uid===fixture.source.uid&&card.id===DD_WARRIOR));
  assert.ok(state.core.players[1].banished.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
  assert.ok(!state.core.players.some(team=>team.monsters.some(card=>[fixture.source.uid,fixture.target.uid].includes(card.uid))));
  assert.equal(state.core.players[0].lp,3800,'1200 ATK D.D. Warrior loses by 200 to 1400 ATK Celtic Guardian before both are banished');
  assert.equal(state.core.players[1].lp,4000);
  assertFinal(fixture,current);
});
test('partner-owned D.D. Warrior also banishes both cards when defending in the shared field',async()=>{
  const fixture=setup('dd-warrior-defending',{
    first:1,sourceSeat:0,sourceId:DD_WARRIOR,sourcePosition:'def',
    targetSeat:3,targetId:CELTIC_GUARDIAN,targetPosition:'atk'
  });
  assert.match(fixture.source.uid,/^m0:/);
  assert.match(fixture.target.uid,/^m3:/);
  let current=await enterBattle(fixture,fixture.record);
  current=await attack(fixture,current,fixture.target,fixture.source,fixture.targetSeat,'attack');
  const state=current.state;
  assert.ok(state.core.players[0].banished.some(card=>card.uid===fixture.source.uid&&card.id===DD_WARRIOR));
  assert.ok(state.core.players[1].banished.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
  assert.equal(state.core.players[0].lp,4000,'attacking a Defense monster does not inflict ordinary battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assertFinal(fixture,current);
});
test('partner-owned Legendary Jujitsu Master returns the opposing attacker to its physical owner top Deck through Discord',async()=>{
  const fixture=setup('legendary-jujitsu-owner-top-deck',{
    first:1,sourceSeat:0,sourceId:JUJITSU,sourcePosition:'def',
    targetSeat:3,targetId:CELTIC_GUARDIAN,targetPosition:'atk'
  });
  assert.match(fixture.source.uid,/^m0:/);
  assert.match(fixture.target.uid,/^m3:/);
  let current=await enterBattle(fixture,fixture.record);
  current=await attack(fixture,current,fixture.target,fixture.source,fixture.targetSeat,'attack');
  const state=current.state;
  assert.ok(state.reserves[3].deck.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
  assert.equal(state.reserves[3].deck[0].uid,fixture.target.uid,'the attacking card must return to the top of its physical owner Deck');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.id===JUJITSU&&card.position==='def'));
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  // Battle damage for ATK < DEF is tracked separately in issue #255; this integration isolates the top-Deck replacement and physical-owner routing.
  assertFinal(fixture,current);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
