'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m320-continuous-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const engine=require('../dist/duelEngine');
const {rulesFor}=require('../dist/rulesProfile');

const HARPIE_LADY_1='91932350';
const HARPIES_PET_DRAGON='52040216';
const SWAMP_BATTLEGUARD='40453765';
const LAVA_BATTLEGUARD='20394040';
const AMAZONESS_PALADIN='47480070';
const AMAZONESS_ARCHER='91869203';
const DARK_MAGICIAN_GIRL='38033121';
const DARK_MAGICIAN='46986414';
const SPEAR_DRAGON='31553716';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

const REQUIRED=[
  [HARPIE_LADY_1,'Harpie Lady 1'],
  [HARPIES_PET_DRAGON,"Harpie's Pet Dragon"],
  [SWAMP_BATTLEGUARD,'Swamp Battleguard'],
  [LAVA_BATTLEGUARD,'Lava Battleguard'],
  [AMAZONESS_PALADIN,'Amazoness Paladin'],
  [AMAZONESS_ARCHER,'Amazoness Archer'],
  [DARK_MAGICIAN_GIRL,'Dark Magician Girl'],
  [DARK_MAGICIAN,'Dark Magician'],
  [SPEAR_DRAGON,'Spear Dragon'],
  [BLUE_EYES,'Blue-Eyes White Dragon'],
  [CELTIC_GUARDIAN,'Celtic Guardian']
];
for(const [id,name] of REQUIRED){
  assert.equal(getPlayableCard(id)?.englishName,name,'M320 card identity must be canonical: '+id);
  assert.equal(getCardStatus(id)?.stage,'certified','M320 only adds Discord integration for already certified cards');
}
for(const id of [HARPIE_LADY_1,HARPIES_PET_DRAGON,SWAMP_BATTLEGUARD,LAVA_BATTLEGUARD,AMAZONESS_PALADIN,DARK_MAGICIAN_GIRL]){
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'M320 requires at least twenty certified Normal Monsters for each physical Deck');

