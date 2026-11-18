'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m257-direct-discord-'));
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

const DIRECT_ATTACKERS=[
  {id:'12472242',name:'Leghul',atk:300},
  {id:'21347810',name:'Rainbow Flower',atk:400},
  {id:'58861941',name:'Ooguchi',atk:300},
  {id:'32809211',name:'Jinzo #7',atk:500},
  {id:'02792265',name:'Servant of Catabolism',atk:700},
  {id:'59290628',name:'Nightmare Horse',atk:500}
];
for(const entry of DIRECT_ATTACKERS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,'direct attacker must be enabled: '+entry.name);
  assert.equal(getPlayableCard(entry.id)?.atk,entry.atk,'printed ATK must match: '+entry.name);
  assert.deepEqual(getMonsterEffect(entry.id),{trigger:'continuous',operation:{kind:'directAttack'}},
    entry.name+' must retain the audited direct-attack operation');
  assert.equal(getEffect(entry.id)?.kind,'monsterEffect');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,14);
assert.equal(NORMALS.length,14,'the fixture needs fourteen distinct certified Normal Monsters');
const POOL=[...DIRECT_ATTACKERS.map(card=>card.id),...NORMALS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(caseKey,seat){return 'm257-'+caseKey+'-seat-'+seat;}
function deck(){return [...POOL];}
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
  throw new Error('M257 physical seat '+seat+' is missing card '+id);
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'direct attacks must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'direct attacks must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
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
    assert.ok(guard<30,'battle response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
}
function setup(caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m257-guild-'+caseKey,channel='m257-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({id,name:lobby.members[seat].name,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m257-'+caseKey});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  return {lobby,state,guild,ids};
}
function persist(lobby,state){
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),before};
}
for(const entry of DIRECT_ATTACKERS){
  test(entry.name+' attacks the opposing shared team directly through the real Discord 2v2 handler',async()=>{
    const {lobby,state,guild,ids}=setup(entry.id);
    const source=placeMonster(state,2,entry.id);
    const enemyActive=placeMonster(state,1,NORMALS[0]);
    const enemyPartner=placeMonster(state,3,NORMALS[1]);
    assert.match(source.uid,/^m2:/,'the attacking monster must retain inactive partner seat 2 physical ownership');
    assert.match(enemyActive.uid,/^m1:/);
    assert.match(enemyPartner.uid,/^m3:/);
    assert.equal(tag.tagActions(state,ids[2]).length,0,'the inactive physical owner cannot decide the active team action');
    const {record,before}=persist(lobby,state);
    const actor=ids[0];
    let actions=tag.tagActions(record.state,actor);
    let index=actions.findIndex(action=>action.kind==='battle');
    assert.ok(index>=0,'the active teammate must be able to enter the shared Battle Phase');
    const battleRequest='m257-battle-'+entry.id;
    await submit(record,actor,index,battleRequest,record.revision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m257-battle-pass-'+entry.id);
    assert.equal(current.state.core.phase,'battle','the real Discord route must enter Battle Phase');
    assert.equal(tag.tagDecisionMember(current.state).id,actor,'the active teammate retains the decision after entering Battle Phase');
    actions=tag.tagActions(current.state,actor);
    index=actions.findIndex(action=>action.kind==='attack'&&action.card===source.uid&&action.target===undefined);
    assert.ok(index>=0,entry.name+' must expose a direct-attack action despite monsters on both opposing physical seats');
    const privatePanel=tagPrivateMessage(current,actor,Math.floor(index/20));
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the actual attack select menu');
    const uiName=getPlayableCard(entry.id).name;
    assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)),
      'the menu must preserve the direct attacker localized name and exact engine action index');
    const partnerPanel=tagPrivateMessage(current,ids[2]);
    validateDiscordPayload(partnerPanel);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerComponents.some(component=>component.custom_id.startsWith('tag:act:')),
      'the inactive partner must not receive the active teammate action menu');
    assert.ok(!JSON.stringify(partnerPanel).includes(source.uid),
      'the inactive partner private panel must not expose the physical field UID');
    const publicPanel=tagPublicMessage(current);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(source.uid),
      'the public panel must not expose the physical UID');
    const attackRecord=current,attackRevision=current.revision,requestId='m257-attack-'+entry.id;
    const lpBefore=current.state.core.players[1].lp;
    const ownLPBefore=current.state.core.players[0].lp;
    await submit(attackRecord,actor,index,requestId,attackRevision,guild);
    current=await settleThroughDiscord(record.id,guild,'m257-attack-pass-'+entry.id);
    assert.equal(current.state.core.players[0].lp,ownLPBefore,'the attacking team must not lose LP');
    assert.equal(current.state.core.players[1].lp,lpBefore-entry.atk,
      'direct battle damage must be routed to the opposing shared team LP');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===source.uid),
      'the partner-owned attacker must remain on the shared field');
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===enemyActive.uid),
      'direct attack must not destroy the active opponent monster');
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===enemyPartner.uid),
      'direct attack must not destroy the inactive opponent partner monster');
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:attackRevision+1});
    const stateBeforeDuplicate=JSON.stringify(current.state),revisionBeforeDuplicate=current.revision;
    await submit(attackRecord,actor,index,requestId,revisionBeforeDuplicate,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate attack delivery must not commit a second revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the shared duel state byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1,
      'one direct-attack interaction must produce exactly one idempotency receipt');
  });
}
test('an ordinary Normal Monster cannot attack directly through the Discord action list',async()=>{
  const {lobby,state,guild,ids}=setup('normal-control');
  const source=placeMonster(state,2,NORMALS[2]);
  placeMonster(state,1,NORMALS[3]);
  placeMonster(state,3,NORMALS[4]);
  const {record,before}=persist(lobby,state);
  const actor=ids[0];
  let actions=tag.tagActions(record.state,actor);
  const battleIndex=actions.findIndex(action=>action.kind==='battle');
  assert.ok(battleIndex>=0);
  await submit(record,actor,battleIndex,'m257-normal-battle',record.revision,guild);
  let current=await settleThroughDiscord(record.id,guild,'m257-normal-battle-pass');
  actions=tag.tagActions(current.state,actor);
  assert.equal(actions.find(action=>action.kind==='attack'&&action.card===source.uid&&action.target===undefined),undefined,
    'only a registered direct-attack effect may bypass opposing monsters');
  assert.ok(actions.some(action=>action.kind==='attack'&&action.card===source.uid&&!!action.target),
    'a Normal Monster must still be able to choose an opposing monster');
  validateDiscordPayload(tagPrivateMessage(current,actor));
  validateDiscordPayload(tagPublicMessage(current));
  assertConserved(current.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
