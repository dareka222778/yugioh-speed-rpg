'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m258-battle-level-burn-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const NEEDLE_BURROWER='98162242';
const KA2_DES_SCISSORS='52768103';
const CELTIC_GUARDIAN='91152256';
const BATTLE_WARRIOR='55550921';
const SUMMONED_SKULL='70781052';
const CASES=[
  {attacker:NEEDLE_BURROWER,target:CELTIC_GUARDIAN,position:'atk',name:'Needle Burrower vs Celtic Guardian'},
  {attacker:KA2_DES_SCISSORS,target:BATTLE_WARRIOR,position:'atk',name:'KA-2 Des Scissors vs Battle Warrior'},
  {attacker:NEEDLE_BURROWER,target:CELTIC_GUARDIAN,position:'def',name:'Needle Burrower destroys Defense Position Celtic Guardian'},
  {attacker:NEEDLE_BURROWER,target:SUMMONED_SKULL,position:'atk',name:'Needle Burrower loses to Summoned Skull'}
];
for(const id of [NEEDLE_BURROWER,KA2_DES_SCISSORS]){
  assert.equal(getMonsterEffect(id)?.operation.kind,'battleLevelBurn');
  assert.equal(getPlayableCard(id)?.kind,'monster');
}
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);
const TARGETS=[CELTIC_GUARDIAN,BATTLE_WARRIOR,SUMMONED_SKULL];
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster'&&!TARGETS.includes(id))
  .slice(0,15);
assert.equal(NORMALS.length,15,'the fixture needs fifteen distinct Normal Monster fillers');
const POOL=[NEEDLE_BURROWER,KA2_DES_SCISSORS,...TARGETS,...NORMALS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(caseKey,seat){return 'm258-'+caseKey+'-seat-'+seat;}
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
  throw new Error('M258 physical seat '+seat+' is missing card '+id);
}
function placeMonster(state,seat,id,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size,'battle-level burn must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle-level burn must not duplicate UIDs');
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
  assert.ok(refreshes>=1,'the public 2v2 panel must refresh after the action');
}
async function settleThroughDiscord(sessionId,guildId,requestPrefix){
  let current=store.getTag(sessionId);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'battle damage response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
}
function setup(entry,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m258-guild-'+caseKey,channel='m258-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({id,name:lobby.members[seat].name,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m258-'+caseKey});
  state.core.turn=3;
  const attacker=placeMonster(state,2,entry.attacker);
  const target=placeMonster(state,3,entry.target,entry.position);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.core.phase,'main');
  assert.match(attacker.uid,/^m2:/,'the attacker must retain inactive partner seat 2 physical ownership');
  assert.match(target.uid,/^m3:/,'the target must retain inactive opponent partner seat 3 physical ownership');
  for(const team of [0,1])assert.ok(state.core.players[team].monsters.length<=3);
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),attacker,target,before,guild,actor:ids[0]};
}
for(const entry of CASES){
  test(entry.name+' resolves battle-level burn through the real offline Discord 2v2 handler',async()=>{
    const {record,attacker,target,before,guild,actor}=setup(entry,entry.name.replace(/[^a-z0-9]+/gi,'-'));
    const battleIndex=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='battle');
    assert.ok(battleIndex>=0,'the active teammate must be able to enter Battle Phase');
    await submit(record,actor,battleIndex,'m258-battle-'+entry.attacker+'-'+entry.target+'-'+entry.position,record.revision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m258-battle-pass-'+entry.attacker+'-'+entry.target+'-'+entry.position);
    assert.equal(current.state.core.phase,'battle');
    const actions=tag.tagActions(current.state,actor);
    const attackIndex=actions.findIndex(action=>
      action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
    );
    assert.ok(attackIndex>=0,'the active participant must be able to attack with the inactive partner monster');
    const privatePanel=tagPrivateMessage(current,actor,Math.floor(attackIndex/20));
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the attack action menu');
    const attackerName=getPlayableCard(entry.attacker).name;
    assert.ok(menu.options.some(option=>option.value===String(attackIndex)&&option.label.includes(attackerName)),
      'the action menu must preserve the attacker localized name and exact engine index');
    const publicPanel=tagPublicMessage(current);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(attacker.uid)&&!JSON.stringify(publicPanel).includes(target.uid),
      'the public panel must not expose physical UIDs');
    const partnerPanel=tagPrivateMessage(current,member(entry.name.replace(/[^a-z0-9]+/gi,'-'),2));
    validateDiscordPayload(partnerPanel);
    assert.ok(!partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .some(component=>component.custom_id.startsWith('tag:act:')),
      'the inactive partner must not receive the active teammate action menu');

    const attackRecord=current,attackRevision=current.revision,requestId='m258-attack-'+entry.attacker+'-'+entry.target+'-'+entry.position;
    const ownLP=current.state.core.players[0].lp,opponentLP=current.state.core.players[1].lp;
    const attackerInfo=getPlayableCard(entry.attacker),targetInfo=getPlayableCard(entry.target);
    const won=entry.position==='def'?attackerInfo.atk>targetInfo.defense:attackerInfo.atk>targetInfo.atk;
    const battleDamage=entry.position==='def'?0:won?attackerInfo.atk-targetInfo.atk:targetInfo.atk-attackerInfo.atk;
    const effectDamage=won?500*targetInfo.level:0;
    await submit(attackRecord,actor,attackIndex,requestId,attackRevision,guild);
    current=await settleThroughDiscord(record.id,guild,'m258-attack-pass-'+entry.attacker+'-'+entry.target+'-'+entry.position);
    if(won){
      assert.equal(current.state.core.players[1].lp,opponentLP-battleDamage-effectDamage,
        'ordinary battle damage and 500 × original Level must reach the opposing shared team LP');
      assert.equal(current.state.core.players[0].lp,ownLP,'the attacking team LP must remain unchanged');
      assert.ok(current.state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===entry.target),
        'the destroyed opponent monster must enter the shared Graveyard with its physical UID');
      assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===attacker.uid&&card.id===entry.attacker),
        'the winning battle source must survive');
    }else{
      assert.equal(current.state.core.players[1].lp,opponentLP,'a losing source must not burn the opponent');
      assert.equal(current.state.core.players[0].lp,ownLP-battleDamage,'the attacking team receives only ordinary battle damage');
      assert.ok(current.state.core.players[0].grave.some(card=>card.uid===attacker.uid&&card.id===entry.attacker),
        'the losing source must enter its own shared Graveyard');
      assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.id===entry.target),
        'the surviving target must remain on the opposing shared field');
    }
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:attackRevision+1});
    const revisionBeforeDuplicate=current.revision,stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(attackRecord,actor,attackIndex,requestId,revisionBeforeDuplicate,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate battle delivery must not commit another revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the 2v2 state byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1,
      'one Discord attack must produce exactly one idempotency receipt');
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
