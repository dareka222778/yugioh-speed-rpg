'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m255-continuous-discord-'));
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
  {id:'23615409',name:'Insect Barrier',kind:'spell',effect:{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'preventAttack',filter:{controller:'opponent',races:['Insect']},declarationOnly:true}]}},
  {id:'85742772',name:'Gravity Bind',kind:'trap',effect:{kind:'continuous',activation:{speed:2,window:'free',damage:'never'},rules:[{kind:'preventAttack',filter:{minimumLevel:4}}]}},
  {id:'95220856',name:'Vengeful Bog Spirit',kind:'spell',effect:{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'preventAttack',filter:{summonedThisTurn:true}}]}}
];
for(const entry of CASES){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,entry.name+' must be enabled');
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its exact continuous attack restriction');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster');
const used=new Set();
function choose(predicate,count,label){
  const chosen=NORMALS.filter(card=>!used.has(card.id)&&predicate(card)).slice(0,count);
  assert.equal(chosen.length,count,'the fixture needs '+count+' distinct '+label+' Normal Monsters');
  for(const card of chosen)used.add(card.id);
  return chosen;
}
const INSECTS=choose(card=>card.race==='Insect',2,'Insect');
const WARRIORS=choose(card=>card.race==='Warrior',2,'Warrior');
const HIGH_LEVEL=choose(card=>card.level>=4,2,'Level 4+');
const LOW_LEVEL=choose(card=>card.level<=3,2,'Level 3 or lower');
const FILLERS=choose(()=>true,9,'additional');
const ROLE_MONSTERS=[...INSECTS,...WARRIORS,...HIGH_LEVEL,...LOW_LEVEL,...FILLERS];
assert.equal(ROLE_MONSTERS.length,17);
const POOL=[...CASES.map(card=>card.id),...ROLE_MONSTERS.map(card=>card.id)];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');
process.stderr.write('M255 diagnostic: module fixtures loaded\\n');