function member(seat){return 'm320-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
  const result=ids.slice(0,20);
  for(const id of required)assert.ok(result.includes(id),'required card missing from physical Deck: '+id);
  return result;
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
  throw new Error('M320 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,position='atk',faceUp=true){
  const physical=takePhysical(state,seat,id);
  const monster={id:physical.id,uid:physical.uid,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putInGrave(state,seat,id){
  const physical=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(physical);
  return physical;
}
function createState(requiredBySeat,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M320 Seat '+seat,cards:deck(requiredBySeat[seat]||[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  return state;
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
    assert.ok(team.monsters.length<=3,'shared Monster Zone must remain 3 per team');
    assert.ok(team.backrow.length<=3,'shared Spell/Trap Zone must remain 3 per team');
    assert.ok((team.extra??[]).length<=5);
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all 80 physical card UIDs must be unique');
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
  return JSON.stringify(payload.embeds[0].toJSON());
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
async function submitAction(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active physical representative must receive a private Discord action menu');
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
async function settle(record,prefix){
  for(let guard=0;record.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(record.state).id;
    const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(index>=0,'the current physical responder must receive a legal Pass action');
    record=await submitAction(record,actor,index,prefix+'-pass-'+guard);
  }
  return record;
}
function register(state,id){
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M320 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m320-guild','m320-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
async function summonViaDiscord(record,actor,cardUid,suffix){
  const index=tag.tagActions(record.state,actor).findIndex(action=>
    action.kind==='summon'&&action.card===cardUid&&action.position==='atk'&&action.tributes.length===0
  );
  assert.ok(index>=0,'the active representative must receive a legal Normal Summon action in the private Discord menu');
  record=await submitAction(record,actor,index,'m320-'+suffix+'-summon');
  return settle(record,'m320-'+suffix);
}
function persistState(record){
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=revision+1,updated=? WHERE id=?')
    .run(JSON.stringify(record.state),Date.now(),record.id);
  return store.getTag(record.id);
}
function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M320 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}
  });
}

test('Harpie Lady 1 and Harpie\'s Pet Dragon apply global WIND and name-count modifiers through Discord 2v2',async()=>{
  const state=createState([
    [HARPIE_LADY_1,SPEAR_DRAGON],
    [BLUE_EYES],
    [HARPIES_PET_DRAGON],
    [HARPIE_LADY_1,SPEAR_DRAGON]
  ],'m320-harpie-pet-dragon');
  const pet=placeMonster(state,2,HARPIES_PET_DRAGON);
  const allyWind=placeMonster(state,0,SPEAR_DRAGON);
  const opposingHarpie=placeMonster(state,3,HARPIE_LADY_1);
  const opposingWind=placeMonster(state,3,SPEAR_DRAGON);
  const opposingLight=placeMonster(state,1,BLUE_EYES);
  const sourcePhysical=takePhysical(state,0,HARPIE_LADY_1);
  holder(state,0).hand.push(sourcePhysical);
  assert.ok(sourcePhysical.uid.startsWith('m0:'));
  assert.ok(pet.uid.startsWith('m2:'));
  assert.ok(opposingHarpie.uid.startsWith('m3:'));
  assert.equal(state.core.players[0].monsters.length,2);
  assert.equal(state.core.players[1].monsters.length,3);
  const before=inventory(state);
  const record=register(state,'m320-harpie-pet');
  let current=await summonViaDiscord(record,member(0),sourcePhysical.uid,'harpie');
  const livePet=current.state.core.players[0].monsters.find(card=>card.uid===pet.uid);
  const liveSource=current.state.core.players[0].monsters.find(card=>card.uid===sourcePhysical.uid);
  const liveAllyWind=current.state.core.players[0].monsters.find(card=>card.uid===allyWind.uid);
  const liveOpposingWind=current.state.core.players[1].monsters.find(card=>card.uid===opposingWind.uid);
  const liveOpposingLight=current.state.core.players[1].monsters.find(card=>card.uid===opposingLight.uid);
  assert.equal(engine.atk(livePet,current.state.core),3200,
    'Pet Dragon receives +600 from two global WIND sources and +600 for two face-up Harpie Lady names');
  assert.equal(engine.def(livePet,current.state.core),3100,
    'Pet Dragon receives +600 DEF for the two face-up Harpie Lady names on both teams');
  assert.equal(engine.atk(liveSource,current.state.core),1900);
  assert.equal(engine.atk(liveAllyWind,current.state.core),2500);
  assert.equal(engine.atk(liveOpposingWind,current.state.core),2500,
    'the global WIND modifier applies to the opposing shared field too');
  assert.equal(engine.atk(liveOpposingLight,current.state.core),3000,
    'a non-WIND monster receives no global bonus');
  const rendered=assertPublicPayload(current);
  assert.ok(rendered.includes('ATQ 3200'));
  assert.ok(rendered.includes('ATQ 2500'));
  assert.ok(rendered.includes('ATQ 3000'));
  assert.ok(rendered.includes('ATQ 1900'));
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertConserved(current.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

test('Amazoness Paladin counts only its own shared team after a Discord Normal Summon',async()=>{
  const state=createState([
    [AMAZONESS_PALADIN],
    [],
    [AMAZONESS_ARCHER],
    [CELTIC_GUARDIAN]
  ],'m320-amazoness-paladin');
  const partnerArcher=placeMonster(state,2,AMAZONESS_ARCHER);
  const opposingNormal=placeMonster(state,3,CELTIC_GUARDIAN);
  const paladinPhysical=takePhysical(state,0,AMAZONESS_PALADIN);
  holder(state,0).hand.push(paladinPhysical);
  const before=inventory(state);
  let current=register(state,'m320-amazoness');
  current=await summonViaDiscord(current,member(0),paladinPhysical.uid,'amazoness');
  let livePaladin=current.state.core.players[0].monsters.find(card=>card.uid===paladinPhysical.uid);
  let livePartner=current.state.core.players[0].monsters.find(card=>card.uid===partnerArcher.uid);
  const liveOpponent=current.state.core.players[1].monsters.find(card=>card.uid===opposingNormal.uid);
  assert.equal(engine.atk(livePaladin,current.state.core),1900,
    'Paladin counts itself and its partner-owned Amazoness Archer for +200 ATK');
  assert.equal(engine.atk(liveOpponent,current.state.core),1400,
    'an opposing Normal Monster is excluded from the source team count');
  livePartner.faceUp=false;
  livePartner.position='def';
  current=persistState(current);
  livePaladin=current.state.core.players[0].monsters.find(card=>card.uid===paladinPhysical.uid);
  assert.equal(engine.atk(livePaladin,current.state.core),1800,
    'a face-down partner Amazoness no longer contributes to the count');
  const rendered=assertPublicPayload(current);
  assert.ok(rendered.includes('ATQ 1800'));
  assert.ok(!rendered.includes('Amazoness Archer'),
    'the public field must not reveal the identity of the face-down partner monster');
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertConserved(current.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

test('Swamp and Lava Battleguard count only the matching monster on their own shared team',()=>{
  const state=createState([
    [SWAMP_BATTLEGUARD],
    [LAVA_BATTLEGUARD],
    [LAVA_BATTLEGUARD],
    []
  ],'m320-battleguard-pair');
  const swamp=placeMonster(state,0,SWAMP_BATTLEGUARD);
  const lava=placeMonster(state,2,LAVA_BATTLEGUARD);
  const opposingLava=placeMonster(state,1,LAVA_BATTLEGUARD);
  const before=inventory(state);
  const record=register(state,'m320-battleguard');
  assert.equal(engine.atk(swamp,record.state.core),2300,
    'Swamp Battleguard receives +500 from its own team partner Lava Battleguard');
  assert.equal(engine.atk(lava,record.state.core),2050,
    'Lava Battleguard receives +500 from the active teammate Swamp Battleguard');
  assert.equal(engine.atk(opposingLava,record.state.core),1550,
    'the opposing Lava Battleguard cannot borrow the blue team Swamp Battleguard');
  const rendered=assertPublicPayload(record);
  assert.ok(rendered.includes('ATQ 2300'));
  assert.ok(rendered.includes('ATQ 2050'));
  assert.ok(rendered.includes('ATQ 1550'));
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertConserved(record.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
});

test('Dark Magician Girl counts both shared Graveyards and recalculates when a physical card leaves the Graveyard',()=>{
  const state=createState([
    [DARK_MAGICIAN],
    [],
    [DARK_MAGICIAN_GIRL],
    [DARK_MAGICIAN]
  ],'m320-dark-magician-girl');
  const girl=placeMonster(state,2,DARK_MAGICIAN_GIRL);
  const ownDarkMagician=putInGrave(state,0,DARK_MAGICIAN);
  const opposingDarkMagician=putInGrave(state,3,DARK_MAGICIAN);
  assert.ok(ownDarkMagician.uid.startsWith('m0:'));
  assert.ok(opposingDarkMagician.uid.startsWith('m3:'));
  const before=inventory(state);
  let record=register(state,'m320-dark-magician-girl');
  let liveGirl=record.state.core.players[0].monsters.find(card=>card.uid===girl.uid);
  assert.equal(engine.atk(liveGirl,record.state.core),2600,
    'Dark Magician Girl gains 300 ATK for each Dark Magician in the two shared Graveyards');
  let rendered=assertPublicPayload(record);
  assert.ok(rendered.includes('ATQ 2600'));
  const graveIndex=record.state.core.players[1].grave.findIndex(card=>card.uid===opposingDarkMagician.uid);
  assert.notEqual(graveIndex,-1);
  const [returned]=record.state.core.players[1].grave.splice(graveIndex,1);
  holder(record.state,3).hand.push(returned);
  record=persistState(record);
  liveGirl=record.state.core.players[0].monsters.find(card=>card.uid===girl.uid);
  assert.equal(engine.atk(liveGirl,record.state.core),2300,
    'moving the opponent physical copy to its owner hand removes exactly one 300 ATK count');
  rendered=assertPublicPayload(record);
  assert.ok(rendered.includes('ATQ 2300'));
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertConserved(record.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
