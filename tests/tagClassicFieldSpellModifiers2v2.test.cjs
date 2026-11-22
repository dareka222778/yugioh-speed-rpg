'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m495-field-spells-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {getPlayableCard,getCardStatus,getEffect,engineCard,enabledCardIds}=require('../dist/effectRegistry');
const {atk,def}=require('../dist/duelEngine');
const {rulesFor}=require('../dist/rulesProfile');
const {validateDiscordPayload}=require('../dist/discordPayload');

const FIELD_IDS=['86318356','50913601','59197169']; // Sogen, Mountain, Yami
const MONSTERS={
  warrior:'91152256',       // Celtic Guardian
  beastWarrior:'05053103',  // Battle Ox
  dragon:'74677422',        // Red-Eyes Black Dragon
  wingedBeast:'10202894',   // Skull Red Bird
  fiend:'70781052',         // Summoned Skull
  spellcaster:'46986414',   // Dark Magician
  fairy:'16972957',         // Doma The Angel of Silence
  otherFiend:'41392891'     // Feral Imp
};
const trapIds=enabledCardIds.filter(id=>engineCard(id)?.kind==='trap').slice(0,3);
const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!Object.values(MONSTERS).includes(id))
  .slice(0,6);
assert.equal(trapIds.length,3,'the fixture needs three certified Traps to fill the shared backrow');
assert.equal(normalIds.length,6,'the fixture needs six additional certified Normal Monsters');

const FIELD_EXPECTATIONS=[
  {id:'86318356',name:'Sogen',races:['Warrior','Beast-Warrior'],penaltyRaces:[]},
  {id:'50913601',name:'Mountain',races:['Dragon','Winged Beast','Thunder'],penaltyRaces:[]},
  {id:'59197169',name:'Yami',races:['Fiend','Spellcaster'],penaltyRaces:['Fairy']}
];
for(const entry of FIELD_EXPECTATIONS){
  const card=getPlayableCard(entry.id);
  assert.ok(card,entry.name+' must be playable in the current classic resolver');
  assert.equal(getCardStatus(entry.id)?.stage,'certified',entry.name+' must already be behaviorally certified');
  assert.equal(engineCard(entry.id)?.field,true,entry.name+' must occupy the separate Field Zone');
  assert.equal(getEffect(entry.id)?.kind,'field',entry.name+' must resolve through the field-effect definition');
  assert.deepEqual(getEffect(entry.id)?.races,entry.races);
  assert.deepEqual(getEffect(entry.id)?.penaltyRaces??[],entry.penaltyRaces);
}
for(const [race,id] of Object.entries(MONSTERS)){
  const card=getPlayableCard(id);
  assert.ok(card,race+' fixture must be certified and playable');
  assert.equal(card.kind,'monster');
  assert.equal(card.monsterType,'normal');
  assert.ok(tag.tagNormalCardIds.includes(id),race+' fixture must be legal in classic 2v2');
}
const deckPool=[...new Set([...FIELD_IDS,...Object.values(MONSTERS),...trapIds,...normalIds])];
assert.ok(deckPool.length>=20,'the deterministic deck pool must contain at least twenty unique cards');
const deckIds=deckPool.slice(0,20);
assert.equal(deckIds.length,20);
assert.ok(deckIds.every(id=>getPlayableCard(id)),'every physical Deck card must be certified');

