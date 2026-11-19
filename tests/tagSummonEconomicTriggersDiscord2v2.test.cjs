'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m350-summon-triggers-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const GRAVEKEEPERS_CURSE='50712728';
const SACRED_CRANE='30914564';
const MONSTER_REBORN='83764718';
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monsters');

assert.equal(getPlayableCard(GRAVEKEEPERS_CURSE)?.englishName,"Gravekeeper's Curse");
assert.equal(getCardStatus(GRAVEKEEPERS_CURSE)?.stage,'certified');
assert.equal(getEffect(GRAVEKEEPERS_CURSE)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(GRAVEKEEPERS_CURSE),{
  trigger:'onSummon',
  operation:{kind:'burn',amount:500},
  summons:['normal','flip','special']
});
assert.equal(getMonsterDefinition(GRAVEKEEPERS_CURSE)?.activation.policy,'mandatory');

assert.equal(getPlayableCard(SACRED_CRANE)?.englishName,'Sacred Crane');
assert.equal(getCardStatus(SACRED_CRANE)?.stage,'certified');
assert.equal(getEffect(SACRED_CRANE)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(SACRED_CRANE),{
  trigger:'onSummon',
  operation:{kind:'draw',count:1},
  summons:['special']
});
assert.equal(getMonsterDefinition(SACRED_CRANE)?.activation.policy,'mandatory');

assert.equal(getPlayableCard(MONSTER_REBORN)?.englishName,'Monster Reborn');
assert.equal(getCardStatus(MONSTER_REBORN)?.stage,'certified');
assert.equal(getEffect(MONSTER_REBORN)?.kind,'monsterReborn');

const DRAW_ID=SAFE_NORMALS[0];
function member(seat){return 'm350-seat-'+seat;}
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
  throw new Error('M350 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)return physical.hand[index];
  index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'required physical card must exist in Deck or hand: '+id+' seat '+seat);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function ensureDeckTop(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0){
    const [card]=physical.hand.splice(index,1);
    physical.deck.unshift(card);
    return card;
  }
  index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the active physical Deck must contain the deterministic draw card');
  const [card]=physical.deck.splice(index,1);
  physical.deck.unshift(card);
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
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'summon triggers must conserve every physical card');
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
  assert.ok(refreshes>=1,'the committed Discord action must refresh the public panel');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active representative action menu');
  const forged=interaction(record,partner,index,'m350-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner actions must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m350-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m350-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M350 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m350-guild','m350-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(key,{targetId,targetSeat=0,specialSummon=true,draw=false}={}){
  const required=[[],[],[],[]];
  required[targetSeat].push(targetId);
  if(specialSummon)required[2].push(MONSTER_REBORN);
  if(draw)required[2].push(DRAW_ID);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M350 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m350-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const source=specialSummon?takePhysical(state,targetSeat,targetId):ensureInHand(state,targetSeat,targetId);
  if(specialSummon)state.core.players[targetSeat%2].grave.push({id:source.id,uid:source.uid});
  const reborn=specialSummon?ensureInHand(state,2,MONSTER_REBORN):null;
  const drawRef=draw?ensureDeckTop(state,2,DRAW_ID):null;
  assert.match(source.uid,new RegExp('^m'+targetSeat+':'),
    'the trigger source must preserve its physical owner UID');
  if(reborn)assert.match(reborn.uid,/^m2:/,'Monster Reborn must belong to the active physical representative');
  if(drawRef)assert.match(drawRef.uid,/^m2:/,'the deterministic draw must come from the active physical Deck');
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,key);
  assertPublicPayload(record);
  return {key,source,reborn,drawRef,before,record};
}
async function activateMonsterReborn(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='spell'&&action.card===fixture.reborn.uid&&
    action.target===fixture.source.uid&&action.position==='atk'
  );
  assert.ok(index>=0,'the active representative must receive the legal Monster Reborn target action');
  await rejectInactivePartner(fixture.record,actor,member(0),index,fixture.key+'-reborn');
  return submit(fixture.record,actor,index,'m350-'+fixture.key+'-reborn');
}
async function normalSummon(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='summon'&&action.card===fixture.source.uid&&action.position==='atk'
  );
  assert.ok(index>=0,'the active representative must receive the legal Normal Summon action');
  await rejectInactivePartner(fixture.record,actor,member(0),index,fixture.key+'-summon');
  return submit(fixture.record,actor,index,'m350-'+fixture.key+'-summon');
}
function assertStable(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}