function member(caseKey,seat){return 'm255-'+caseKey+'-seat-'+seat;}
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
  throw new Error('M255 physical seat '+seat+' is missing card '+id);
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
  const card=takePhysical(state,seat,id);
  physical.backrow.push({...card,faceUp:false,setTurn:state.core.turn-1});
  return card;
}
function placeMonster(state,seat,id,entered=state.core.turn-1){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  assert.equal(cards.length,before.size,'continuous attack effects must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous attack effects must not duplicate UIDs');
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
    assert.ok(guard<30,'continuous-effect response windows must terminate through Discord');
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
  const guild='m255-guild-'+caseKey,channel='m255-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({id,name:lobby.members[seat].name,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m255-'+caseKey});
  state.core.turn=3;
  const refs={};
  if(entry.id==='23615409'){
    refs.alliedInsect=placeMonster(state,0,INSECTS[0].id);
    refs.alliedPartnerWarrior=placeMonster(state,2,WARRIORS[0].id);
    refs.opposingInsect=placeMonster(state,1,INSECTS[1].id);
    refs.opposingPartnerWarrior=placeMonster(state,3,WARRIORS[1].id);
  }else if(entry.id==='85742772'){
    refs.alliedHigh=placeMonster(state,0,HIGH_LEVEL[0].id);
    refs.alliedLow=placeMonster(state,2,LOW_LEVEL[0].id);
    refs.opposingHigh=placeMonster(state,1,HIGH_LEVEL[1].id);
    refs.opposingLow=placeMonster(state,3,LOW_LEVEL[1].id);
  }else{
    refs.alliedOld=placeMonster(state,0,FILLERS[0].id,2);
    refs.alliedNew=placeMonster(state,2,FILLERS[1].id,3);
    refs.opposingOld=placeMonster(state,1,FILLERS[2].id,2);
    refs.opposingNew=placeMonster(state,3,FILLERS[3].id,3);
  }
  const source=entry.kind==='spell'?ensureInHand(state,0,entry.id):setTrap(state,0,entry.id);
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[0],0);
  assert.equal(state.active[1],1);
  assert.equal(state.core.phase,'main');
  assert.match(source.uid,/^m0:/,'the continuous source must retain seat 0 physical ownership');
  for(const team of [0,1])assert.ok(state.core.players[team].monsters.length<=3,'each shared field must respect three Monster Zones');
  const before=inventorySnapshot(state);
  const revision=7;
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,Date.now(),'playing','classic-loan',lobby.id);
  const record=store.getTag(lobby.id);
  return {record,source,refs,before,guild,actor:ids[0],partner:ids[2]};
}
function activePerspective(state,team){
  const copy=structuredClone(state);
  copy.cursor=team;
  copy.core.current=team;
  copy.core.priority=team;
  copy.core.teamRotation.cursor=team;
  assert.doesNotThrow(()=>tag.assertTagDuel(copy));
  return copy;
}
function attackCards(state,team){
  let copy=activePerspective(state,team);
  const actor=tag.tagDecisionMember(copy).id;
  const battle=tag.tagActions(copy,actor).find(action=>action.kind==='battle');
  assert.ok(battle,'each team must be able to enter its Battle Phase');
  copy=tag.stepTagDuel(copy,actor,battle);
  return new Set(tag.tagActions(copy,actor).filter(action=>action.kind==='attack').map(action=>action.card));
}
function assertEffect(entry,state,refs){
  if(entry.id==='23615409'){
    const allied=attackCards(state,0),opposing=attackCards(state,1);
    assert.ok(allied.has(refs.alliedInsect.uid),'the source team Insect must remain able to attack');
    assert.ok(allied.has(refs.alliedPartnerWarrior.uid),'the source team partner must remain able to attack');
    assert.ok(!opposing.has(refs.opposingInsect.uid),'opposing Insects must be blocked');
    assert.ok(opposing.has(refs.opposingPartnerWarrior.uid),'opposing non-Insects must remain able to attack');
  }else if(entry.id==='85742772'){
    const allied=attackCards(state,0),opposing=attackCards(state,1);
    assert.ok(!allied.has(refs.alliedHigh.uid),'Gravity Bind must block allied Level 4+ monsters');
    assert.ok(allied.has(refs.alliedLow.uid),'Gravity Bind must allow allied Level 3 or lower monsters');
    assert.ok(!opposing.has(refs.opposingHigh.uid),'Gravity Bind must block opposing Level 4+ monsters');
    assert.ok(opposing.has(refs.opposingLow.uid),'Gravity Bind must allow opposing Level 3 or lower monsters');
  }else{
    const allied=attackCards(state,0),opposing=attackCards(state,1);
    assert.deepEqual(allied,new Set([refs.alliedOld.uid]),'only the old allied monster may attack this turn');
    assert.deepEqual(opposing,new Set([refs.opposingOld.uid]),'only the old opposing monster may attack this turn');
    const later=structuredClone(state);
    later.core.turn=4;
    assert.deepEqual(attackCards(later,0),new Set([refs.alliedOld.uid,refs.alliedNew.uid]),
      'Vengeful Bog Spirit must stop blocking the new allied monster next turn');
    assert.deepEqual(attackCards(later,1),new Set([refs.opposingOld.uid,refs.opposingNew.uid]),
      'Vengeful Bog Spirit must stop blocking the new opposing monster next turn');
  }
}
for(const entry of CASES){
  test(entry.name+' activates through the real offline Discord 2v2 handler and preserves its team attack rule',async()=>{
    const {record,source,refs,before,guild,actor,partner}=setup(entry,entry.id);
    process.stderr.write('M255 diagnostic setup '+entry.id+' phase='+record.state.core.phase+'\\n');
    const actions=tag.tagActions(record.state,actor);
    const index=actions.findIndex(action=>action.kind===entry.kind&&action.card===source.uid);
    assert.ok(index>=0,'the real 2v2 action list must include '+entry.name);
    process.stderr.write('M255 diagnostic menu '+entry.id+' index='+index+'\\n');
    const page=Math.floor(index/20);
    const privatePanel=tagPrivateMessage(record,actor,page);
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the real action select menu');
    const uiName=getPlayableCard(entry.id).name;
    assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(uiName)),
      'the menu must preserve the exact engine action index and localized card name');
    const partnerPanel=tagPrivateMessage(record,partner);
    validateDiscordPayload(partnerPanel);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerComponents.some(component=>component.custom_id.startsWith('tag:act:')),
      'an inactive partner must not receive the active seat action menu');
    assert.ok(!JSON.stringify(partnerPanel).includes(source.uid),
      'the partner private panel must not reveal the active seat source UID');
    const publicPanel=tagPublicMessage(record);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(source.uid),
      'the public panel must not expose the source UID');
    const originalRevision=record.revision,requestId='m255-request-'+entry.id;
    await submit(record,actor,index,requestId,originalRevision,guild);
    let current=await settleThroughDiscord(record.id,guild,'m255-pass-'+entry.id);
    process.stderr.write('M255 diagnostic settled '+entry.id+' phase='+current.state.core.phase+' revision='+current.revision+'\\n');
    assert.ok(current.revision>=originalRevision+1,'the action and any required response passes must commit');
    const continuous= current.state.core.players[0].backrow.find(card=>card.uid===source.uid);
    assert.ok(continuous&&continuous.faceUp&&continuous.resolved,
      entry.name+' must remain face-up and resolved in the shared team backrow');
    process.stderr.write('M255 diagnostic effect '+entry.id+'\\n');
    assertEffect(entry,current.state,refs);
    process.stderr.write('M255 diagnostic effect passed '+entry.id+'\\n');
    assertConserved(current.state,before);
    process.stderr.write('M255 diagnostic conserved '+entry.id+'\\n');
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:originalRevision+1});
    const afterPanel=tagPrivateMessage(current,actor);
    validateDiscordPayload(afterPanel);
    const afterOptions=afterPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]).flatMap(component=>component.options||[]);
    const uiName=getPlayableCard(entry.id).name;
    assert.ok(!afterOptions.some(option=>option.label.includes(uiName)),
      'the resolved continuous source must disappear from the active action menu');
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