function member(seat){return 'm495-seat-'+seat;}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function take(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('Card '+id+' unavailable in physical seat '+seat);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function monster(card,team){
  return {...card,owner:team,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
}
function addMonster(state,seat,id){
  const team=seat%2;
  const card=take(state,seat,id);
  const value=monster(card,team);
  state.core.players[team].monsters.push(value);
  return value;
}
function makeGame(seed,monsterEntries){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M495 Seat '+seat,
    cards:deckIds
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const monsters=monsterEntries.map(([seat,id])=>addMonster(state,seat,id));
  for(const id of trapIds){
    const card=take(state,0,id);
    state.core.players[0].backrow.push({...card,setTurn:state.core.turn,faceUp:false});
  }
  assert.equal(state.core.players[0].backrow.length,3);
  assert.ok(state.core.players[0].monsters.length<=3);
  assert.ok(state.core.players[1].monsters.length<=3);
  tag.assertTagDuel(state);
  assertRules(state);
  return {state,monsters};
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Main Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must be unique');
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Field Spell actions must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function register(state,key){
  const id='m495-'+key;
  const guild='m495-guild',channel='m495-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M495 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,'m495-message',7,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function interaction(record,actor,index,requestId){
  const calls=[];
  return {
    id:requestId,
    guildId:record.guild,
    user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
    values:[String(index)],
    isButton:()=>false,
    isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(record.id).revision,record.revision,
        'Discord acknowledgement must observe the persisted revision before mutation');
      calls.push('defer');
    },
    editReply:async payload=>{
      calls.push('edit');
      validateDiscordPayload(payload);
    },
    calls
  };
}
async function submit(record,actor,index,requestId){
  const panel=ui.tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'the active physical representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose the exact legal action index');
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit'],'Discord must acknowledge before editing the private response');
  assert.ok(refreshes>=1,'the committed action must refresh the public 2v2 panel');
  const updated=store.getTag(record.id);
  assert.equal(updated.revision,record.revision+1,'one interaction must commit exactly one revision');
  return updated;
}
async function submitAction(record,predicate,key){
  const actor=tag.tagDecisionMember(record.state).id;
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(predicate);
  assert.ok(index>=0,'Missing legal action for '+actor+' in '+record.state.core.phase);
  return submit(record,actor,index,'m495-'+key+'-'+record.revision);
}
function assertNoPublicHandUids(record){
  const payload=ui.tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(record.state,member(seat))){
      assert.ok(!rendered.includes(card.uid),'public Discord payload leaked private hand UID '+card.uid);
    }
  }
}
function assertPayloads(record){
  assertNoPublicHandUids(record);
  for(const seat of [0,1,2,3])validateDiscordPayload(ui.tagPrivateMessage(record,member(seat)));
}
function assertStats(state,entries){
  for(const [card,delta] of entries){
    const info=engineCard(card.id);
    assert.ok(info&&Number.isInteger(info.atk)&&Number.isInteger(info.defense));
    assert.equal(atk(card,state.core),Math.max(0,info.atk+delta),card.id+' ATK modifier');
    assert.equal(def(card,state.core),Math.max(0,info.defense+delta),card.id+' DEF modifier');
  }
}
async function activateField(record,uid,key){
  return submitAction(record,action=>action.kind==='field'&&action.card===uid,key);
}
async function activateFromHand(record,uid,key){
  return submitAction(record,action=>action.kind==='field'&&action.card===uid,key);
}

test('Sogen can be Set face-down, remains inactive until flipped and resolved, then boosts Warriors and Beast-Warriors on both teams',async()=>{
  const {state,monsters}=makeGame('m495-sogen-set-flip',[
    [0,MONSTERS.warrior],
    [1,MONSTERS.beastWarrior],
    [2,MONSTERS.warrior],
    [3,MONSTERS.otherFiend]
  ]);
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,'86318356');
  const warrior=monsters[0],beastWarrior=monsters[1],partnerWarrior=monsters[2],unmatched=monsters[3];
  let record=register(state,'sogen-set-flip');

  record=await submitAction(record,action=>action.kind==='setField'&&action.card===source.uid,'sogen-set');
  assert.equal(record.state.core.phase,'main','setting a Field Spell is a completed action, not an activation chain');
  assert.equal(record.state.core.players[0].field.uid,source.uid);
  assert.equal(record.state.core.players[0].field.faceUp,false);
  assert.equal(record.state.core.players[0].field.resolved,true,'the replacement Field Spell resolves immediately without a legal response');
  assert.equal(tag.publicTagDuel(record.state).teams[0].field.id,null,'a Set Field Spell identity remains hidden publicly');
  assertStats(record.state,[[warrior,0],[beastWarrior,0],[partnerWarrior,0],[unmatched,0]]);
  assert.equal(record.state.core.players[0].backrow.length,3,'the Field Zone is separate from all three backrow slots');
  assertPayloads(record);

  record=await activateField(record,source.uid,'sogen-flip');
  assert.equal(record.state.core.players[0].field.faceUp,true);
  assert.equal(record.state.core.players[0].field.resolved,false,'the continuous effect waits for the response window');
  assertStats(record.state,[[warrior,0],[beastWarrior,0],[partnerWarrior,0],[unmatched,0]]);
  assert.equal(tag.publicTagDuel(record.state).teams[0].field.id,'86318356');
  assert.equal(record.state.core.phase,'main','the Field Spell resolves immediately when no legal response is available');
  assert.equal(record.state.core.players[0].field.resolved,true);
  assertStats(record.state,[[warrior,200],[beastWarrior,200],[partnerWarrior,200],[unmatched,0]]);
  assertInventoryConserved(record.state,before);
  assertRules(record.state);
  tag.assertTagDuel(JSON.parse(JSON.stringify(record.state)));
  assertPayloads(record);
});

