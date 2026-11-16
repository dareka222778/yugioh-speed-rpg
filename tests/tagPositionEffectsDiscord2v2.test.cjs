'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m254-position-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const CASES=[
  {id:'82828051',name:'Earthquake',kind:'spell',effect:{kind:'positionChange',activation:{speed:1,window:'main',damage:'never'},rule:{scope:'both',mode:'def'}}},
  {id:'59744639',name:'Windstorm of Etaqua',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'opponent',mode:'switch'}}},
  {id:'83133491',name:'Zero Gravity',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'both',mode:'switch'}}},
  {id:'31785398',name:'Ready for Intercepting',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'selected',mode:'set',races:['Warrior','Spellcaster']}}}
];
for(const entry of CASES){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,entry.name+' must be enabled');
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its reviewed position rule');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster');
const WARRIOR=NORMALS.find(card=>card.race==='Warrior');
const SPELLCASTER=NORMALS.find(card=>card.race==='Spellcaster');
assert.ok(WARRIOR,'the Discord fixture needs a certified Normal Warrior');
assert.ok(SPELLCASTER,'the Discord fixture needs a certified Normal Spellcaster');
const NORMAL_IDS=[WARRIOR.id,SPELLCASTER.id,...NORMALS.map(card=>card.id).filter(id=>id!==WARRIOR.id&&id!==SPELLCASTER.id).slice(0,8)];

