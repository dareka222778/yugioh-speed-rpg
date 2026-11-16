'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m268-double-tribute-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {starterContents,getCard}=require('../dist/cardCatalog');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const CASES=[
  {name:'Kaiser Sea Horse',donor:'17444133',boss:'89631139',first:0},
  {name:'Double Coston',donor:'44436472',boss:'46986414',first:1},
  {name:'Unshaven Angler',donor:'92084010',boss:'39674352',first:2},
  {name:'The Trojan Horse',donor:'38479725',boss:'06368038',first:3}
];
const BASE=starterContents.warrior.flatMap(card=>Array(card.quantity).fill(card.id));
function member(seat){return 'm268-seat-'+seat;}
function deck(entry){
  const fillers=BASE.filter(id=>id!==entry.donor&&id!==entry.boss).slice(0,18);
  const cards=[entry.donor,entry.boss,...fillers];
  assert.equal(cards.length,20,entry.name+' fixture must have a 20-card Deck');
  return cards;
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
  throw new Error('M268 physical card missing from seat '+seat+': '+id);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Double Tribute must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
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
}
function setup(entry){
  const donorInfo=getPlayableCard(entry.donor);
  const bossInfo=getPlayableCard(entry.boss);
  assert.ok(donorInfo,entry.name+' must be playable in the shared base');
  assert.ok(bossInfo,'the matching Level 7+ boss must be playable');
  assert.equal(donorInfo.englishName,entry.name);
  assert.equal(getEffect(entry.donor)?.kind,'monsterEffect');
  const rule=getMonsterEffect(entry.donor)?.operation;
  assert.equal(rule?.kind,'doubleTribute',entry.name+' must expose its Double Tribute operation');
  assert.equal(rule.attribute,donorInfo.attribute);
  assert.equal(bossInfo.attribute,donorInfo.attribute,entry.name+' must match the boss attribute');
  assert.ok(bossInfo.level>=7,entry.name+' must be tested with a Level 7+ boss');
  assert.equal(getCardStatusSafe(entry.donor),'certified');
  assert.equal(getCardStatusSafe(entry.boss),'certified');

  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M268 Seat '+seat,cards:deck(entry)}));
  const state=tag.createTagDuel(players,{classic:true,first:entry.first,seed:'m268-double-tribute-'+entry.donor});
  state.core.turn=3;
  const actor=tag.tagDecisionMember(state).id;
  assert.equal(actor,ids[entry.first],'the configured physical seat must own the active turn');
  const team=entry.first%2;
  const partner=(entry.first+2)%4;
  assert.equal(state.active[team],entry.first);
  const before=inventory(state);

  const physicalSource=takePhysical(state,partner,entry.donor);
  const source={...physicalSource,owner:team,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[team].monsters.push(source);
  const physicalBoss=takePhysical(state,entry.first,entry.boss);
  holder(state,entry.first).hand.push(physicalBoss);
  assert.match(source.uid,new RegExp('^m'+partner+':'));
  assert.match(physicalBoss.uid,new RegExp('^m'+entry.first+':'));
  assert.equal(source.faceUp,true,'the continuous Double Tribute source must be face-up');
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);

  const id='m268-double-tribute-'+entry.donor,guild='m268-guild',channel='m268-channel';
  const members=ids.map((id,seat)=>({id,name:'M268 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  const record=store.getTag(id);
  const partnerSnapshot={
    hand:tag.tagMemberHand(record.state,ids[partner]).map(card=>card.uid),
    deck:holder(record.state,partner).deck.map(card=>card.uid)
  };
  return {entry,id,ids,team,partner,actor,before,source,boss:physicalBoss,record,partnerSnapshot};
}
function getCardStatusSafe(id){
  const {getCardStatus}=require('../dist/effectRegistry');
  return getCardStatus(id)?.stage;
}
function interaction(record,actor,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
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
  const page=Math.floor(index/20);
  const panel=tagPrivateMessage(record,actor,page);
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the real private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the menu must contain the legal summon action index '+index);
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'the Tribute Summon response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'each physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m268-'+suffix+'-pass-'+guard);
  }
  return current;
}
for(const entry of CASES){
  test(entry.name+' lets the active teammate Tribute Summon with one partner-owned face-up monster through Discord',async()=>{
    const fixture=setup(entry);
    const {record,ids,actor,team,partner,source,boss,before,partnerSnapshot,id}=fixture;
    const actions=tag.tagActions(record.state,actor);
    const index=actions.findIndex(action=>action.kind==='summon'&&action.card===boss.uid&&
      action.position==='atk'&&Array.isArray(action.tributes)&&action.tributes.length===1&&
      action.tributes[0]===source.uid);
    assert.ok(index>=0,entry.name+' must count as two Tributes for the matching attribute boss');
    const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
    validateDiscordPayload(panel);
    const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    assert.ok(menu.options.some(option=>option.value===String(index)));
    const partnerPanel=tagPrivateMessage(record,ids[partner]);
    validateDiscordPayload(partnerPanel);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(!partnerComponents.some(component=>(component.custom_id||'').startsWith('tag:act:')),
      'the inactive physical partner must not receive the active summon action menu');
    assert.ok(!JSON.stringify(partnerPanel).includes(boss.uid),
      'the partner private panel must not reveal the active seat boss UID');
    assert.ok(!JSON.stringify(partnerPanel).includes(getCard(entry.boss).name),
      'the partner private panel must not reveal the active seat boss name');
    const publicBefore=tagPublicMessage(record);
    validateDiscordPayload(publicBefore);
    assert.ok(!JSON.stringify(publicBefore).includes(boss.uid));
    assert.ok(!JSON.stringify(publicBefore).includes(getCard(entry.boss).name),
      'the boss must remain private in the active seat hand before summon');

    let current=await submit(record,actor,index,'m268-summon-'+entry.donor);
    current=await settleResponses(current,entry.donor);
    const teamState=current.state.core.players[team];
    assert.ok(teamState.grave.some(card=>card.uid===source.uid&&card.id===entry.donor),
      'the partner-owned physical source must enter the shared team Graveyard');
    assert.ok(teamState.monsters.some(card=>card.uid===boss.uid&&card.id===entry.boss&&card.faceUp),
      'the boss must be Normal Summoned face-up with its original physical UID');
    assert.equal(teamState.monsters.length,1);
    assert.ok(!teamState.monsters.some(card=>card.uid===source.uid));
    assert.deepEqual(tag.tagMemberHand(current.state,ids[partner]).map(card=>card.uid),partnerSnapshot.hand,
      'the partner physical hand must remain unchanged');
    assert.deepEqual(holder(current.state,partner).deck.map(card=>card.uid),partnerSnapshot.deck,
      'the partner physical Deck must remain unchanged');
    const publicAfter=tagPublicMessage(current.state);
    validateDiscordPayload(publicAfter);
    const rendered=JSON.stringify(publicAfter);
    assert.ok(rendered.includes(getCard(entry.boss).name),
      'the public Discord field must reveal the successfully summoned boss');
    assert.ok(!rendered.includes(source.uid));
    assert.ok(!rendered.includes(boss.uid));
    assertConserved(current.state,before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}

test('Kaiser Sea Horse cannot provide a one-Tribute shortcut for a DARK boss',()=>{
  const entry={donor:'17444133',boss:'46986414',first:2,name:'Kaiser Sea Horse'};
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M268 Negative '+seat,cards:deck({donor:entry.donor,boss:entry.boss})}));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m268-double-tribute-mismatch'});
  state.core.turn=3;
  const team=0,partner=0,actor=ids[2];
  const sourceCard=takePhysical(state,partner,entry.donor);
  const source={...sourceCard,owner:team,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[team].monsters.push(source);
  const bossCard=takePhysical(state,2,entry.boss);
  holder(state,2).hand.push(bossCard);
  const actions=tag.tagActions(state,actor);
  assert.ok(!actions.some(action=>action.kind==='summon'&&action.card===bossCard.uid&&
    action.tributes?.length===1&&action.tributes[0]===source.uid),
  'LIGHT Double Tribute must not accelerate a DARK boss');
  tag.assertTagDuel(state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
