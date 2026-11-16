'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m265-shadow-ghoul-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const engine=require('../dist/duelEngine');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const SHADOW_GHOUL='30778711';
const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
const SONIC_BIRD='57617178';
const FIELD_SPELLS=['18161786','19384334','45778932'];
const DIRECT_ATTACK_FILLERS=['12472242','21347810','58861941','32809211','02792265','59290628'];
assert.equal(getPlayableCard(SHADOW_GHOUL)?.englishName,'Shadow Ghoul');
assert.equal(getPlayableCard(SHADOW_GHOUL)?.atk,1600);
assert.equal(getEffect(SHADOW_GHOUL)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(SHADOW_GHOUL)?.trigger,'continuous');
assert.equal(getMonsterEffect(SHADOW_GHOUL)?.operation.kind,'continuous');

const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>
  ![SHADOW_GHOUL,DARK_MAGICIAN,BLUE_EYES,SONIC_BIRD,...FIELD_SPELLS,...DIRECT_ATTACK_FILLERS].includes(id)
).slice(0,7);
assert.equal(FILLERS.length,7);
const POOL=[SHADOW_GHOUL,DARK_MAGICIAN,BLUE_EYES,SONIC_BIRD,...FIELD_SPELLS,...DIRECT_ATTACK_FILLERS,...FILLERS];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

function member(seat){return 'm265-seat-'+seat;}
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
  throw new Error('M265 physical card missing from seat '+seat+': '+id);
}
function moveToGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function placeMonster(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
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
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M265 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m265-shadow-ghoul-discord'});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3]);
  // The active participant is seat 2. The field and Graveyard remain team-shared.
  const alliedActive=moveToGrave(state,0,DARK_MAGICIAN);
  const alliedPartner=moveToGrave(state,2,BLUE_EYES);
  const alliedSpell=moveToGrave(state,0,FIELD_SPELLS[0]);
  const opposingMonster=moveToGrave(state,1,DIRECT_ATTACK_FILLERS[0]);
  const tribute=placeMonster(state,0,DIRECT_ATTACK_FILLERS[1]);
  const shadow=takePhysical(state,2,SHADOW_GHOUL);
  holder(state,2).hand.push(shadow);
  assert.match(alliedActive.uid,/^m0:/);
  assert.match(alliedPartner.uid,/^m2:/);
  assert.match(opposingMonster.uid,/^m1:/);
  assert.match(tribute.uid,/^m0:/);
  assert.match(shadow.uid,/^m2:/);
  assert.equal(state.core.players[0].grave.length,3);
  assert.equal(state.core.players[1].grave.length,1);
  assert.equal(engine.atk(tribute,state.core),getPlayableCard(tribute.id).atk);
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  assertPrivateHands(state);
  const id='m265-shadow-ghoul-discord',guild='m265-guild',channel='m265-channel';
  const members=ids.map((id,seat)=>({id,name:'M265 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,guild,ids,before,shadowUid:shadow.uid,tributeUid:tribute.uid,record:store.getTag(id)};
}
function interaction(record,actor,index,requestId,owner=actor){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+owner,
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

test('Shadow Ghoul Discord field displays shared-team Graveyard ATK while preserving physical owner and private hands',async()=>{
  const fixture=setup();
  const {id,ids,before,shadowUid,tributeUid}=fixture;
  let current=fixture.record;
  assert.equal(tag.tagDecisionMember(current.state).id,ids[2]);
  const partnerHandBefore=tag.tagMemberHand(current.state,ids[0]).map(card=>card.uid);
  const actions=tag.tagActions(current.state,ids[2]);
  const summonIndex=actions.findIndex(action=>action.kind==='summon'&&action.card===shadowUid&&action.position==='atk'&&action.tributes?.includes(tributeUid));
  assert.ok(summonIndex>=0,'the active partner must be able to Tribute the inactive partner physical monster');
  assert.ok(actions.some(action=>action.kind==='end'));

  const privatePanel=tagPrivateMessage(current,ids[2]);
  validateDiscordPayload(privatePanel);
  const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+id+':'+current.revision+':'+ids[2]);
  assert.ok(menu);
  assert.ok(menu.options.some(option=>option.value===String(summonIndex)),
    'the real Discord menu must expose the legal Tribute Summon');
  const inactivePanel=tagPrivateMessage(current,ids[0]);
  validateDiscordPayload(inactivePanel);
  assert.ok(!inactivePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .some(component=>(component.custom_id||'').startsWith('tag:act:')));
  assert.deepEqual(tag.tagActions(current.state,ids[0]),[]);

  const forged=interaction(current,ids[0],summonIndex,'m265-forged-partner-summon',ids[2]);
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(id).state),unchanged);

  current=await submit(current,ids[2],summonIndex,'m265-shadow-summon');
  const shadow=current.state.core.players[0].monsters.find(monster=>monster.uid===shadowUid);
  assert.ok(shadow);
  assert.equal(shadow.owner,0,'team controller is shared while physical owner remains seat 2');
  assert.equal(engine.atk(shadow,current.state.core),1900,
    'three allied Graveyard monsters contribute 300 ATK; the Spell and opposing monster do not count');
  assert.equal(current.state.core.players[0].grave.length,4);
  assert.equal(current.state.core.players[1].grave.length,1);
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===tributeUid),
    'the tribute returns to the shared team Graveyard with its original seat-0 UID');
  assert.deepEqual(tag.tagMemberHand(current.state,ids[0]).map(card=>card.uid),partnerHandBefore,
    'the inactive partner private hand is unchanged');

  const publicPanel=tagPublicMessage(current);
  validateDiscordPayload(publicPanel);
  const rendered=JSON.stringify(publicPanel);
  assert.ok(rendered.includes('Shadow Ghoul • ATQ 1900'),
    'the actual Discord field embed must render the dynamic 1900 ATK');
  assert.ok(!rendered.includes(shadowUid),'the public Discord field must not expose the physical UID');
  assertConserved(current.state,before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
