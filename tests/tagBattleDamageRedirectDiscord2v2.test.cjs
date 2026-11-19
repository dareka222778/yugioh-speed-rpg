'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m371-battle-redirect-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {engineCatalog,enabledCardIds,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {withCatalog}=require('../dist/catalogContext');
const {battleEffectMonsters45}=require('../dist/battleEffectBatch45');
const {rulesFor}=require('../dist/rulesProfile');

const SWORDS='94004268';
const FIREFLY='87340664';
const OPPONENT='80000001';
const DARK_MAGICIAN='46986414';

function customCard(id,name,atk,defense,race,attribute){
  return {
    id,konamiId:999999,name,englishName:name,kind:'monster',monsterType:'effect',
    race,attribute,level:4,atk,defense,summary:'M371 isolated Discord fixture',
    source:'https://www.db.yugioh-card.com/yugiohdb/',
  };
}
const addedCards=[
  customCard(SWORDS,'Amazoness Swords Woman',1500,1600,'Warrior','EARTH'),
  customCard(FIREFLY,'Atomic Firefly',1000,800,'Insect','FIRE'),
  customCard(OPPONENT,'M371 Opponent',2000,1000,'Beast','EARTH'),
];
const cards=[...engineCatalog.filter(card=>!addedCards.some(extra=>extra.id===card.id)),...addedCards];
const metadata=new Map(cards.map(card=>[card.id,card]));
const statuses=new Map(enabledCardIds.map(id=>[id,{stage:'certified'}]));
for(const card of addedCards)statuses.set(card.id,{stage:'certified'});
const effects=new Map();
for(const id of enabledCardIds){const effect=getEffect(id);if(effect)effects.set(id,effect);}
const catalog={
  id:'m371-'+('a'.repeat(59)),
  data:{
    format:1,engineVersion:'engine-v9',cards,effects:Object.fromEntries(effects),
    monsters:battleEffectMonsters45,certificates:{},
  },
  metadata,effects,statuses,enabled:[...enabledCardIds,...addedCards.map(card=>card.id)],
};

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=engineCatalog.find(value=>value.id===id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks need at least twenty distinct Normal Monsters');

function member(seat){return 'm371-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain twenty distinct cards');
  const result=ids.slice(0,20);
  for(const id of required)assert.ok(result.includes(id),'required card missing from seat Deck: '+id);
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
  throw new Error('M371 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,physicalSeat,controllerTeam,id,position='atk',faceUp=true){
  const card=takePhysical(state,physicalSeat,id);
  const monster={
    ...card,owner:physicalSeat%2,position,faceUp,entered:state.core.turn,
    changed:state.core.turn,attacked:0,atkBoost:0,defBoost:0,
  };
  state.core.players[controllerTeam].monsters.push(monster);
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
  const inventory=tag.tagInventory(state);
  for(const seat of [0,1,2,3]){
    assert.equal(inventory.filter(card=>card.uid.startsWith('m'+seat+':')).length,20,
      'each physical player must retain exactly twenty unique card identities');
    assert.ok((holder(state,seat).extra??[]).length<=5);
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle resolution must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'public state leaked private hand UID for seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked UID '+card.uid);
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
    calls,
  };
}
async function submit(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'active representative must receive a private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'private Discord menu must expose legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'committed action must refresh the public Discord panel');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,index,key){
  const actorSeat=record.state.members.findIndex(member=>member.id===actor);
  const team=actorSeat%2;
  const activeSeat=record.state.active[team];
  const partner=team===0?(activeSeat===0?2:0):(activeSeat===1?3:1);
  const partnerId=member(partner);
  const panel=tagPrivateMessage(record,partnerId);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'inactive physical partner must not receive the active action menu');
  const forged=interaction(record,partnerId,index,'m371-'+key+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'forged partner action must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,key){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'current responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m371-'+key+'-pass-'+guard+'-'+randomUUID());
  }
  return current;
}
function register(state,key){
  const id='m371-'+key+'-'+randomUUID();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M371 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m371-guild','m371-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(spec){
  const required=[[],[],[],[]];
  required[spec.sourceSeat].push(spec.sourceId);
  required[spec.targetSeat].push(spec.targetId);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M371 Seat '+seat,cards:deck(required[seat]),
  }));
  const state=tag.createTagDuel(players,{classic:true,first:spec.first,seed:'m371-'+spec.key});
  state.core.turn=3;
  const source=placeMonster(state,spec.sourceSeat,spec.sourceController,spec.sourceId);
  const target=placeMonster(state,spec.targetSeat,spec.targetController,spec.targetId);
  assert.equal(source.owner,spec.sourceSeat%2);
  assert.equal(target.owner,spec.targetSeat%2);
  assert.match(source.uid,new RegExp('^m'+spec.sourceSeat+':'));
  assert.match(target.uid,new RegExp('^m'+spec.targetSeat+':'));
  assert.equal(tag.tagDecisionMember(state).id,member(spec.first));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,spec.key);
  assertPublicPayload(record);
  return {spec,source,target,before,record};
}
async function enterBattle(fixture){
  const actor=tag.tagDecisionMember(fixture.record.state).id;
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'active representative must receive the legal Battle Phase action');
  await rejectInactivePartner(fixture.record,actor,index,fixture.spec.key+'-battle');
  let current=await submit(fixture.record,actor,index,'m371-'+fixture.spec.key+'-battle');
  current=await settleResponses(current,fixture.spec.key+'-battle-start');
  assert.equal(current.state.core.phase,'battle','Discord action must enter Battle Phase');
  return current;
}
async function resolveBattle(fixture){
  const spec=fixture.spec;
  let current=await enterBattle(fixture);
  const actor=tag.tagDecisionMember(current.state).id;
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===spec.attackerUid&&action.target===spec.targetUid
  );
  assert.ok(index>=0,'Discord action list must expose the intended battle');
  await rejectInactivePartner(current,actor,index,spec.key+'-attack');
  const beforeLP=current.state.core.players.map(team=>team.lp);
  const attacked=await submit(current,actor,index,'m371-'+spec.key+'-attack');
  current=await settleResponses(attacked,spec.key+'-attack-resolution');
  assert.equal(current.state.core.players[0].lp,beforeLP[0]-spec.expectedDamage[0],
    'team 0 LP delta must match the official battle/effect outcome');
  assert.equal(current.state.core.players[1].lp,beforeLP[1]-spec.expectedDamage[1],
    'team 1 LP delta must match the official battle/effect outcome');
  assert.ok(current.state.core.players[fixture.spec.sourceController].grave.some(card=>card.uid===fixture.source.uid)||
    current.state.core.players[fixture.spec.sourceSeat%2].grave.some(card=>card.uid===fixture.source.uid),
    'destroyed source must enter the physical owner team Graveyard');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  return current;
}

