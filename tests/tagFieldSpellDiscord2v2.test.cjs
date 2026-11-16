'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m256-field-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const FIELD_SPELLS=[
  {id:'18161786',name:'Mystic Plasma Zone',attribute:'DARK',monster:'46986414',atk:2500,def:2100},
  {id:'19384334',name:'Molten Destruction',attribute:'FIRE',monster:'82035781',atk:1700,def:1900},
  {id:'45778932',name:'Rising Air Current',attribute:'WIND',monster:'57617178',atk:1400,def:1000}
];
const BLUE_EYES='89631139';
const DIRECT_ATTACK_FILLERS=['12472242','21347810','58861941','32809211','02792265','59290628'];
for(const field of FIELD_SPELLS){
  const card=getPlayableCard(field.id);
  assert.equal(card?.englishName,field.name);
  assert.equal(card?.kind,'spell');
  assert.equal(card?.field,true);
  assert.deepEqual(getEffect(field.id),{
    kind:'field',races:[],attributes:[field.attribute],atk:500,def:-400
  },field.name+' must retain its exact attribute-only global modifier');
  const monster=getPlayableCard(field.monster);
  assert.equal(monster?.kind,'monster');
  assert.equal(monster?.attribute,field.attribute);
  assert.equal(monster?.atk,field.atk);
  assert.equal(monster?.defense,field.def);
}
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>
  !FIELD_SPELLS.some(card=>card.id===id)&&!FIELD_SPELLS.some(card=>card.monster===id)&&id!==BLUE_EYES
).slice(0,7);
assert.equal(FILLERS.length,7,'the fixture needs seven distinct certified Normal Monsters');
const POOL=[...FIELD_SPELLS.map(card=>card.id),...FIELD_SPELLS.map(card=>card.monster),BLUE_EYES,...DIRECT_ATTACK_FILLERS,...FILLERS];
assert.equal(POOL.length,20,'each physical participant needs a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must use distinct card identities');

function member(caseKey,seat){return 'm256-'+caseKey+'-seat-'+seat;}
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
  throw new Error('M256 physical seat '+seat+' is missing card '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
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
  assert.equal(cards.length,before.size,'Field Spell activation must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Field Spell activation must not duplicate UIDs');
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
  assert.ok(refreshes>=1,'the public shared-field panel must refresh after activation');
}
async function settleThroughDiscord(sessionId,guildId,requestPrefix){
  let current=store.getTag(sessionId);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'Field Spell response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
}
function setup(field,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m256-guild-'+caseKey,channel='m256-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({id,name:lobby.members[seat].name,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m256-'+caseKey});
  state.core.turn=3;
  const ally=placeMonster(state,2,field.monster);
  const opponent=placeMonster(state,1,field.monster);
  const control=placeMonster(state,3,BLUE_EYES);
  const fieldCard=ensureInHand(state,0,field.id);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.core.phase,'main');
  assert.match(fieldCard.uid,/^m0:/,'the Field Spell must retain active physical seat 0 ownership');
  assert.match(ally.uid,/^m2:/,'the allied monster must retain inactive partner seat 2 ownership');
  assert.match(opponent.uid,/^m1:/,'the opposing monster must retain physical seat 1 ownership');
  assert.match(control.uid,/^m3:/,'the control monster must retain inactive partner seat 3 ownership');
  for(const team of [0,1])assert.ok(state.core.players[team].monsters.length<=3,'each shared field must respect three Monster Zones');
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  const record=store.getTag(lobby.id);
  return {record,fieldCard,ally,opponent,control,before,guild,actor:ids[0],partner:ids[2]};
}
for(const field of FIELD_SPELLS){
  test(field.name+' is activated from the private Discord menu and modifies both shared team fields',async()=>{
    const {record,fieldCard,ally,opponent,control,before,guild,actor,partner}=setup(field,field.id);
    const actions=tag.tagActions(record.state,actor);
    const index=actions.findIndex(action=>action.kind==='field'&&action.card===fieldCard.uid);
    assert.ok(index>=0,'the active participant action list must include '+field.name);
    const page=Math.floor(index/20);
    const privatePanel=tagPrivateMessage(record,actor,page);
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the actual action select menu');
    const uiName=getPlayableCard(field.id).name;
    assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)),
      'the menu must preserve the exact field activation index and localized card name');
    assert.ok(privatePanel.embeds[0].data.fields[0].value.includes(uiName),
      'the Field Spell must be visible in the active participant private hand');
    const partnerPanel=tagPrivateMessage(record,partner);
    validateDiscordPayload(partnerPanel);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerComponents.some(component=>component.custom_id.startsWith('tag:act:')),
      'the inactive partner must not receive the active seat action menu');
    assert.ok(!JSON.stringify(partnerPanel).includes(fieldCard.uid),
      'the partner private panel must not expose the active seat physical UID');
    const publicPanel=tagPublicMessage(record);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(fieldCard.uid),
      'the public panel must not expose the Field Spell physical UID before activation');

    const originalRevision=record.revision,requestId='m256-request-'+field.id;
    await submit(record,actor,index,requestId,originalRevision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m256-pass-'+field.id);
    assert.ok(current.revision>=originalRevision+1,'the activation and any required response passes must commit');
    const liveField=current.state.core.players[0].field;
    assert.ok(liveField&&liveField.faceUp,'the Field Spell must occupy the shared field zone');
    assert.equal(liveField.id,field.id);
    assert.equal(liveField.uid,fieldCard.uid,'the shared Field Spell must preserve its physical UID');
    const liveAlly=current.state.core.players[0].monsters.find(card=>card.uid===ally.uid);
    const liveOpponent=current.state.core.players[1].monsters.find(card=>card.uid===opponent.uid);
    const liveControl=current.state.core.players[1].monsters.find(card=>card.uid===control.uid);
    assert.equal(engine.atk(liveAlly,current.state.core),field.atk+500);
    assert.equal(engine.def(liveAlly,current.state.core),field.def-400);
    assert.equal(engine.atk(liveOpponent,current.state.core),field.atk+500,
      'the Field Spell must affect a matching monster on the opposing shared team');
    assert.equal(engine.def(liveOpponent,current.state.core),field.def-400);
    assert.equal(engine.atk(liveControl,current.state.core),3000,
      'a LIGHT monster must not receive the attribute-specific ATK modifier');
    assert.equal(engine.def(liveControl,current.state.core),2500,
      'a LIGHT monster must not receive the attribute-specific DEF modifier');
    const publicState=tag.publicTagDuel(current.state);
    assert.equal(publicState.teams[0].field.id,field.id,
      'the public 2v2 projection must publish the active shared Field Spell');
    assert.equal(publicState.teams[0].field.uid,undefined,
      'the public projection must not expose physical card UIDs');
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:originalRevision+1});
    const afterPanel=tagPrivateMessage(current,actor);
    validateDiscordPayload(afterPanel);
    const afterOptions=afterPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]).flatMap(component=>component.options||[]);
    assert.ok(!afterOptions.some(option=>option.label.includes(uiName)),
      'the resolved Field Spell must disappear from the active hand action menu');
    const revisionBeforeDuplicate=current.revision;
    const stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(record,actor,index,requestId,revisionBeforeDuplicate,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate Discord delivery must not commit another revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the 2v2 state byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1,
      'one Discord request must produce exactly one idempotency receipt');
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
