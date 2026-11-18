'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m354-extra-deck-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {enabledCardIds,getEffect,getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
const FUSIONS=[...new Set(enabledCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return Boolean(card?.fusion)&&getEffect(id)?.kind==='fusion';
});
assert.ok(SAFE_NORMALS.length>=20,'M354 requires twenty distinct certified Normal Monsters for each physical Main Deck');
assert.ok(FUSIONS.length>=5,'M354 requires five enabled Fusion Monsters for each physical Extra Deck');

const member=seat=>'m354-seat-'+seat;
const EXTRA_SIZE=5;
let sessionCounter=0;

function playersWith(extraBySeat=Array.from({length:4},()=>FUSIONS.slice(0,EXTRA_SIZE))){
  return [0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M354 Seat '+seat,
    cards:SAFE_NORMALS.slice(0,20),
    extra:[...extraBySeat[seat]]
  }));
}
function createState(extraBySeat){
  return tag.createTagDuel(playersWith(extraBySeat),{
    classic:true,first:0,seed:'m354-extra-deck-ownership'
  });
}
function extraForSeat(state,seat){
  const team=seat%2;
  return state.active[team]===seat
    ?(state.core.players[team].extra??[])
    :(state.reserves[seat]?.extra??[]);
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
    assert.ok(team.monsters.length<=3,'each team retains three shared Monster Zones');
    assert.ok(team.backrow.length<=3,'each team retains three shared Spell/Trap Zones');
    assert.ok((team.extra??[]).length<=5,'the active physical Extra Deck cannot exceed five');
  }
  for(const held of Object.values(state.reserves)){
    assert.ok((held.extra??[]).length<=5,'the inactive physical Extra Deck cannot exceed five');
  }
}
function inventoryByUid(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,100,'four physical 20-card Main Decks and four 5-card Extra Decks must be conserved');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,100,'all physical card UIDs must remain unique');
  return result;
}
function assertExtraOwnership(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  for(const seat of [0,1,2,3]){
    const extra=extraForSeat(state,seat);
    assert.equal(extra.length,EXTRA_SIZE,'physical seat '+seat+' retains exactly five Extra Deck cards');
    assert.ok(extra.every(card=>card.uid.startsWith('m'+seat+':')),
      'Extra Deck cards must remain with their physical owner at seat '+seat);
    assert.ok(extra.every(card=>getPlayableCard(card.id)?.fusion),
      'only Fusion Monsters may remain in the Extra Deck');
    const physical=tag.tagInventory(state).filter(card=>card.uid.startsWith('m'+seat+':'));
    assert.equal(physical.length,25,'physical seat '+seat+' retains 20 Main Deck cards and five Extra Deck cards');
    assert.equal(physical.filter(card=>getPlayableCard(card.id)?.fusion).length,5);
  }
  assertRules(state);
}
function assertPrivateAndPublic(record){
  const publicState=JSON.stringify(tag.publicTagDuel(record.state));
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(record.state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
    }
  }
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
function register(state){
  const id='m354-session-'+(++sessionCounter);
  const members=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M354 Seat '+seat,accepted:true
  }));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id,'m354-guild','m354-channel',null,0,Date.now(),'playing',
    JSON.stringify(members),JSON.stringify(state),'classic-owned'
  );
  return store.getTag(id);
}
function makeInteraction(record,actor,index,suffix){
  const calls=[];
  return {
    id:'m354-interaction-'+suffix,
    guildId:record.guild,
    user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
    values:[String(index)],
    isButton:()=>false,
    isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(record.id).revision,record.revision,
        'the revision must remain unchanged until the interaction is acknowledged');
      calls.push('defer');
    },
    editReply:async payload=>{
      validateDiscordPayload(payload);
      calls.push('edit');
    },
    calls
  };
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active seat action menu');
  const forged=makeInteraction(record,partner,index,suffix+'-forged');
  const before=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'unauthorized partner interaction must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),before);
}
async function submitEnd(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the active seat must receive the legal End Phase action');
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=rows.find(row=>row.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active seat must receive its private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose the End Phase action');
  const partner=member((Number(actor.slice(-1))+2)%4);
  await rejectInactivePartner(record,actor,partner,index,suffix);
  const interaction=makeInteraction(record,actor,index,suffix);
  let publicRefreshes=0;
  await handleTagComponent(interaction,async next=>{
    publicRefreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(interaction.calls,['defer','edit']);
  assert.ok(publicRefreshes>=1,'the committed turn transition must refresh the public Discord panel');
  return store.getTag(record.id);
}

for(const seat of [0,1,2,3]){
  nodeTest('M354 physical seat '+seat+' rejects a 19-card Main Deck',()=>{
    const players=playersWith();
    players[seat].cards=SAFE_NORMALS.slice(0,19);
    assert.throws(
      ()=>tag.createTagDuel(players,{classic:true,first:0,seed:'m354-main-19-'+seat}),
      /O duelo exige um deck de 20 a 30 cartas/
    );
  });
  nodeTest('M354 physical seat '+seat+' rejects a 31-card Main Deck',()=>{
    const players=playersWith();
    const pool=SAFE_NORMALS.slice(0,11);
    players[seat].cards=Array.from({length:31},(_,index)=>pool[index%pool.length]);
    assert.throws(
      ()=>tag.createTagDuel(players,{classic:true,first:0,seed:'m354-main-31-'+seat}),
      /O duelo exige um deck de 20 a 30 cartas/
    );
  });
  nodeTest('M354 physical seat '+seat+' rejects a six-card Extra Deck',()=>{
    const players=playersWith();
    players[seat].extra=[...FUSIONS.slice(0,EXTRA_SIZE),FUSIONS[0]];
    assert.throws(
      ()=>tag.createTagDuel(players,{classic:true,first:0,seed:'m354-extra-6-'+seat}),
      /Deck Adicional: máximo de 5 cartas/
    );
  });
}

nodeTest('M354 five-card Extra Decks remain with their physical owners through all four Discord 2v2 turn rotations',async()=>{
  const state=createState();
  assert.deepEqual(state.active,[0,1]);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  const before=inventoryByUid(state);
  assertExtraOwnership(state);
  let record=register(state);
  assertPrivateAndPublic(record);

  for(const seat of [0,1,2,3]){
    assert.equal(tag.tagDecisionMember(record.state).id,member(seat),
      'turn order must advance through physical seats 0, 1, 2 and 3');
    record=await submitEnd(record,member(seat),'turn-'+seat);
    assert.equal(tag.tagDecisionMember(record.state).id,member((seat+1)%4));
    assertExtraOwnership(record.state);
    assertPrivateAndPublic(record);
    const after=inventoryByUid(record.state);
    assert.equal(after.size,before.size);
    for(const [uid,id] of before)assert.equal(after.get(uid),id,'physical card identity changed: '+uid);
  }
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
