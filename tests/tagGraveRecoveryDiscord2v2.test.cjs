'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m261-grave-recovery-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MAGICIAN_OF_FAITH='31560081';
const MASK_OF_DARKNESS='28933734';
const POT_OF_GREED='55144522';
const TRAP_HOLE='04206964';
const NORMALS=[...new Set(tag.tagNormalCardIds)].slice(0,6);
const POOL=[MAGICIAN_OF_FAITH,MASK_OF_DARKNESS,POT_OF_GREED,TRAP_HOLE,...NORMALS];
assert.equal(NORMALS.length,6);
assert.equal(POOL.length,10);
assert.equal(getPlayableCard(MAGICIAN_OF_FAITH)?.englishName,'Magician of Faith');
assert.equal(getPlayableCard(MASK_OF_DARKNESS)?.englishName,'Mask of Darkness');
assert.deepEqual(getMonsterEffect(MAGICIAN_OF_FAITH),{trigger:'flip',operation:{kind:'recover',cardKind:'spell'}});
assert.deepEqual(getMonsterEffect(MASK_OF_DARKNESS),{trigger:'flip',operation:{kind:'recover',cardKind:'trap'}});
assert.equal(getEffect(MAGICIAN_OF_FAITH)?.kind,'monsterEffect');
assert.equal(getEffect(MASK_OF_DARKNESS)?.kind,'monsterEffect');

