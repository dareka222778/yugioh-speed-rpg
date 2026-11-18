'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m259-battle-bounce-'));
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

const AXE_RAIDER='48305365';
const WALL_OF_ILLUSION='13945283';
const KELBEK='54878498';
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
for(const id of [WALL_OF_ILLUSION,KELBEK]){
  assert.equal(getMonsterEffect(id)?.operation.kind,'battleBounceAttacker');
  assert.equal(getPlayableCard(id)?.kind,'monster');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!['48305365','13945283','54878498'].includes(id)&&getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(NORMALS.length,8,'the fixture needs eight distinct Normal Monsters');

function member(caseKey,seat){return 'm259-'+caseKey+'-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M259 physical seat '+seat+' is missing card '+id);
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function handUids(state,seat){
  return tag.tagMemberHand(state,member(state.caseKey,seat)).map(card=>card.uid).sort();
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
  assert.equal(cards.length,before.size,'battle bounce must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'battle bounce must not duplicate UIDs');
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
function setup(defenderId,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m259-guild-'+caseKey,channel='m259-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({
    id,name:lobby.members[seat].name,
    cards:deck(seat===2?[AXE_RAIDER]:seat===3?[defenderId]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m259-'+caseKey});
  state.core.turn=3;
  const attacker=placeMonster(state,2,AXE_RAIDER);
  const defender=placeMonster(state,3,defenderId);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.match(attacker.uid,/^m2:/,'the attacker must retain inactive partner seat 2 physical ownership');
  assert.match(defender.uid,/^m3:/,'the defender must retain inactive opponent partner seat 3 physical ownership');
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),attacker,defender,before,guild,ids};
}
for(const [defenderId,name] of [[WALL_OF_ILLUSION,'Wall of Illusion'],[KELBEK,'Kelbek']]){
  test(name+' returns an attacking partner-owned monster to its physical owner private hand through Discord',async()=>{
    const {record,attacker,defender,before,guild,ids}=setup(defenderId,name.replace(/[^a-z0-9]+/gi,'-'));
    const actor=ids[0],partner=ids[2];
    const hand0Before=tag.tagMemberHand(record.state,actor).map(card=>card.uid).sort();
    const hand2Before=tag.tagMemberHand(record.state,partner).map(card=>card.uid).sort();
    assert.ok(!hand0Before.includes(attacker.uid));
    assert.ok(!hand2Before.includes(attacker.uid),'the attacker must leave its physical hand before battle');
    const battleIndex=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='battle');
    assert.ok(battleIndex>=0);
    await submit(record,actor,battleIndex,'m259-battle-'+defenderId,record.revision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m259-battle-pass-'+defenderId);
    assert.equal(current.state.core.phase,'battle');
    const actions=tag.tagActions(current.state,actor);
    const attackIndex=actions.findIndex(action=>
      action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
    );
    assert.ok(attackIndex>=0,'the active teammate must be able to attack with the partner-owned monster');
    const privatePanel=tagPrivateMessage(current,actor,Math.floor(attackIndex/20));
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+actor);
    assert.ok(menu,'the active private Discord panel must expose the attack action');
    const axeName=getPlayableCard(AXE_RAIDER).name;
    assert.ok(menu.options.some(option=>option.value===String(attackIndex)&&option.label.includes(axeName)));
    const publicPanel=tagPublicMessage(current);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(attacker.uid)&&!JSON.stringify(publicPanel).includes(defender.uid),
      'the public panel must not expose physical UIDs');
    const partnerPanelBefore=tagPrivateMessage(current,partner);
    validateDiscordPayload(partnerPanelBefore);
    assert.ok(!partnerPanelBefore.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .some(component=>component.custom_id.startsWith('tag:act:')),
      'the inactive physical owner cannot decide the active teammate attack');

    const attackRecord=current,attackRevision=current.revision,requestId='m259-attack-'+defenderId;
    const ownLP=current.state.core.players[0].lp,opponentLP=current.state.core.players[1].lp;
    const expectedDamage=getPlayableCard(AXE_RAIDER).atk-getPlayableCard(defenderId).atk;
    assert.ok(expectedDamage>0,'Axe Raider must win both Attack Position battles');
    await submit(attackRecord,actor,attackIndex,requestId,attackRevision,guild);
    current=await settleThroughDiscord(record.id,guild,'m259-attack-pass-'+defenderId);
    assert.equal(current.state.core.players[0].lp,ownLP);
    assert.equal(current.state.core.players[1].lp,opponentLP-expectedDamage,
      'ordinary battle damage must reach the opposing shared team LP');
    assert.ok(current.state.core.players[1].grave.some(card=>card.uid===defender.uid&&card.id===defenderId),
      'the defending monster must be destroyed into the shared team Graveyard');
    assert.ok(!current.state.core.players.some(team=>team.monsters.some(card=>card.uid===attacker.uid)),
      'the bounced attacker must leave the shared field');
    assert.ok(!current.state.core.players.some(team=>team.grave.some(card=>card.uid===attacker.uid)),
      'the bounced attacker must not enter either Graveyard');
    const hand0After=tag.tagMemberHand(current.state,actor).map(card=>card.uid).sort();
    const hand2After=tag.tagMemberHand(current.state,partner).map(card=>card.uid).sort();
    assert.deepEqual(hand0After,hand0Before,'the active teammate private hand must not receive the partner-owned attacker');
    assert.deepEqual(hand2After,[...hand2Before,attacker.uid].sort(),
      'the attacker must return only to the inactive physical owner private hand');
    assert.ok(!JSON.stringify(tag.publicTagDuel(current.state)).includes(attacker.uid),
      'the returned private UID must not leak into the public projection');
    const partnerPanel=tagPrivateMessage(current,partner);
    validateDiscordPayload(partnerPanel);
    assert.ok(partnerPanel.embeds[0].data.fields[0].value.includes(axeName),
      'the physical owner private hand must display the returned Axe Raider');
    const activePanel=tagPrivateMessage(current,actor);
    validateDiscordPayload(activePanel);
    assert.ok(!activePanel.embeds[0].data.fields[0].value.includes(axeName),
      'the active teammate private hand must not reveal the partner-owned returned card');
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:attackRevision+1});
    const revisionBeforeDuplicate=current.revision,stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(attackRecord,actor,attackIndex,requestId,revisionBeforeDuplicate,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate battle delivery must not commit another revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the duel byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1);
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
