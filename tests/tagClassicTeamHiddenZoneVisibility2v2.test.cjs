'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m358-hidden-zones-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPublicMessage,tagZonesMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {enabledCardIds,getPlayableCard}=require('../dist/effectRegistry');
const {getCard}=require('../dist/collection');
const {rulesFor}=require('../dist/rulesProfile');
const {MessageFlags}=require('discord.js');
const trace=message=>process.stderr.write('[M358] '+message+'\\n');
function debugTest(name,fn){return nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){trace(name+' FAILED: '+(error&&error.stack||error));throw error;}});}
trace('module setup started');

const BOTTOMLESS='29401950';
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=3,'M358 requires three distinct certified Normal Monsters');
assert.ok(enabledCardIds.includes(BOTTOMLESS),'M358 requires the enabled Bottomless Trap Hole identity');
assert.equal(getPlayableCard(BOTTOMLESS)?.kind,'trap');
const MAIN_DECK=[...SAFE_NORMALS.slice(0,19),BOTTOMLESS];
assert.equal(new Set(MAIN_DECK).size,20,'each physical Main Deck must contain twenty distinct cards');

const member=seat=>'m358-seat-'+seat;
let sessionCounter=0;

function playersWith(){
  return [0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M358 Seat '+seat,
    cards:[...MAIN_DECK]
  }));
}
function createState(){
  return tag.createTagDuel(playersWith(),{
    classic:true,first:0,seed:'m358-team-hidden-zone-visibility'
  });
}
function physicalHolder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysicalCard(state,seat,id){
  const holder=physicalHolder(state,seat);
  for(const zone of ['deck','hand']){
    const index=holder[zone].findIndex(card=>card.id===id);
    if(index>=0)return holder[zone].splice(index,1)[0];
  }
  throw new Error('M358 fixture could not find physical card '+id+' at seat '+seat);
}
function placeMonster(state,ownerSeat,team,id,{faceUp,position='def'}){
  const card=takePhysicalCard(state,ownerSeat,id);
  card.faceUp=faceUp;
  card.position=position;
  state.core.players[team].monsters.push(card);
  return card;
}
function placeHiddenTrap(state,ownerSeat,team){
  const card=takePhysicalCard(state,ownerSeat,BOTTOMLESS);
  card.faceUp=false;
  state.core.players[team].backrow.push(card);
  return card;
}
function register(state){
  const id='m358-session-'+(++sessionCounter);
  const members=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M358 Seat '+seat,accepted:true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id,'m358-guild','m358-channel',null,0,Date.now(),'playing',
    JSON.stringify(members),JSON.stringify(state),'classic-owned'
  );
  return store.getTag(id);
}
function payloadText(payload){
  return JSON.stringify(payload.embeds.map(embed=>embed.toJSON()));
}
function cardName(id){
  const card=getCard(id);
  assert.ok(card?.name,'M358 card name must resolve for '+id);
  return card.name;
}
async function openPrivateZones(record,seat){
  trace('open zones seat '+seat);
  const deferred=[];
  const calls=[];
  let payload;
  const interaction={
    id:'m358-zones-'+seat,
    guildId:record.guild,
    user:{id:member(seat)},
    customId:'tag:zones:'+record.id+':'+record.revision,
    deferReply:async options=>{calls.push({kind:'reply',options});},
    deferUpdate:async()=>{calls.push({kind:'update'});},
    editReply:async next=>{
      validateDiscordPayload(next);
      payload=next;
      calls.push({kind:'edit'});
      return next;
    }
  };
  await handleTagComponent(interaction,async()=>{},kind=>deferred.push(kind));
  trace('open zones seat '+seat+' completed');
  assert.deepEqual(deferred,['reply'],'opening private zones must use an ephemeral reply');
  assert.equal(calls[0].kind,'reply');
  assert.equal(calls[0].options.flags,MessageFlags.Ephemeral,
    'hidden-zone identities must be delivered only through an ephemeral Discord response');
  assert.equal(calls[1].kind,'edit');
  return payload;
}

trace('before createState');
const state=createState();
trace('after createState');
assert.deepEqual(state.active,[0,1],'the initial active representatives are physical seats 0 and 1');
trace('before hidden team0');
const hiddenTeam0=placeMonster(state,2,0,SAFE_NORMALS[0],{faceUp:false,position:'def'});
trace('after hidden team0');
const hiddenTeam1=placeMonster(state,3,1,SAFE_NORMALS[1],{faceUp:false,position:'def'});
trace('after hidden team1');
const publicTeam0=placeMonster(state,0,0,SAFE_NORMALS[2],{faceUp:true,position:'atk'});
trace('after public team0');
const hiddenTrapTeam0=placeHiddenTrap(state,0,0);
trace('after hidden trap team0');
const hiddenTrapTeam1=placeHiddenTrap(state,1,1);
trace('after hidden trap team1');
assert.doesNotThrow(()=>tag.assertTagDuel(state),'M358 fixture must preserve 2v2 invariants');
trace('tag state validated');