test('M371 Amazoness Swords Woman redirects its attacking battle damage through Discord 2v2',async()=>{
  await withCatalog(catalog,async()=>{
    const fixture=setup({
      key:'swords-attacking',first:2,sourceSeat:0,sourceController:0,sourceId:SWORDS,
      targetSeat:1,targetController:1,targetId:OPPONENT,attackerUid:'',targetUid:'',
      expectedDamage:[0,500],
    });
    fixture.spec.attackerUid=fixture.source.uid;
    fixture.spec.targetUid=fixture.target.uid;
    const result=await resolveBattle(fixture);
    assert.ok(result.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
    assert.ok(result.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  });
});

test('M371 Amazoness Swords Woman redirects damage when defending through Discord 2v2',async()=>{
  await withCatalog(catalog,async()=>{
    const fixture=setup({
      key:'swords-defending',first:1,sourceSeat:0,sourceController:0,sourceId:SWORDS,
      targetSeat:3,targetController:1,targetId:OPPONENT,attackerUid:'',targetUid:'',
      expectedDamage:[0,500],
    });
    fixture.spec.attackerUid=fixture.target.uid;
    fixture.spec.targetUid=fixture.source.uid;
    const result=await resolveBattle(fixture);
    assert.ok(result.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
    assert.ok(result.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  });
});

test('M371 Atomic Firefly burns the opposing team after ordinary battle destruction through Discord 2v2',async()=>{
  await withCatalog(catalog,async()=>{
    const fixture=setup({
      key:'firefly-ordinary',first:2,sourceSeat:1,sourceController:1,sourceId:FIREFLY,
      targetSeat:0,targetController:0,targetId:OPPONENT,attackerUid:'',targetUid:'',
      expectedDamage:[1000,1000],
    });
    fixture.spec.attackerUid=fixture.target.uid;
    fixture.spec.targetUid=fixture.source.uid;
    const result=await resolveBattle(fixture);
    assert.ok(result.state.core.players[1].grave.some(card=>card.uid===fixture.source.uid));
    assert.ok(!result.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  });
});

test('M371 Atomic Firefly targets the team opposing its current controller, not physical owner, through Discord 2v2',async()=>{
  await withCatalog(catalog,async()=>{
    const fixture=setup({
      key:'firefly-stolen',first:2,sourceSeat:0,sourceController:1,sourceId:FIREFLY,
      targetSeat:2,targetController:0,targetId:OPPONENT,attackerUid:'',targetUid:'',
      expectedDamage:[1000,1000],
    });
    fixture.spec.attackerUid=fixture.target.uid;
    fixture.spec.targetUid=fixture.source.uid;
    const result=await resolveBattle(fixture);
    assert.ok(result.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid),
      'stolen Firefly must return to its physical owner team Graveyard');
    assert.ok(!result.state.core.players[1].grave.some(card=>card.uid===fixture.source.uid));
  });
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
