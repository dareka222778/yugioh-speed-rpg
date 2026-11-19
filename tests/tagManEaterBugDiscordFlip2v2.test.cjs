'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m290-man-eater-discord-'));
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

const MAN_EATER_BUG='54652250';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monster fillers');
assert.equal(getPlayableCard(MAN_EATER_BUG)?.englishName,'Man-Eater Bug');
assert.equal(getPlayableCard(MAN_EATER_BUG)?.atk,450);
assert.equal(getPlayableCard(MAN_EATER_BUG)?.defense,600);
assert.equal(getCardStatus(MAN_EATER_BUG)?.stage,'certified');
assert.equal(getEffect(MAN_EATER_BUG)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(MAN_EATER_BUG),{
  trigger:'flip',operation:{kind:'destroy',target:'anyMonster'}
});
assert.equal(getMonsterDefinition(MAN_EATER_BUG)?.activation.window,'flip');

function member(seat){return 'm290-seat-'+seat;}
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
  throw new Error('M290 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
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
  const forged=interaction(record,partner,index,'m290-'+suffix+'-forged',actor);
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
    assert.ok(guard<40,'the Flip response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m290-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{targetSeat=null,targetFaceUp=true,allySeat=null}={}){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M290 Seat '+seat,
    cards:deck(seat===2?[MAN_EATER_BUG]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m290-'+scenario});
  state.core.turn=3;
  const actor=member(0);
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const source=placeMonster(state,2,MAN_EATER_BUG,false);
  const target=targetSeat===null?null:placeMonster(state,targetSeat,NORMALS[1],targetFaceUp);
  const ally=allySeat===null?null:placeMonster(state,allySeat,NORMALS[0],true);
  assert.match(source.uid,/^m2:/,'the flip source must retain the inactive partner physical UID');
  assert.equal(source.owner,0,'the source belongs to the allied team field');
  if(target){
    assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
    assert.equal(target.owner,targetSeat%2);
  }
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m290-'+scenario,guild='m290-guild',channel='m290-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M290 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,source,target,ally,before,record:store.getTag(id)};
}
async function flipThroughDiscord(fixture,suffix){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.mode==='flip'&&action.card===fixture.source.uid
  );
  assert.ok(index>=0,'the active teammate must see Flip Summon for the partner-owned source');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical source owner cannot execute the active teammate action');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),index,suffix);
  let current=await submit(fixture.record,fixture.actor,index,'m290-'+suffix+'-flip');
  current=await settleResponses(current,suffix+'-flip');
  assert.equal(current.state.core.phase,'choice','Man-Eater Bug must open its target choice after the Flip response window');
  return current;
}
async function destroySelected(fixture,record,target,suffix){
  const choices=tag.tagActions(record.state,fixture.actor);
  const index=choices.findIndex(action=>action.kind==='choose'&&action.target===target.uid);
  assert.ok(index>=0,'the Discord private menu must offer the selected field monster');
  return settleResponses(await submit(record,fixture.actor,index,'m290-'+suffix+'-choose'),suffix+'-choose');
}
function assertFinal(fixture,record,destroyedTeam,target){
  const state=record.state;
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp)||
    state.core.players[0].grave.some(card=>card.uid===fixture.source.uid),
    'the physical source must either remain face-up or be the explicitly selected self-target');
  if(target){
    assert.ok(state.core.players[destroyedTeam].grave.some(card=>card.uid===target.uid&&card.id===target.id),
      'the selected monster must enter its team shared Graveyard exactly as the same physical card');
    assert.ok(!state.core.players[destroyedTeam].monsters.some(card=>card.uid===target.uid));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('partner-owned Man-Eater Bug can destroy an allied teammate monster through the private Discord panel',async()=>{
  const fixture=setup('allied-target',{targetSeat:0});
  let current=await flipThroughDiscord(fixture,'allied-target');
  assert.ok(current.state.core.choice.targets.includes(fixture.source.uid));
  assert.ok(current.state.core.choice.targets.includes(fixture.target.uid));
  current=await destroySelected(fixture,current,fixture.target,'allied-target');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp));
  assert.ok(!current.state.core.players[0].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(current.state.core.players[1].monsters.length===0);
  assertFinal(fixture,current,0,fixture.target);
});
test('partner-owned Man-Eater Bug can destroy a face-down monster owned by the inactive opponent partner without revealing it publicly',async()=>{
  const fixture=setup('inactive-opponent-target',{targetSeat:3,targetFaceUp:false,allySeat:0});
  let current=await flipThroughDiscord(fixture,'inactive-opponent-target');
  assert.ok(current.state.core.choice.targets.includes(fixture.target.uid));
  assert.ok(current.state.core.choice.targets.includes(fixture.ally.uid));
  const publicState=JSON.stringify(tag.publicTagDuel(current.state));
  assert.ok(!publicState.includes(fixture.target.id),'face-down target identity must remain hidden in public duel state');
  assert.ok(!JSON.stringify(tagPublicMessage(current)).includes(fixture.target.id),
    'public Discord message must not disclose the face-down target identity before selection');
  current=await destroySelected(fixture,current,fixture.target,'inactive-opponent-target');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current,1,fixture.target);
});
test('partner-owned Man-Eater Bug may target itself when it is the only monster on the shared field',async()=>{
  const fixture=setup('self-target');
  let current=await flipThroughDiscord(fixture,'self-target');
  assert.deepEqual(current.state.core.choice.targets,[fixture.source.uid]);
  current=await destroySelected(fixture,current,fixture.source,'self-target');
  assert.ok(!current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  assertFinal(fixture,current,0,fixture.source);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
