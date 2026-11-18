'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m348-puppeteer-'));
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

const PUPPETEER='54098121';
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monsters');
assert.equal(getPlayableCard(PUPPETEER)?.englishName,'Mysterious Puppeteer');
assert.equal(getCardStatus(PUPPETEER)?.stage,'certified');
assert.equal(getEffect(PUPPETEER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(PUPPETEER),{
  trigger:'onOtherSummon',
  operation:{kind:'heal',amount:500}
});
assert.equal(getMonsterDefinition(PUPPETEER)?.activation.policy,'mandatory');
const NORMAL_ID=SAFE_NORMALS[0];
assert.equal(getPlayableCard(NORMAL_ID)?.monsterType,'normal');

function member(seat){return 'm348-seat-'+seat;}
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
  throw new Error('M348 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)return physical.hand[index];
  index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the active physical Deck must contain '+id+' for seat '+seat);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
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
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
    assert.ok((team.extra??[]).length<=5,'Extra Deck remains capped at five');
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
  assert.equal(cards.length,before.size,'trigger resolution must conserve every physical card');
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
  assert.ok(refreshes>=1,'the committed action must refresh the public Discord panel');
  return store.getTag(record.id);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m348-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m348-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M348 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m348-guild','m348-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(key,actorSeat){
  const required=[[],[],[],[]];
  required[0].push(PUPPETEER);
  required[actorSeat].push(NORMAL_ID);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M348 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m348-'+key});
  state.core.turn=3;
  state.core.players[0].lp=3500;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  if(actorSeat===3){
    state.cursor=3;
    state.core.current=1;
    state.core.teamRotation.cursor=3;
  }
  const source=deploy(state,0,PUPPETEER);
  const summonRef=ensureInHand(state,actorSeat,NORMAL_ID);
  assert.match(source.uid,/^m0:/,'Mysterious Puppeteer must be physically owned by inactive partner seat 0');
  assert.match(summonRef.uid,new RegExp('^m'+actorSeat+':'),
    'the summoned Normal Monster must remain in its physical owner hand');
  assert.equal(tag.tagDecisionMember(state).id,member(actorSeat));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,key);
  assertPublicPayload(record);
  return {key,actorSeat,source,summonRef,before,record};
}
for(const actorSeat of [2,3]){
  const label=actorSeat===2?'own-team-normal-summon':'opposing-team-normal-summon';
  test('Mysterious Puppeteer owned by the inactive partner gains 500 shared LP when '+label+' resolves through Discord 2v2',async()=>{
    const fixture=setup(label,actorSeat);
    const actor=member(actorSeat);
    const actions=tag.tagActions(fixture.record.state,actor);
    const summonIndex=actions.findIndex(action=>
      action.kind==='summon'&&action.card===fixture.summonRef.uid&&action.position==='atk'
    );
    assert.ok(summonIndex>=0,'the active physical representative must receive the legal Normal Summon action');
    const inactivePartner=actorSeat===2?member(0):member(1);
    const partnerPanel=tagPrivateMessage(fixture.record,inactivePartner);
    validateDiscordPayload(partnerPanel);
    const partnerRows=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerRows.some(row=>row.custom_id?.startsWith('tag:act:')),
      'the inactive physical partner must not receive the active representative action menu');
    let current=await submit(fixture.record,actor,summonIndex,'m348-'+label+'-summon');
    current=await settleResponses(current,label);
    assert.equal(current.state.core.phase,'main','mandatory on-other-summon trigger resolves before Main Phase resumes');
    assert.equal(current.state.core.players[0].lp,4000,
      'Mysterious Puppeteer heals its controller team by exactly 500 shared LP');
    assert.equal(current.state.core.players[1].lp,4000,
      'the opposing team LP must remain unchanged');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
      'the partner-owned Mysterious Puppeteer remains face-up on the shared team field');
    assert.ok(current.state.core.players[actorSeat%2].monsters.some(card=>card.uid===fixture.summonRef.uid),
      'the summoned Normal Monster remains on its correct shared team field');
    assertConserved(current.state,fixture.before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assertPublicPayload(current);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