function member(caseKey,seat){return 'm261-'+caseKey+'-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
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
  throw new Error('M261 fixture card missing from physical seat '+seat+': '+id);
}
function placeSource(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putInGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'flip recovery must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'flip recovery must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state,ids){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const id of ids)for(const card of tag.tagMemberHand(state,id)){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked: '+card.uid);
  }
}
function interaction(sessionId,requestId,customId,actor,index,expectedRevision,guildId){
  const calls=[];
  return {
    id:requestId,guildId,user:{id:actor},customId,values:[String(index)],
    isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(sessionId).revision,expectedRevision,
        'Discord acknowledgement must observe the persisted revision before mutation');
      calls.push('defer');
    },
    editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},
    calls
  };
}
async function submit(record,actor,index,requestId,expectedRevision,guildId){
  const customId='tag:act:'+record.id+':'+record.revision+':'+actor;
  const i=interaction(record.id,requestId,customId,actor,index,expectedRevision,guildId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit'],'the real Discord route must acknowledge before publishing the private panel');
  assert.ok(refreshes>=1,'the public shared-field panel must refresh after the action');
}
async function settleThroughDiscord(sessionId,guildId,requestPrefix){
  let current=store.getTag(sessionId);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'flip-trigger response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
}
function setup(caseKey,sourceId,targetOwner,targetId,opponentId){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m261-guild-'+caseKey,channel='m261-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({id,name:lobby.members[seat].name,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m261-'+caseKey});
  state.core.turn=3;
  const source=placeSource(state,2,sourceId);
  const target=putInGrave(state,targetOwner,targetId);
  const opponent=opponentId?putInGrave(state,1,opponentId):null;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  assert.match(source.uid,/^m2:/,'the flip source must retain inactive partner seat 2 ownership');
  assert.match(target.uid,new RegExp('^m'+targetOwner+':'),'the recovered card must retain its physical owner UID');
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),source,target,opponent,before,guild,ids};
}
async function flipThroughDiscord(record,source,actor,guild,requestId){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='position'&&action.mode==='flip'&&action.card===source.uid);
  assert.ok(index>=0,'the active teammate must receive the Flip Summon action for the partner-owned source');
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the private Discord panel must expose the real Flip Summon action');
  const uiName=getPlayableCard(source.id).name;
  assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)));
  await submit(record,actor,index,requestId,record.revision,guild);
  return settleThroughDiscord(record.id,guild,requestId+'-pass');
}
async function chooseThroughDiscord(record,target,actor,guild,requestId,expectedOwnerId,otherOwnerId){
  assert.equal(record.state.core.phase,'choice');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===target.uid);
  assert.ok(index>=0,'the real choice action list must include the legal shared-Graveyard target');
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the private Discord panel must expose the recovery choice menu');
  const uiName=getPlayableCard(target.id).name;
  assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)),
    'the choice menu must preserve the exact action index and localized target name');
  const partnerPanel=tagPrivateMessage(record,expectedOwnerId);
  validateDiscordPayload(partnerPanel);
  assert.ok(!partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .some(component=>component.custom_id.startsWith('tag:act:')),
    'the inactive physical owner must not receive the active teammate choice menu');
  await submit(record,actor,index,requestId,record.revision,guild);
  let current=store.getTag(record.id);
  current=await settleThroughDiscord(record.id,guild,requestId+'-pass');
  assert.ok(tag.tagMemberHand(current.state,expectedOwnerId).some(card=>card.uid===target.uid),
    'the recovered card must return to its physical owner private hand');
  assert.ok(!tag.tagMemberHand(current.state,otherOwnerId).some(card=>card.uid===target.uid),
    'the recovered card must not be transferred to the active teammate hand');
  const ownerPanel=tagPrivateMessage(current,expectedOwnerId);
  validateDiscordPayload(ownerPanel);
  assert.ok(ownerPanel.embeds[0].data.fields[0].value.includes(uiName),
    'the physical owner private hand must display the recovered card');
  return current;
}
for(const [sourceId,targetId,name] of [
  [MAGICIAN_OF_FAITH,POT_OF_GREED,'Magician of Faith'],
  [MASK_OF_DARKNESS,TRAP_HOLE,'Mask of Darkness']
]){
  test(name+' recovers a shared-Graveyard card to the inactive physical owner through Discord',async()=>{
    const {record,source,target,before,guild,ids}=setup(sourceId,targetId,sourceId===MAGICIAN_OF_FAITH?2:2,targetId,null);
    const actor=ids[0],owner=ids[2];
    assertPrivateHands(record.state,ids);
    let current=await flipThroughDiscord(record,source,actor,guild,'m261-flip-'+sourceId);
    assert.equal(current.state.core.phase,'choice');
    assert.ok(!JSON.stringify(tag.publicTagDuel(current.state)).includes(target.uid),
      'the public projection must not expose the private target UID before choice');
    const choiceRevision=current.revision,requestId='m261-choice-'+sourceId;
    current=await chooseThroughDiscord(current,target,actor,guild,requestId,owner,actor);
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
      'the flipped source must remain face-up on the shared team field');
    assertConserved(current.state,before);
    assertPrivateHands(current.state,ids);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:choiceRevision+1});
  });
}
test('Magician of Faith returns a card owned by the active physical seat to that active hand',async()=>{
  const {record,source,target,before,guild,ids}=setup('faith-active-owner',MAGICIAN_OF_FAITH,0,POT_OF_GREED,null);
  let current=await flipThroughDiscord(record,source,ids[0],guild,'m261-flip-active-owner');
  const choiceRevision=current.revision;
  current=await chooseThroughDiscord(current,target,ids[0],guild,'m261-choice-active-owner',ids[0],ids[2]);
  assertConserved(current.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get('m261-choice-active-owner');
  assert.deepEqual(receipt,{request_id:'m261-choice-active-owner',committed_revision:choiceRevision+1});
});
for(const [sourceId,wrongTarget,opponentTarget,name] of [
  [MAGICIAN_OF_FAITH,TRAP_HOLE,POT_OF_GREED,'Magician of Faith'],
  [MASK_OF_DARKNESS,POT_OF_GREED,TRAP_HOLE,'Mask of Darkness']
]){
  test(name+' does not expose an invalid recovery choice through Discord',async()=>{
    const {record,source,target,opponent,before,guild,ids}=setup('negative-'+sourceId,sourceId,2,wrongTarget,opponentTarget);
    const current=await flipThroughDiscord(record,source,ids[0],guild,'m261-negative-flip-'+sourceId);
    assert.notEqual(current.state.core.phase,'choice','wrong card kind and opponent Graveyard must not create a choice');
    assert.ok(!tag.tagActions(current.state,ids[0]).some(action=>action.kind==='choose'));
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===target.uid));
    assert.ok(current.state.core.players[1].grave.some(card=>card.uid===opponent.uid));
    assert.ok(!tag.tagMemberHand(current.state,ids[0]).some(card=>card.uid===target.uid||card.uid===opponent.uid));
    assert.ok(!tag.tagMemberHand(current.state,ids[2]).some(card=>card.uid===target.uid||card.uid===opponent.uid));
    validateDiscordPayload(tagPrivateMessage(current,ids[0]));
    validateDiscordPayload(tagPublicMessage(current));
    assertConserved(current.state,before);
    assertPrivateHands(current.state,ids);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
