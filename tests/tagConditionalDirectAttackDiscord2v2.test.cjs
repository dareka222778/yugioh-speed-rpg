'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m353-direct-attack-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const BLACK_TYRANNO='38670435';
const ROCKET_JUMPER='53890795';
const DRILLAGO='99050989';
const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';
const BOTTOMLESS='29401950';

const CASES=[
  {
    key:'black-tyranno-defense-only',
    name:'Black Tyranno attacks directly when both opposing seats have only Defense Position monsters',
    source:BLACK_TYRANNO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'def'},
      {seat:3,id:BLUE_EYES,faceUp:false,position:'def'}
    ],
    expectedDamage:2600,
    direct:true
  },
  {
    key:'rocket-jumper-defense-only',
    name:'Rocket Jumper attacks directly when both opposing seats have only Defense Position monsters',
    source:ROCKET_JUMPER,
    opponents:[
      {seat:1,id:BLUE_EYES,faceUp:true,position:'def'},
      {seat:3,id:DARK_MAGICIAN,faceUp:true,position:'def'}
    ],
    expectedDamage:1000,
    direct:true
  },
  {
    key:'black-tyranno-opponent-attack-position',
    name:'Black Tyranno loses its direct-attack permission when either opposing seat has an Attack Position monster',
    source:BLACK_TYRANNO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'def'},
      {seat:3,id:BLUE_EYES,faceUp:true,position:'atk'}
    ],
    direct:false
  },
  {
    key:'black-tyranno-opponent-backrow',
    source:BLACK_TYRANNO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'def'},
      {seat:3,id:BLUE_EYES,faceUp:true,position:'def'}
    ],
    backrow:[{seat:3,id:BOTTOMLESS}],
    direct:false
  },
  {
    key:'drillago-minimum-atk',
    name:'Drillago attacks directly when every face-up opposing monster has at least 1600 ATK',
    source:DRILLAGO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'atk'},
      {seat:3,id:BLUE_EYES,faceUp:true,position:'atk'}
    ],
    expectedDamage:1600,
    direct:true
  },
  {
    key:'drillago-low-atk',
    name:'Drillago loses direct-attack permission when one opposing seat has a face-up monster below 1600 ATK',
    source:DRILLAGO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'atk'},
      {seat:3,id:CELTIC_GUARDIAN,faceUp:true,position:'atk'}
    ],
    direct:false
  },
  {
    key:'drillago-opponent-backrow',
    source:DRILLAGO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'atk'},
      {seat:3,id:BLUE_EYES,faceUp:true,position:'atk'}
    ],
    backrow:[{seat:1,id:BOTTOMLESS}],
    direct:false
  },
  {
    key:'drillago-facedown',
    name:'Drillago cannot assume a face-down opposing monster meets its face-up 1600 ATK condition',
    source:DRILLAGO,
    opponents:[
      {seat:1,id:DARK_MAGICIAN,faceUp:true,position:'atk'},
      {seat:3,id:BLUE_EYES,faceUp:false,position:'def'}
    ],
    direct:false
  }
];

for(const [id,name,atk] of [
  [BLACK_TYRANNO,'Black Tyranno',2600],
  [ROCKET_JUMPER,'Rocket Jumper',1000],
  [DRILLAGO,'Drillago',1600]
]){
  assert.equal(getPlayableCard(id)?.englishName,name,'M353 canonical identity: '+id);
  assert.equal(getPlayableCard(id)?.atk,atk,'M353 ATK: '+name);
  assert.equal(getCardStatus(id)?.stage,'certified','M353 only adds Discord coverage for an already-certified card');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
assert.equal(getPlayableCard(BOTTOMLESS)?.englishName,'Bottomless Trap Hole');
assert.equal(getPlayableCard(BOTTOMLESS)?.kind,'trap');
assert.equal(getCardStatus(BOTTOMLESS)?.stage,'certified');

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require at least twenty distinct certified Normal Monsters');

function member(seat){return 'm353-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain at least twenty distinct cards');
  const result=ids.slice(0,20);
  for(const id of required)assert.ok(result.includes(id),'required card missing from physical Deck: '+id);
  return result;
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
  throw new Error('M353 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function placeBackrow(state,seat,id){
  const card=takePhysical(state,seat,id);
  const trap={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(trap);
  return trap;
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
  assert.equal(cards.length,before.size,'direct-attack resolution must conserve every physical card');
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
  const forged=interaction(record,partner,index,'m353-'+suffix+'-forged',actor);
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
    current=await submit(current,actor,pass,'m353-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m353-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M353 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m353-guild','m353-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(entry){
  const required=[[],[],[],[]];
  required[0].push(entry.source);
  for(const opponent of entry.opponents)required[opponent.seat].push(opponent.id);
  for(const card of entry.backrow||[])required[card.seat].push(card.id);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M353 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m353-'+entry.key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const source=placeMonster(state,0,entry.source);
  const opponents=entry.opponents.map(opponent=>
    placeMonster(state,opponent.seat,opponent.id,opponent.faceUp,opponent.position)
  );
  const backrow=(entry.backrow||[]).map(card=>placeBackrow(state,card.seat,card.id));
  assert.match(source.uid,/^m0:/,'the direct attacker must retain inactive partner seat 0 physical ownership');
  assert.equal(source.owner,0);
  for(let i=0;i<opponents.length;i++){
    assert.match(opponents[i].uid,new RegExp('^m'+entry.opponents[i].seat+':'));
    assert.equal(opponents[i].owner,1);
  }
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,entry.key);
  assertPublicPayload(record);
  return {entry,source,opponents,backrow,before,record};
}
async function enterBattle(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active representative must receive the legal Battle Phase action');
  await rejectInactivePartner(fixture.record,actor,member(0),index,fixture.entry.key+'-battle');
  let current=await submit(fixture.record,actor,index,'m353-'+fixture.entry.key+'-battle');
  current=await settleResponses(current,fixture.entry.key+'-battle-start');
  assert.equal(current.state.core.phase,'battle','the Discord action must enter the Battle Phase');
  return current;
}
async function resolveDirectAttack(fixture){
  const actor=member(2);
  let current=await enterBattle(fixture);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===undefined
  );
  if(!fixture.entry.direct){
    assert.equal(index,-1,'the shared opposing field must invalidate this conditional direct attack');
    assertConserved(current.state,fixture.before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assertPublicPayload(current);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    return;
  }
  assert.ok(index>=0,'the Discord action list must expose the legal conditional direct attack');
  await rejectInactivePartner(current,actor,member(0),index,fixture.entry.key+'-attack');
  const ownLP=current.state.core.players[0].lp;
  const opponentLP=current.state.core.players[1].lp;
  const direct=await submit(current,actor,index,'m353-'+fixture.entry.key+'-direct');
  current=await settleResponses(direct,fixture.entry.key+'-direct');
  assert.equal(current.state.core.players[0].lp,ownLP,'direct attack must not damage the attacking team');
  assert.equal(current.state.core.players[1].lp,opponentLP-fixture.entry.expectedDamage,
    'direct battle damage must reach only the opposing shared LP');
  assert.ok(current.state.core.players[0].monsters.some(card=>
    card.uid===fixture.source.uid&&card.id===fixture.entry.source
  ),'the partner-owned attacker remains on the shared allied field');
  for(const opponent of fixture.opponents){
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===opponent.uid),
      'direct attack must not remove an opposing monster');
  }
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}
function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M353 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}
  });
}
for(const entry of CASES){
  test('M353 '+entry.name+' resolves through Discord 2v2',async()=>{
    const fixture=setup(entry);
    await resolveDirectAttack(fixture);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