test('Mountain boosts Dragons and Winged Beasts across both teams without changing a non-matching Warrior',async()=>{
  const {state,monsters}=makeGame('m495-mountain-cross-team',[
    [0,MONSTERS.dragon],
    [1,MONSTERS.wingedBeast],
    [2,MONSTERS.warrior]
  ]);
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,'50913601');
  let record=register(state,'mountain-cross-team');
  record=await activateFromHand(record,source.uid,'mountain-activate');
  assert.equal(record.state.core.players[0].field.uid,source.uid);
  assert.equal(record.state.core.players[0].field.faceUp,true);
  assert.equal(record.state.core.players[0].field.resolved,true,'Mountain resolves immediately when no legal response is available');
  assertStats(record.state,[[monsters[0],200],[monsters[1],200],[monsters[2],0]]);
  assert.equal(record.state.core.players[0].backrow.length,3,'Field activation remains legal with a full shared backrow');
  assertInventoryConserved(record.state,before);
  assertRules(record.state);
  assertPayloads(record);
});

test('Yami boosts Fiends and Spellcasters and applies its separate Fairy penalty to both teams',async()=>{
  const {state,monsters}=makeGame('m495-yami-races',[
    [0,MONSTERS.fiend],
    [1,MONSTERS.spellcaster],
    [2,MONSTERS.fairy],
    [3,MONSTERS.warrior]
  ]);
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,'59197169');
  let record=register(state,'yami-races');
  record=await activateFromHand(record,source.uid,'yami-activate');
  assert.equal(record.state.core.phase,'main','Yami resolves immediately when no legal response is available');
  assert.equal(record.state.core.players[0].field.resolved,true);
  assertStats(record.state,[[monsters[0],200],[monsters[1],200],[monsters[2],-200],[monsters[3],0]]);
  assertInventoryConserved(record.state,before);
  assertRules(record.state);
  assertPayloads(record);
});

test('replacing Sogen with Mountain sends the old Field Spell to the shared GY and removes its modifier before applying the new one',async()=>{
  const {state,monsters}=makeGame('m495-field-replacement',[
    [0,MONSTERS.warrior],
    [1,MONSTERS.dragon]
  ]);
  const before=inventorySnapshot(state);
  const sogen=ensureInHand(state,0,'86318356');
  const mountain=ensureInHand(state,0,'50913601');
  let record=register(state,'field-replacement');
  record=await activateFromHand(record,sogen.uid,'replace-sogen-first');
  assert.equal(record.state.core.players[0].field.resolved,true);
  assertStats(record.state,[[monsters[0],200],[monsters[1],0]]);

  record=await activateFromHand(record,mountain.uid,'replace-mountain');
  assert.equal(record.state.core.players[0].field.uid,mountain.uid);
  assert.equal(record.state.core.players[0].field.resolved,false);
  assert.ok(record.state.core.players[0].grave.some(card=>card.uid===sogen.uid&&card.id==='86318356'),
    'the replaced Field Spell must enter the shared Graveyard with its original UID');
  assertStats(record.state,[[monsters[0],0],[monsters[1],200]],
    'the replaced Sogen modifier ends immediately and Mountain applies to Dragon');
  assertStats(record.state,[[monsters[0],0],[monsters[1],200]]);
  assertInventoryConserved(record.state,before);
  assertRules(record.state);
  tag.assertTagDuel(JSON.parse(JSON.stringify(record.state)));
  assertPayloads(record);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
