'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m331-m332-global-backrow-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M331-M332 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const HEAVY_STORM='19613556';
const HARPIE_DUSTER='18144506';
const MIRROR_FORCE='44095762';
const TORRENTIAL='53582587';
const SEVEN_TOOLS='03819470';
const SAKURETSU='56120475';
const SOGEN='86318356';
const MOUNTAIN='50913601';
const SPELLS=[
  {id:HEAVY_STORM,name:'Heavy Storm',scope:'all'},
  {id:HARPIE_DUSTER,name:"Harpie's Feather Duster",scope:'opponent'}
];
for(const card of SPELLS){
  assert.equal(getPlayableCard(card.id)?.englishName,card.name,card.name+' must be playable');
  assert.equal(getPlayableCard(card.id)?.kind,'spell');
  assert.equal(getCardStatus(card.id)?.stage,'certified',card.name+' must retain its existing certificate');
  assert.deepEqual(getEffect(card.id),{kind:'destroySpellTraps',scope:card.scope});
  assert.deepEqual(getActivationModel(getEffect(card.id)),{speed:1,window:'main',damage:'never'});
}
for(const id of [MIRROR_FORCE,TORRENTIAL,SEVEN_TOOLS,SAKURETSU,SOGEN,MOUNTAIN]){
  assert.ok(getPlayableCard(id),'the physical fixture card '+id+' must already be playable');
}

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks require at least twenty certified Normal Monsters');

function member(seat){return 'm331-seat-'+seat;}
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
  throw new Error('M331-M332 physical card missing from seat '+seat+': '+id);
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
function setField(state,seat,id){
  const card=takePhysical(state,seat,id);
  const placed={...card,faceUp:true,setTurn:0,resolved:true};
  state.core.players[seat%2].field=placed;
  return placed;
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5,'physical Extra Deck limit is five');
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
  assert.equal(cards.length,before.size,'global backrow destruction must not create or remove cards');
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
    assert.ok(!publicState.includes(card.id),'a Set Spell/Trap identity leaked: '+card.uid);
    assert.ok(!publicState.includes(card.uid),'a Set Spell/Trap UID leaked: '+card.uid);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m331-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected inactive partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Spell response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m331-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(spellId,scenario){
  const ids=[0,1,2,3].map(member);
  const normalA=NORMALS[0].id,normalB=NORMALS[1].id;
  const required=[
    [spellId,MIRROR_FORCE,normalA],
    [TORRENTIAL],
    [SEVEN_TOOLS,SOGEN],
    [SAKURETSU,MOUNTAIN,normalB]
  ];
  const players=ids.map((id,seat)=>({id,name:'M331 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m331-'+scenario});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const spell=ensureInHand(state,0,spellId);
  const alliedSet0=setBackrow(state,0,MIRROR_FORCE);
  const opponentSet0=setBackrow(state,1,TORRENTIAL);
  const alliedSet2=setBackrow(state,2,SEVEN_TOOLS);
  const opponentSet2=setBackrow(state,3,SAKURETSU);
  const alliedField=setField(state,2,SOGEN);
  const opponentField=setField(state,3,MOUNTAIN);
  const monsters=[deploy(state,0,normalA),deploy(state,3,normalB)];
  const before=inventory(state);
  assert.match(spell.uid,/^m0:/,'the Normal Spell remains owned by physical seat 0');
  assert.match(alliedSet2.uid,/^m2:/,'the allied Set card retains inactive partner seat 2 ownership');
  assert.match(opponentSet2.uid,/^m3:/,'the opposing Set card retains inactive partner seat 3 ownership');
  assert.match(alliedField.uid,/^m2:/);
  assert.match(opponentField.uid,/^m3:/);
  assertRules(state,initialDeckSizes);
  assertPrivateHands(state);
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[alliedSet0,opponentSet0,alliedSet2,opponentSet2]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m331-'+scenario,guild='m331-guild',channel='m331-channel';
  const members=ids.map((id,seat)=>({id,name:'M331 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,spell,alliedSet0,opponentSet0,alliedSet2,opponentSet2,alliedField,opponentField,monsters,before,initialDeckSizes,record:store.getTag(id)};
}
function inGrave(state,team,card){
  return state.core.players[team].grave.some(entry=>entry.uid===card.uid&&entry.id===card.id);
}
async function activate(fixture){
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid);
  assert.ok(index>=0,'the active seat must receive the Normal Spell action in its private Discord menu');
  assert.equal(tag.tagActions(fixture.record.state,member(2)).length,0,
    'the inactive allied partner cannot act while seat 0 is active');
  await rejectInactivePartner(fixture.record,actor,member(2),index,fixture.id);
  const activated=await submit(fixture.record,actor,index,fixture.id+'-activate');
  return settleResponses(activated,fixture.id+'-resolve');
}
function assertMonstersUnchanged(state,monsters){
  assert.deepEqual(state.core.players.map(team=>team.monsters.map(card=>card.uid)),
    monsters.map(card=>[card.uid]),'Spell/Trap destruction must not affect either Monster Zone');
}
function assertFinalCommon(fixture,record){
  assert.ok(inGrave(record.state,0,fixture.spell),'the activated Normal Spell enters its activating team Graveyard');
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state,fixture.initialDeckSizes);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}

test('Heavy Storm destroys both shared backrows and both Field Zones through Discord 2v2',async()=>{
  const f=setup(HEAVY_STORM,'heavy-storm');
  const current=await activate(f);
  assert.deepEqual(current.state.core.players.map(team=>team.backrow),[[],[]],
    'Heavy Storm must destroy every Set Spell/Trap on both shared fields');
  assert.deepEqual(current.state.core.players.map(team=>team.field),[null,null],
    'Heavy Storm must destroy both shared Field Zones');
  assertMonstersUnchanged(current.state,f.monsters);
  for(const card of [f.alliedSet0,f.alliedSet2,f.alliedField])
    assert.ok(inGrave(current.state,0,card),'team 0 cards enter its shared Graveyard: '+card.uid);
  for(const card of [f.opponentSet0,f.opponentSet2,f.opponentField])
    assert.ok(inGrave(current.state,1,card),'team 1 cards enter its shared Graveyard: '+card.uid);
  assertFinalCommon(f,current);
});

test("Harpie's Feather Duster destroys only the opposing shared backrow and Field Zone through Discord 2v2",async()=>{
  const f=setup(HARPIE_DUSTER,'harpie-feather-duster');
  const current=await activate(f);
  assert.deepEqual(current.state.core.players[0].backrow.map(card=>card.uid),
    [f.alliedSet0.uid,f.alliedSet2.uid],'the activating team backrow must survive');
  assert.equal(current.state.core.players[0].field?.uid,f.alliedField.uid,
    'the activating team Field Zone must survive');
  assert.deepEqual(current.state.core.players[1].backrow,[],
    'both opposing physical members share the affected backrow');
  assert.equal(current.state.core.players[1].field,null,'the opposing shared Field Zone must be destroyed');
  assertMonstersUnchanged(current.state,f.monsters);
  for(const card of [f.opponentSet0,f.opponentSet2,f.opponentField])
    assert.ok(inGrave(current.state,1,card),'opposing physical cards enter the opposing shared Graveyard: '+card.uid);
  for(const card of [f.alliedSet0,f.alliedSet2,f.alliedField])
    assert.ok(!inGrave(current.state,0,card),'allied backrow/Field cards must not be destroyed');
  assertHidden(JSON.stringify(tag.publicTagDuel(current.state)),[f.alliedSet0,f.alliedSet2]);
  assertFinalCommon(f,current);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
