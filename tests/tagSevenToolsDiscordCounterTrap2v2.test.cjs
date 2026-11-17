'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m335-seven-tools-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M335 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const SEVEN_TOOLS='03819470';
const TORRENTIAL='53582587';
const POT_OF_GREED='55144522';
for(const [id,name,kind] of [
  [SEVEN_TOOLS,'Seven Tools of the Bandit','sevenTools'],
  [TORRENTIAL,'Torrential Tribute','torrentialTribute'],
  [POT_OF_GREED,'Pot of Greed','potOfGreed']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getCardStatus(id)?.stage,'certified',name+' must retain its existing certificate');
  assert.equal(getEffect(id)?.kind,kind);
}
assert.equal(getPlayableCard(SEVEN_TOOLS)?.kind,'trap');
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.speed,3);
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.window,'trapActivated');
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.damage,'counter');
assert.equal(getActivationModel(getEffect(TORRENTIAL))?.window,'summoned');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks require at least twenty certified Normal Monsters');

function member(seat){return 'm335-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain at least twenty distinct cards');
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
  throw new Error('M335 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function setBackrow(state,seat,id){
  const card=takePhysical(state,seat,id);
  const placed={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(placed);
  return placed;
}
function assertRules(state,initialDeckSizes){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  if(initialDeckSizes)assert.deepEqual(initialDeckSizes,[20,20,20,20]);
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
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
  assert.equal(cards.length,before.size,'the Counter Trap chain must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertHidden(publicState,cards){
  for(const card of cards){
    assert.ok(!publicState.includes(card.id),'a Set Trap identity leaked: '+card.uid);
    assert.ok(!publicState.includes(card.uid),'a Set Trap UID leaked: '+card.uid);
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose legal action index '+index);
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
async function rejectInactivePartner(record,activeSeat,inactiveSeat,index,suffix){
  const forged=interaction(record,member(inactiveSeat),index,'m335-'+suffix+'-forged',member(activeSeat));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'an inactive partner cannot mutate the response chain or pay a cost');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Counter Trap chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m335-'+suffix+'-pass-'+guard);
  }
  return current;
}
function saveSession(state,id){
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M335 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m335-guild','m335-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setupPositive(){
  const normal=NORMALS[0].id;
  const required=[
    [normal],
    [],
    [SEVEN_TOOLS],
    [TORRENTIAL]
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M335 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m335-seven-tools-positive'});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const monster=ensureInHand(state,0,normal);
  const seven=setBackrow(state,2,SEVEN_TOOLS);
  const torrential=setBackrow(state,3,TORRENTIAL);
  const before=inventory(state);
  assert.match(monster.uid,/^m0:/);
  assert.match(seven.uid,/^m2:/,'Seven Tools must retain inactive physical seat 2 ownership');
  assert.match(torrential.uid,/^m3:/,'Torrential Tribute must retain inactive physical seat 3 ownership');
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[seven,torrential]);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {monster,seven,torrential,before,initialDeckSizes,
    record:saveSession(state,'m335-seven-tools-positive')};
}
function setupNegative(){
  const required=[
    [POT_OF_GREED],
    [],
    [],
    [SEVEN_TOOLS]
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M335 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m335-seven-tools-negative'});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const pot=ensureInHand(state,0,POT_OF_GREED);
  const seven=setBackrow(state,3,SEVEN_TOOLS);
  const before=inventory(state);
  const deckBefore=holder(state,0).deck.length;
  const handBefore=tag.tagMemberHand(state,member(0)).length;
  assert.match(seven.uid,/^m3:/);
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[seven]);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {pot,seven,before,deckBefore,handBefore,initialDeckSizes,
    record:saveSession(state,'m335-seven-tools-negative')};
}

test('Seven Tools set by the inactive partner negates Torrential Tribute through Discord 2v2 and pays 1000 shared LP',async()=>{
  const f=setupPositive();
  let actions=tag.tagActions(f.record.state,member(0));
  let index=actions.findIndex(action=>action.kind==='summon'&&action.card===f.monster.uid&&action.position==='atk');
  assert.ok(index>=0,'the active seat must receive the Normal Summon action in its private Discord menu');
  let current=await submit(f.record,member(0),index,'m335-normal-summon');
  assert.equal(current.state.core.phase,'response','the Normal Summon must open a real Trap response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),
    'the active physical representative of the opposing team receives summon response priority');

  actions=tag.tagActions(current.state,member(1));
  index=actions.findIndex(action=>action.kind==='trap'&&action.card===f.torrential.uid);
  assert.ok(index>=0,'the active opponent must receive the partner-set Torrential Tribute action');
  current=await submit(current,member(1),index,'m335-torrential-activate');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(0),
    'the active summoning representative receives priority to answer the activated Trap');

  actions=tag.tagActions(current.state,member(0));
  index=actions.findIndex(action=>action.kind==='trap'&&action.card===f.seven.uid&&action.target===f.torrential.uid);
  assert.ok(index>=0,'Seven Tools must target the exact active Torrential Tribute chain link');
  await rejectInactivePartner(current,0,2,index,'seven-tools');
  current=await submit(current,member(0),index,'m335-seven-tools-activate');
  assert.equal(current.state.core.players[0].lp,3000,
    'the active team pays exactly 1000 shared LP at activation');
  current=await settleResponses(current,'seven-tools-resolve');

  const state=current.state;
  assert.equal(state.core.phase,'main');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(state.core.players[0].lp,3000);
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===f.monster.uid),
    'the Normal Summoned monster survives because Torrential Tribute was negated');
  assert.deepEqual(state.core.players[1].monsters,[],
    'the negated Torrential Tribute must not destroy the summoned monster');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===f.seven.uid&&card.id===SEVEN_TOOLS),
    'the partner-owned Seven Tools enters the activating team Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===f.torrential.uid&&card.id===TORRENTIAL),
    'the negated Torrential Tribute enters the opposing team Graveyard');
  assertConserved(state,f.before);
  assertPrivateHands(state);
  assertRules(state,f.initialDeckSizes);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('Seven Tools does not answer a Spell activation and never pays its LP cost outside a Trap chain',async()=>{
  const f=setupNegative();
  const actions=tag.tagActions(f.record.state,member(0));
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===f.pot.uid);
  assert.ok(index>=0,'the active seat must receive Pot of Greed');
  let current=await submit(f.record,member(0),index,'m335-pot-of-greed');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1));
  const responseActions=tag.tagActions(current.state,member(1));
  assert.ok(!responseActions.some(action=>action.kind==='trap'&&action.card===f.seven.uid),
    'Seven Tools must not appear against a Spell activation');
  assert.equal(tag.tagActions(current.state,member(3)).length,0,
    'the inactive physical owner cannot activate the shared Set Counter Trap');
  current=await settleResponses(current,'seven-tools-negative');
  const state=current.state;
  assert.equal(state.core.phase,'main');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.equal(holder(state,0).deck.length,f.deckBefore-2,
    'Pot of Greed resolves because Seven Tools cannot negate a Spell');
  assert.equal(tag.tagMemberHand(state,member(0)).length,f.handBefore+1,
    'the active hand gains exactly two cards after spending Pot of Greed');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===f.pot.uid));
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===f.seven.uid&&!card.faceUp),
    'the unused partner-owned Seven Tools remains Set and hidden');
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[f.seven]);
  assertConserved(state,f.before);
  assertPrivateHands(state);
  assertRules(state,f.initialDeckSizes);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