test('M350 Gravekeeper\'s Curse owned by the inactive partner burns the opposing shared team when Monster Reborn Special Summons it through Discord 2v2',async()=>{
  const fixture=setup('gravekeepers-curse-special',{
    targetId:GRAVEKEEPERS_CURSE,targetSeat:0,specialSummon:true
  });
  const partnerDeckBefore=holder(fixture.record.state,0).deck.map(card=>card.uid);
  let current=await activateMonsterReborn(fixture);
  current=await settleResponses(current,'gravekeepers-curse-special');
  assert.equal(current.state.core.phase,'main','the mandatory summon trigger must resolve before Main Phase resumes');
  const summoned=current.state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid);
  assert.ok(summoned&&summoned.faceUp,'the partner-owned Gravekeeper\'s Curse must occupy the shared allied field');
  assert.equal(summoned.owner,0,'physical ownership must not be rewritten by the active representative');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.reborn.uid),
    'Monster Reborn must enter the active team Graveyard');
  assert.equal(current.state.core.players[0].lp,4000,'the activating team must not lose LP');
  assert.equal(current.state.core.players[1].lp,3500,'Gravekeeper\'s Curse inflicts exactly 500 shared damage');
  assert.deepEqual(holder(current.state,0).deck.map(card=>card.uid),partnerDeckBefore,
    'the inactive partner physical Deck must remain untouched');
  assertStable(fixture,current);
});

test('M350 Gravekeeper\'s Curse also triggers on a Normal Summon made by the active physical representative',async()=>{
  const fixture=setup('gravekeepers-curse-normal',{
    targetId:GRAVEKEEPERS_CURSE,targetSeat:2,specialSummon:false
  });
  let current=await normalSummon(fixture);
  current=await settleResponses(current,'gravekeepers-curse-normal');
  assert.equal(current.state.core.phase,'main');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.equal(current.state.core.players[1].lp,3500,'the onSummon trigger must resolve for a Normal Summon');
  assert.equal(current.state.core.players[0].lp,4000);
  assertStable(fixture,current);
});

test('M350 Sacred Crane draws from the active physical Deck when the inactive partner-owned monster is Special Summoned through Discord 2v2',async()=>{
  const fixture=setup('sacred-crane-special',{
    targetId:SACRED_CRANE,targetSeat:0,specialSummon:true,draw:true
  });
  const activeDeckBefore=holder(fixture.record.state,2).deck.length;
  const partnerDeckBefore=holder(fixture.record.state,0).deck.map(card=>card.uid);
  const partnerHandBefore=tag.tagMemberHand(fixture.record.state,member(0)).map(card=>card.uid);
  let current=await activateMonsterReborn(fixture);
  current=await settleResponses(current,'sacred-crane-special');
  assert.equal(current.state.core.phase,'main','Sacred Crane must draw before Main Phase resumes');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'the partner-owned Sacred Crane must remain on the shared allied field');
  assert.equal(holder(current.state,2).deck.length,activeDeckBefore-1,
    'Sacred Crane must draw exactly one card from the active physical representative Deck');
  assert.ok(tag.tagMemberHand(current.state,member(2)).some(card=>
    card.uid===fixture.drawRef.uid&&card.id===DRAW_ID
  ),'the active representative receives the drawn card in their own private hand');
  assert.ok(!tag.tagMemberHand(current.state,member(0)).some(card=>card.uid===fixture.drawRef.uid),
    'the inactive partner must not receive the active representative draw');
  assert.deepEqual(holder(current.state,0).deck.map(card=>card.uid),partnerDeckBefore,
    'the inactive partner physical Deck must remain unchanged');
  assert.deepEqual(tag.tagMemberHand(current.state,member(0)).map(card=>card.uid),partnerHandBefore,
    'the inactive partner private hand must remain unchanged');
  assert.equal(current.state.core.players[0].lp,4000);
  assert.equal(current.state.core.players[1].lp,4000);
  assertStable(fixture,current);
});

test('M350 Sacred Crane does not draw when it is Normal Summoned',async()=>{
  const fixture=setup('sacred-crane-normal',{
    targetId:SACRED_CRANE,targetSeat:2,specialSummon:false,draw:true
  });
  const activeDeckBefore=holder(fixture.record.state,2).deck.map(card=>card.uid);
  const activeHandBefore=tag.tagMemberHand(fixture.record.state,member(2)).map(card=>card.uid);
  let current=await normalSummon(fixture);
  current=await settleResponses(current,'sacred-crane-normal');
  assert.equal(current.state.core.phase,'main');
  assert.deepEqual(holder(current.state,2).deck.map(card=>card.uid),activeDeckBefore,
    'the Special Summon-only trigger must not draw after a Normal Summon');
  assert.deepEqual(tag.tagMemberHand(current.state,member(2)).map(card=>card.uid),activeHandBefore.filter(uid=>uid!==fixture.source.uid),
    'only the summoned Sacred Crane leaves the active physical hand; no draw is added');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assertStable(fixture,current);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