function member(caseKey,seat){return 'm254-'+caseKey+'-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMAL_IDS])];
  assert.ok(ids.length>=4,'each physical Deck needs the required position card and Normal Monsters');
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
  throw new Error('M254 physical seat '+seat+' is missing card '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function setTrap(state,seat,id){
  const physical=holder(state,seat);
  assert.ok(Array.isArray(physical.backrow),'the active physical participant must own a backrow');
  const card=takePhysical(state,seat,id);
  physical.backrow.push({...card,faceUp:false,setTurn:state.core.turn-1});
  return card;
}
function placeMonster(state,seat,id,position){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all 80 physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Discord position actions must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Discord position actions must not duplicate UIDs');
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
async function settleThroughDiscord(sessionId,guildId,requestPrefix){
  let current=store.getTag(sessionId);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'position-effect response windows must terminate through Discord');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'each physical responder must receive a legal pass action');
    await submit(current,actor,passIndex,requestPrefix+'-'+guard,current.revision,guildId);
    current=store.getTag(sessionId);
  }
  return current;
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
function setup(entry,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m254-guild-'+caseKey,channel='m254-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({
    id,name:lobby.members[seat].name,
    cards:deck(seat===0?[entry.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m254-'+caseKey});
  state.core.turn=3;
  const source=entry.kind==='spell'?ensureInHand(state,0,entry.id):setTrap(state,0,entry.id);
  const ally=placeMonster(state,2,WARRIOR.id,'atk');
  const opponent=placeMonster(state,3,SPELLCASTER.id,'def');
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.core.phase,'main');
  assert.match(source.uid,/^m0:/,'the activated position card must retain seat 0 physical ownership');
  assert.match(ally.uid,/^m2:/,'the allied target must retain inactive partner seat 2 ownership');
  assert.match(opponent.uid,/^m3:/,'the opposing target must retain inactive partner seat 3 ownership');
  assert.ok(state.core.players[0].monsters.length<=3&&state.core.players[1].monsters.length<=3,
    'each shared field must respect its three Monster Zones');
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  const record=store.getTag(lobby.id);
  assert.equal(record.revision,revision);
  assert.equal(record.state.core.phase,'main');
  return {record,source,ally,opponent,before,guild,actor:ids[0],partner:ids[2]};
}
function assertOutcome(entry,state,ally,opponent){
  const allied=state.core.players[0].monsters.find(card=>card.uid===ally.uid);
  const enemy=state.core.players[1].monsters.find(card=>card.uid===opponent.uid);
  assert.ok(allied&&enemy,'both physical targets must remain in their shared fields');
  if(entry.id==='82828051'){
    assert.equal(allied.position,'def');
    assert.equal(enemy.position,'def');
    assert.equal(allied.faceUp,true);
    assert.equal(enemy.faceUp,true);
  }else if(entry.id==='59744639'){
    assert.equal(allied.position,'atk','Windstorm must not alter the activating team field');
    assert.equal(enemy.position,'atk','Windstorm must switch the opposing face-up Defense monster to Attack');
  }else if(entry.id==='83133491'){
    assert.equal(allied.position,'def','Zero Gravity must switch the allied Attack monster to Defense');
    assert.equal(enemy.position,'atk','Zero Gravity must switch the opposing Defense monster to Attack');
  }else{
    assert.equal(allied.position,'atk');
    assert.equal(allied.faceUp,true);
    assert.equal(enemy.position,'def');
    assert.equal(enemy.faceUp,false,'Ready for Intercepting must Set the selected opposing Spellcaster');
  }
}
for(const entry of CASES){
  test(entry.name+' is selectable and commits through the real offline Discord 2v2 handler',async()=>{
    const {record,source,ally,opponent,before,guild,actor,partner}=setup(entry,entry.id);
    const actions=tag.tagActions(record.state,actor);
    const index=actions.findIndex(action=>
      action.kind===entry.kind&&action.card===source.uid&&
      (entry.id!=='31785398'||action.target===opponent.uid)
    );
    assert.ok(index>=0,'the real 2v2 action list must include '+entry.name);
    const page=Math.floor(index/20);
    const privatePanel=tagPrivateMessage(record,actor,page);
    validateDiscordPayload(privatePanel);
    const menus=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    const menu=menus.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the real action select menu');
    const uiName=getPlayableCard(entry.id).name;
    assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)),
      'the menu must preserve the exact engine action index and localized card name');
    if(entry.kind==='spell'){
      assert.ok(privatePanel.embeds[0].data.fields[0].value.includes(uiName),
        'the private hand must show the localized Spell name');
    }
    const partnerPanel=tagPrivateMessage(record,partner);
    validateDiscordPayload(partnerPanel);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerComponents.some(component=>component.custom_id.startsWith('tag:act:')),
      'an inactive partner must not receive the active seat action menu');
    assert.ok(!JSON.stringify(partnerPanel).includes(source.uid),
      'the partner private panel must not reveal the active seat physical card UID');
    const publicPanel=tagPublicMessage(record);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(source.uid),
      'the public panel must not expose the private source UID');
    if(entry.id==='31785398'){
      const publicState=tag.publicTagDuel(record.state);
      const hidden=publicState.teams[1].monsters.find(card=>card.faceUp===false&&card.id===null);
      assert.ok(hidden&&hidden.id===null&&!hidden.faceUp,
        'the Set target must remain concealed in the public state');
    }
    const originalRevision=record.revision,requestId='m254-request-'+entry.id;
    await submit(record,actor,index,requestId,originalRevision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m254-pass-'+entry.id);
    assert.ok(current.revision>=originalRevision+1,'the Discord action and any required response passes must commit');
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===entry.id),
      'the resolved source must enter the activating team Graveyard with its physical UID');
    assertOutcome(entry,current.state,ally,opponent);
    assertConserved(current.state,before);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:originalRevision+1});
    const afterPanel=tagPrivateMessage(current,actor);
    validateDiscordPayload(afterPanel);
    const afterOptions=afterPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]).flatMap(component=>component.options||[]);
    assert.ok(!afterOptions.some(option=>option.label.includes(uiName)),
      'a resolved one-shot position card must disappear from the active action menu');
    const stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(record,actor,index,requestId,current.revision,guild);
    current=store.getTag(record.id);
    const revisionBeforeDuplicate=current.revision;
    assert.ok(revisionBeforeDuplicate>=originalRevision+1);
    assert.equal(current.revision,revisionBeforeDuplicate,'duplicate Discord delivery must not commit a second revision');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the 2v2 state byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1,
      'one Discord interaction must produce exactly one idempotency receipt');
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
