'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m346-searchers-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const CASES=[
  {id:'73431236',name:'Iron Blacksmith Kotetsu',policy:'mandatory',candidateIds:['95638658'],partnerDecoy:'95638658'},
  {id:'57617178',name:'Sonic Bird',policy:'optional',candidateIds:['55761792'],partnerDecoy:'55761792'},
  {id:'23401839',name:'Senju of the Thousand Hands',policy:'optional',candidateIds:['05405694'],partnerDecoy:'05405694'},
  {id:'95492061',name:'Manju of the Ten Thousand Hands',policy:'optional',candidateIds:['55761792','05405694'],partnerDecoy:'05405694'},
  {id:'77207191',name:'Berfomet',policy:'optional',candidateIds:['05818798'],partnerDecoy:'05818798'}
];
const EXCLUDED=new Set([...CASES.map(c=>c.id),...CASES.flatMap(c=>c.candidateIds),...CASES.map(c=>c.partnerDecoy)]);
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return !EXCLUDED.has(id)&&card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense);
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks need twenty certified Normal Monster fixture identities');

for(const c of CASES){
  assert.equal(getCardStatus(c.id)?.stage,'certified');
  assert.equal(getPlayableCard(c.id)?.englishName,c.name);
  const definition=getMonsterDefinition(c.id),effect=getMonsterEffect(c.id);
  assert.ok(definition&&effect);
  assert.equal(effect.trigger,c.id==='73431236'?'flip':'onSummon');
  assert.equal(definition.activation.policy,c.policy);
  assert.equal(effect.operation.kind,'searchFiltered');
  assert.equal(effect.operation.rule.from,'deck');
  if(c.id!=='73431236')assert.ok(effect.summons.includes('flip'),'searchers must trigger on Flip Summon');
  for(const id of c.candidateIds){
    assert.equal(getCardStatus(id)?.stage,'certified','search target must already be certified: '+id);
    assert.ok(getPlayableCard(id),'search target must be playable: '+id);
  }
  assert.equal(getCardStatus(c.partnerDecoy)?.stage,'certified');
}
assert.equal(getEffect('95638658')?.kind,'equip','Kotetsu fixture must be an Equip Spell');
assert.equal(getEffect('55761792')?.kind,'ritualSummon','Ritual search fixtures must be Ritual Spells');
assert.equal(getPlayableCard('05405694')?.monsterType,'ritual');
assert.equal(getPlayableCard('05818798')?.englishName,'Gazelle the King of Mythical Beasts');

