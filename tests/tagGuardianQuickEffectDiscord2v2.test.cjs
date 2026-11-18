'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m260-guardian-discord-'));
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
const GUARDIANS=[
  {id:'25955164',name:'Sanga of the Thunder',atk:2600},
  {id:'98434877',name:'Suijin',atk:2500},
  {id:'62340868',name:'Kazejin',atk:2400}
];
for(const guardian of GUARDIANS){
  assert.equal(getPlayableCard(guardian.id)?.englishName,guardian.name);
  assert.equal(getPlayableCard(guardian.id)?.atk,guardian.atk);
  assert.equal(getMonsterEffect(guardian.id)?.operation.kind,'guardianZeroAttack');
}
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
const NORMAL_IDS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==AXE_RAIDER&&getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(NORMAL_IDS.length,8,'the fixture needs eight distinct Normal Monsters');

function member(caseKey,seat){return 'm260-'+caseKey+'-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMAL_IDS])];
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
  throw new Error('M260 physical seat '+seat+' is missing card '+id);
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
  assert.equal(cards.length,before.size,'Guardian quick effects must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Guardian quick effects must not duplicate UIDs');
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
  assert.ok(refreshes>=1,'the public 2v2 panel must refresh after each action');
}
async function settleThroughDiscord(sessionId,guildId,requestPrefix){
  let current=store.getTag(sessionId);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'damage-calculation response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
}
function setup(guardian,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m260-guild-'+caseKey,channel='m260-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({
    id,name:lobby.members[seat].name,
    cards:deck(seat===0||seat===2?[AXE_RAIDER]:seat===3?[guardian.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m260-'+caseKey});
  state.core.turn=3;
  const firstAttacker=placeMonster(state,2,AXE_RAIDER);
  const secondAttacker=placeMonster(state,0,AXE_RAIDER);
  const defender=placeMonster(state,3,guardian.id);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  assert.match(firstAttacker.uid,/^m2:/);
  assert.match(secondAttacker.uid,/^m0:/);
  assert.match(defender.uid,/^m3:/);
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),firstAttacker,secondAttacker,defender,before,guild,ids};
}
function actionIndex(state,actor,predicate){
  return tag.tagActions(state,actor).findIndex(predicate);
}
for(const guardian of GUARDIANS){
  test(guardian.name+' quick effect is privately selectable by the active defender for an inactive partner monster',async()=>{
    const {record,firstAttacker,secondAttacker,defender,before,guild,ids}=setup(guardian,guardian.id);
    const attacker=ids[0],defenderActor=ids[1],inactiveGuardianOwner=ids[3];
    const battleIndex=actionIndex(record.state,attacker,action=>action.kind==='battle');
    assert.ok(battleIndex>=0,'the attacking team must enter Battle Phase through Discord');
    await submit(record,attacker,battleIndex,'m260-battle-'+guardian.id,record.revision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m260-battle-pass-'+guardian.id);
    const firstAttackIndex=actionIndex(current.state,attacker,action=>
      action.kind==='attack'&&action.card===firstAttacker.uid&&action.target===defender.uid
    );
    assert.ok(firstAttackIndex>=0,'the active teammate must attack with the inactive partner-owned monster');
    const attackRecord=current,attackRevision=current.revision;
    await submit(attackRecord,attacker,firstAttackIndex,'m260-first-attack-'+guardian.id,attackRevision,guild);
    current=store.getTag(record.id);
    assert.equal(current.state.core.phase,'response','the guardian effect must be offered during damage calculation');
    assert.equal(tag.tagDecisionMember(current.state).id,defenderActor,
      'the active physical defender teammate owns response priority');
    const responseIndex=actionIndex(current.state,defenderActor,action=>
      action.kind==='monsterEffect'&&action.card===defender.uid&&action.target===firstAttacker.uid
    );
    assert.ok(responseIndex>=0,'the active teammate must receive the inactive partner guardian effect');
    const responsePanel=tagPrivateMessage(current,defenderActor,Math.floor(responseIndex/20));
    validateDiscordPayload(responsePanel);
    const menu=responsePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+defenderActor);
    assert.ok(menu,'the active defender private Discord menu must expose the quick effect');
    const uiName=getPlayableCard(guardian.id).name;
    assert.ok(menu.options.some(option=>option.value===String(responseIndex)&&option.label.includes(uiName)),
      'the response menu must preserve the guardian localized name and exact engine index');
    const inactivePanel=tagPrivateMessage(current,inactiveGuardianOwner);
    validateDiscordPayload(inactivePanel);
    assert.ok(!inactivePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .some(component=>component.custom_id.startsWith('tag:act:')),
      'the inactive physical guardian owner cannot submit the response');
    assert.ok(!JSON.stringify(tagPublicMessage(current)).includes(defender.uid),
      'the public panel must not expose the guardian physical UID');
    const effectRecord=current,effectRevision=current.revision,effectRequest='m260-guardian-effect-'+guardian.id;
    await submit(effectRecord,defenderActor,responseIndex,effectRequest,effectRevision,guild);
    current=await settleThroughDiscord(record.id,guild,'m260-effect-pass-'+guardian.id);
    assert.equal(current.state.core.players[0].lp,record.state.core.players[0].lp-guardian.atk,
      'the first attacker is reduced to zero ATK and the defending team receives no damage');
    assert.equal(current.state.core.players[1].lp,record.state.core.players[1].lp);
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===firstAttacker.uid&&card.id===AXE_RAIDER),
      'the first partner-owned attacker must be destroyed into the attacking team Graveyard');
    const liveGuardian=current.state.core.players[1].monsters.find(card=>card.uid===defender.uid);
    assert.ok(liveGuardian&&liveGuardian.guardianUsed===true,
      'the guardian must remain on the shared field and record its once-per-face-up use');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===secondAttacker.uid),
      'the second attacker remains available for the same Battle Phase');
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(effectRequest);
    assert.deepEqual(receipt,{request_id:effectRequest,committed_revision:effectRevision+1});

    const secondAttackIndex=actionIndex(current.state,attacker,action=>
      action.kind==='attack'&&action.card===secondAttacker.uid&&action.target===defender.uid
    );
    assert.ok(secondAttackIndex>=0,'the second attacker must still have a legal attack');
    const secondRecord=current,secondRevision=current.revision,secondRequest='m260-second-attack-'+guardian.id;
    await submit(secondRecord,attacker,secondAttackIndex,secondRequest,secondRevision,guild);
    const afterSecondAttack=store.getTag(record.id);
    if(afterSecondAttack.state.core.phase==='response'){
      assert.ok(!tag.tagActions(afterSecondAttack.state,defenderActor).some(action=>
        action.kind==='monsterEffect'&&action.card===defender.uid
      ),'the guardian cannot activate a second time while it remains face-up');
    }
    current=await settleThroughDiscord(record.id,guild,'m260-second-pass-'+guardian.id);
    assert.equal(current.state.core.players[0].lp,record.state.core.players[0].lp-guardian.atk-(guardian.atk-1700),
      'the second attack resolves normally after the guardian effect is spent');
    assert.equal(current.state.core.players[1].lp,record.state.core.players[1].lp);
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===secondAttacker.uid&&card.id===AXE_RAIDER));
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.guardianUsed===true));
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const revisionBeforeDuplicate=current.revision,stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(effectRecord,defenderActor,responseIndex,effectRequest,revisionBeforeDuplicate,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate quick-effect delivery must not commit another revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the shared duel byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(effectRequest).n,1,
      'one guardian quick-effect interaction must produce exactly one idempotency receipt');
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
