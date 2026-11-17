'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m317-shield-sword-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M317 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const engine=require('../dist/duelEngine');
const {rulesFor}=require('../dist/rulesProfile');

const SHIELD_SWORD='52097679';
const CELTIC='91152256';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const MYSTICAL_ELF='15025844';
assert.equal(getPlayableCard(SHIELD_SWORD)?.englishName,'Shield & Sword');
assert.equal(getEffect(SHIELD_SWORD)?.kind,'shieldSword');
assert.equal(getCardStatus(SHIELD_SWORD)?.stage,'certified');
for(const [id,name,atk,def] of [
  [CELTIC,'Celtic Guardian',1400,1200],
  [BLUE_EYES,'Blue-Eyes White Dragon',3000,2500],
  [DARK_MAGICIAN,'Dark Magician',2500,2100],
  [MYSTICAL_ELF,'Mystical Elf',800,2000]
]){
  const card=getPlayableCard(id);
  assert.equal(card?.englishName,name);
  assert.equal(card?.atk,atk);
  assert.equal(card?.defense,def);
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);
function member(seat){return 'm317-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
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
  throw new Error('M317 physical card missing from seat '+seat+': '+id);
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
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
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
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public payload leaked UID '+card.uid);
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
    editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},
    calls
  };
}
async function submit(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
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
async function rejectInactive(record,index){
  const forged=interaction(record,member(2),index,'m317-forged',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(state){
  const id='m317-shield-sword';
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M317 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m317-guild','m317-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const required=[
    [SHIELD_SWORD,CELTIC],
    [DARK_MAGICIAN],
    [BLUE_EYES],
    [MYSTICAL_ELF]
  ];
  const players=ids.map((id,seat)=>({id,name:'M317 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m317-shield-sword'});
  state.core.turn=3;
  const spell=takePhysical(state,0,SHIELD_SWORD);
  holder(state,0).hand.push(spell);
  const celtic={...takePhysical(state,0,CELTIC),position:'atk',faceUp:true};
  const blueEyes={...takePhysical(state,2,BLUE_EYES),position:'atk',faceUp:true};
  const darkMagician={...takePhysical(state,1,DARK_MAGICIAN),position:'atk',faceUp:true};
  const mysticalElf={...takePhysical(state,3,MYSTICAL_ELF),position:'def',faceUp:false};
  state.core.players[0].monsters.push(celtic,blueEyes);
  state.core.players[1].monsters.push(darkMagician,mysticalElf);
  assert.match(spell.uid,/^m0:/);
  assert.match(celtic.uid,/^m0:/);
  assert.match(blueEyes.uid,/^m2:/);
  assert.match(darkMagician.uid,/^m1:/);
  assert.match(mysticalElf.uid,/^m3:/);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const originals=new Map([
    [celtic.uid,{atk:1400,def:1200}],
    [blueEyes.uid,{atk:3000,def:2500}],
    [darkMagician.uid,{atk:2500,def:2100}]
  ]);
  const faceDownUid=mysticalElf.uid;
  const partnerHand=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const partnerDeck=holder(state,2).deck.map(card=>card.uid);
  return {spell,celtic,blueEyes,darkMagician,mysticalElf,faceDownUid,originals,before,partnerHand,partnerDeck,record:register(state)};
}
function assertSwapped(state,fixture,swapped){
  for(const uid of fixture.originals.keys()){
    const monster=state.core.players.flatMap(team=>team.monsters).find(card=>card.uid===uid);
    assert.ok(monster,'face-up monster remains on the shared field');
    const original=fixture.originals.get(uid);
    assert.equal(engine.atk(monster,state.core),swapped?original.def:original.atk);
    assert.equal(engine.def(monster,state.core),swapped?original.atk:original.def);
  }
  const hidden=state.core.players.flatMap(team=>team.monsters).find(card=>card.uid===fixture.faceDownUid);
  assert.ok(hidden);
  assert.equal(hidden.faceUp,false);
  assert.equal(tag.publicTagDuel(state).teams[1].monsters.find(card=>card.faceUp===false)?.id,null,
    'the Set monster identity remains hidden throughout the field-wide effect');
}

test('Shield & Sword swaps printed ATK/DEF on both shared teams through Discord and expires at End Phase',async()=>{
  const fixture=setup();
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid);
  assert.ok(index>=0,'the active representative must receive Shield & Sword');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical partner cannot submit the Spell action');
  await rejectInactive(fixture.record,index);
  const activated=await submit(fixture.record,actor,index,'m317-shield-sword-activate');
  let state=activated.state;
  assertSwapped(state,fixture,true);
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.spell.uid));
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),fixture.partnerDeck);
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),fixture.partnerHand);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(activated);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const endIndex=tag.tagActions(state,actor).findIndex(action=>action.kind==='end');
  assert.ok(endIndex>=0);
  const ended=await submit(activated,actor,endIndex,'m317-shield-sword-end');
  state=ended.state;
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  assertSwapped(state,fixture,false);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(ended);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});