function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M346 diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}
  });
}
function member(seat){return 'm346-seat-'+seat;}
function deck(required=[]){
  const ids=[...required];
  for(const id of SAFE_NORMALS)if(!ids.includes(id))ids.push(id);
  assert.ok(ids.length>=20,'fixture Deck must contain at least twenty cards');
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
  throw new Error('M346 physical card missing from seat '+seat+': '+id);
}
function placeFaceDown(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
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
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
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
    editReply:async payload=>{validateDiscordPayload(payload);calls.push('edit');},
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
  assert.ok(menu,'the active physical representative must receive a real private Discord action menu');
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
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active representative action menu');
  const forged=interaction(record,partner,index,'m346-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function setup(c,key,{includeCandidates=true,includePartnerDecoy=true}={}){
  const required=[[],[],[],[]];
  required[0].push(c.id);
  if(includePartnerDecoy)required[0].push(c.partnerDecoy);
  if(includeCandidates)required[2].push(...c.candidateIds);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M346 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m346-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,1],'turn rotation must make seats 2 and 1 the active representatives');
  const source=placeFaceDown(state,0,c.id);
  const candidates=includeCandidates?c.candidateIds.map(id=>holder(state,2).deck.find(card=>card.id===id)): [];
  if(includeCandidates)assert.ok(candidates.every(Boolean),'active representative physical Deck must contain every eligible search target');
  const partnerDecoy=includePartnerDecoy?holder(state,0).deck.find(card=>card.id===c.partnerDecoy):null;
  if(includePartnerDecoy)assert.ok(partnerDecoy,'inactive partner physical Deck must contain its private decoy');
  assert.match(source.uid,/^m0:/);
  for(const card of candidates)if(card)assert.match(card.uid,/^m2:/);
  if(partnerDecoy)assert.match(partnerDecoy.uid,/^m0:/);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  tag.assertTagDuel(state);
  const id='m346-'+key,guild='m346-guild-'+key,channel='m346-channel-'+key;
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M346 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  const record=store.getTag(id);
  assertPublicPayload(record);
  return {id,key,c,source,candidates,partnerDecoy,before,record};
}
async function flipSource(fixture,record){
  const actor=member(2);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(index>=0,'the active representative must receive the partner-owned Flip Summon action');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-flip');
  return submit(record,actor,index,'m346-'+fixture.key+'-flip');
}
async function activateOptional(fixture,record){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'the active representative of the source team must receive the optional search trigger');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.source.uid);
  assert.ok(index>=0,'the private Discord menu must offer the optional search trigger');
  assert.ok(actions.some(action=>action.kind==='choose'&&action.target==='__skip__'),
    'the optional trigger must expose a decline action');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-optional');
  return submit(record,actor,index,'m346-'+fixture.key+'-activate');
}
async function search(fixture,record,selectedId){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'monsterSearch');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'search selection belongs to the active physical representative');
  const actions=tag.tagActions(record.state,actor);
  const expected=fixture.candidates.map(card=>card.uid);
  for(const uid of expected)assert.ok(actions.some(action=>action.kind==='choose'&&action.target===uid),
    'active Deck target must be offered privately: '+uid);
  assert.deepEqual(new Set(record.state.core.choice.targets),new Set(expected),
    'only the active representative physical Deck may supply search targets');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.partnerDecoy?.uid),
    'the inactive partner Deck must never leak into search options');
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===selectedId);
  assert.ok(index>=0,'selected target must be a legal search result');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-search');
  return submit(record,actor,index,'m346-'+fixture.key+'-search');
}
function assertOutcome(fixture,record,selectedId){
  const state=record.state,actor=member(2);
  const selected=fixture.candidates.find(card=>card.uid===selectedId);
  assert.ok(selected);
  assert.ok(tag.tagMemberHand(state,actor).some(card=>card.uid===selected.uid&&card.id===selected.id),
    'searched card must enter the active representative private hand');
  assert.match(selected.uid,/^m2:/);
  assert.ok(!holder(state,2).deck.some(card=>card.uid===selected.uid));
  if(fixture.partnerDecoy)assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid),
    'the inactive partner physical Deck must remain untouched');
  for(const other of fixture.candidates)if(other.uid!==selected.uid){
    assert.ok(holder(state,2).deck.some(card=>card.uid===other.uid),
      'unselected active Deck target must remain in its Deck');
  }
  const source=state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid);
  assert.ok(source&&source.faceUp&&source.position==='def','the partner-owned Flip source remains face-up in Defense');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  tag.assertTagDuel(state);
  tag.assertTagDuel(JSON.parse(JSON.stringify(state)));
}
for(const c of CASES){
  test('M346 '+c.name+' searches only the active physical Deck through Discord 2v2',async()=>{
    const fixture=setup(c,c.name.toLowerCase().replaceAll(' ','-'));
    let current=await flipSource(fixture,fixture.record);
    if(c.policy==='optional')current=await activateOptional(fixture,current);
    else{
      assert.equal(current.state.core.phase,'choice');
      assert.equal(current.state.core.choice.source,'monsterSearch',
        'mandatory Kotetsu FLIP must open its Equip Spell search directly');
    }
    current=await search(fixture,current,fixture.candidates[0].uid);
    assertOutcome(fixture,current,fixture.candidates[0].uid);
  });
}
test('M346 Manju exposes both Ritual Spell and Ritual Monster from the active Deck, never the partner Deck',async()=>{
  const c=CASES.find(x=>x.name==='Manju of the Ten Thousand Hands');
  const fixture=setup(c,'manju-both-ritual-categories');
  let current=await flipSource(fixture,fixture.record);
  current=await activateOptional(fixture,current);
  const targets=tag.tagActions(current.state,member(2)).filter(action=>action.kind==='choose').map(action=>action.target);
  assert.ok(targets.includes(fixture.candidates[0].uid));
  assert.ok(targets.includes(fixture.candidates[1].uid));
  assert.ok(!targets.includes(fixture.partnerDecoy.uid));
  current=await search(fixture,current,fixture.candidates[0].uid);
  assertOutcome(fixture,current,fixture.candidates[0].uid);
});
test('M346 Kotetsu does not open a mandatory search when only the inactive partner Deck has an Equip Spell',async()=>{
  const c=CASES.find(x=>x.name==='Iron Blacksmith Kotetsu');
  const fixture=setup(c,'partner-only-equip',{includeCandidates:false,includePartnerDecoy:true});
  const current=await flipSource(fixture,fixture.record);
  assert.equal(current.state.core.phase,'main','no eligible card in the active Deck means no search choice');
  assert.equal(current.state.core.choice,undefined);
  assert.ok(holder(current.state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
  assert.ok(!tag.tagMemberHand(current.state,member(2)).some(card=>card.uid===fixture.partnerDecoy.uid));
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  tag.assertTagDuel(current.state);
});
test('M346 optional Sonic Bird search can be declined without moving either physical Deck',async()=>{
  const c=CASES.find(x=>x.name==='Sonic Bird');
  const fixture=setup(c,'decline-optional');
  let current=await flipSource(fixture,fixture.record);
  assert.equal(current.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(current.state).id;
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target==='__skip__');
  assert.ok(index>=0);
  await rejectInactivePartner(current,actor,member(0),index,'decline');
  current=await submit(current,actor,index,'m346-decline');
  assert.equal(current.state.core.phase,'main');
  assert.ok(holder(current.state,2).deck.some(card=>card.uid===fixture.candidates[0].uid));
  assert.ok(holder(current.state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