const hiddenTeam0Names=[cardName(hiddenTeam0.id),cardName(hiddenTrapTeam0.id)];
const hiddenTeam1Names=[cardName(hiddenTeam1.id),cardName(hiddenTrapTeam1.id)];
const hiddenCards=[hiddenTeam0,hiddenTeam1,hiddenTrapTeam0,hiddenTrapTeam1];

function assertRulesAndInventory(){
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
  const inventory=tag.tagInventory(state);
  assert.equal(inventory.length,80,'four physical twenty-card Main Decks must remain conserved');
  assert.equal(new Set(inventory.map(card=>card.uid)).size,80,'all physical card UIDs must remain unique');
  for(const hidden of hiddenCards){
    assert.ok(inventory.some(card=>card.uid===hidden.uid&&card.id===hidden.id),
      'hidden card identity/UID must remain in the physical inventory');
  }
}

debugTest('M358 public projection and public Discord field never reveal face-down card identities',()=>{
  assertRulesAndInventory();
  const projection=tag.publicTagDuel(state);
  const serializedProjection=JSON.stringify(projection);
  assert.ok(!serializedProjection.includes('uid'),'public projection must not serialize physical UIDs');
  for(const hidden of hiddenCards){
    assert.ok(!serializedProjection.includes(hidden.id),
      'public projection leaked hidden card ID '+hidden.id);
    assert.ok(!serializedProjection.includes(hidden.uid),
      'public projection leaked hidden card UID '+hidden.uid);
  }
  const publicMonster=projection.teams[0].monsters.find(card=>card.faceUp);
  assert.equal(publicMonster.id,publicTeam0.id,'face-up monsters remain public');
  assert.equal(projection.teams[0].monsters.find(card=>!card.faceUp).id,null);
  assert.equal(projection.teams[1].monsters.find(card=>!card.faceUp).id,null);
  assert.equal(projection.teams[0].backrow[0].id,null);
  assert.equal(projection.teams[1].backrow[0].id,null);
  assert.ok(serializedProjection.includes('"handCount"'),'public projection exposes counts, not hand contents');
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!serializedProjection.includes(card.uid),
        'public projection leaked private hand UID for seat '+seat);
    }
  }
  const record=register(state);
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=payloadText(payload);
  assert.ok(rendered.includes(cardName(publicTeam0.id)),'public panel must retain face-up card identity');
  for(const hidden of hiddenCards){
    assert.ok(!rendered.includes(hidden.id),'public Discord payload leaked hidden card ID '+hidden.id);
    assert.ok(!rendered.includes(cardName(hidden.id)),
      'public Discord payload leaked hidden card name '+cardName(hidden.id));
    assert.ok(!rendered.includes(hidden.uid),'public Discord payload leaked hidden UID '+hidden.uid);
  }
});

debugTest('M358 both teammates can inspect their own team hidden zones through ephemeral Discord panels',async()=>{
  const record=register(state);
  for(const seat of [0,2]){
    const payload=await openPrivateZones(record,seat);
    const rendered=payloadText(payload);
    for(const name of hiddenTeam0Names){
      assert.ok(rendered.includes(name),
        'team 0 member '+seat+' must be able to inspect shared hidden card '+name);
    }
    for(const name of hiddenTeam1Names){
      assert.ok(!rendered.includes(name),
        'team 0 member '+seat+' must not inspect opposing hidden card '+name);
    }
    validateDiscordPayload(payload);
  }
  for(const seat of [1,3]){
    const payload=await openPrivateZones(record,seat);
    const rendered=payloadText(payload);
    for(const name of hiddenTeam1Names){
      assert.ok(rendered.includes(name),
        'team 1 member '+seat+' must be able to inspect shared hidden card '+name);
    }
    for(const name of hiddenTeam0Names){
      assert.ok(!rendered.includes(name),
        'team 1 member '+seat+' must not inspect opposing hidden card '+name);
    }
    validateDiscordPayload(payload);
  }
});

debugTest('M358 a hidden card owned by the inactive partner remains visible to both allies but not to either opponent',async()=>{
  const record=register(state);
  const activeOwner=await openPrivateZones(record,0);
  const inactiveOwner=await openPrivateZones(record,2);
  const opponentOne=await openPrivateZones(record,1);
  const opponentTwo=await openPrivateZones(record,3);
  assert.ok(payloadText(activeOwner).includes(cardName(hiddenTeam0.id)));
  assert.ok(payloadText(inactiveOwner).includes(cardName(hiddenTeam0.id)));
  assert.ok(!payloadText(opponentOne).includes(cardName(hiddenTeam0.id)));
  assert.ok(!payloadText(opponentTwo).includes(cardName(hiddenTeam0.id)));
  assert.ok(hiddenTeam0.uid.startsWith('m2:'),
    'the hidden monster on team 0 field must retain physical ownership by inactive seat 2');
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
