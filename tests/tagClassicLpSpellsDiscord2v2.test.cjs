'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m429-lp-spells-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {rulesFor}=require('../dist/rulesProfile');

const CASES=[
  {id:'76103675',name:'Sparks',kind:'burn',amount:200,activeSeat:0,expectedLP:[4000,3800]},
  {id:'46130346',name:'Hinotama',kind:'burn',amount:500,activeSeat:1,expectedLP:[3500,4000]},
  {id:'20871001',name:'Blue Medicine',kind:'heal',amount:400,activeSeat:2,expectedLP:[4400,4000]},
  {id:'47852924',name:'Soul of the Pure',kind:'heal',amount:800,activeSeat:3,expectedLP:[4000,4800]},
  {id:'46918794',name:'Tremendous Fire',kind:'sequence',activeSeat:0,expectedLP:[3500,3000],selfDamage:500,opponentDamage:1000},
  {id:'70368879',name:'Upstart Goblin',kind:'sequence',activeSeat:1,expectedLP:[5000,4000],draw:true,opponentGain:1000}
];

for(const entry of CASES){
  const card=getPlayableCard(entry.id);
  assert.ok(card,entry.name+' must be certified and playable');
  assert.equal(getCardStatus(entry.id)?.stage,'certified',entry.name+' must remain behaviorally certified');
  assert.equal(card.englishName,entry.name);
  assert.equal(getEffect(entry.id)?.kind,entry.kind,entry.name+' must use its registered effect operation');
  if(entry.amount!==undefined)assert.equal(getEffect(entry.id)?.amount,entry.amount,entry.name+' must preserve its exact LP value');
}

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>{
    const card=getPlayableCard(id);
    return card?.kind==='monster'&&card.monsterType==='normal'&&
      Number.isInteger(card.atk)&&Number.isInteger(card.defense);
  }).slice(0,7);
assert.ok(normalIds.length===7,'the 2v2 fixture needs seven certified Normal Monsters');

function member(seat){return 'm429-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=7,'each fixture deck needs enough certified cards');
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function ensureTopDeck(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical seat '+seat+' Deck must retain a deterministic top card');
  const [card]=physical.deck.splice(index,1);
  physical.deck.unshift(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Main Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must be unique');
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'LP Spell resolution must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function snapshotZones(state){
  const hands=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decks=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  return {hands,decks};
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
function register(state,key){
  const id='m429-'+key;
  const guild='m429-guild',channel='m429-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M429 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,'m429-message',7,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function assertNoPublicHandUIDs(record){
  const payload=ui.tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(record.state,member(seat))){
      assert.ok(!rendered.includes(card.uid),'public Discord payload leaked private hand UID '+card.uid);
    }
  }
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
    'the private Discord menu must expose the exact legal action index');
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit'],'Discord must acknowledge before editing the private response');
  assert.ok(refreshes>=1,'the committed action must refresh the public 2v2 panel');
  return store.getTag(record.id);
}

for(const entry of CASES){
  test(entry.name+' resolves exact LP and physical-seat changes through the real Discord 2v2 handler',async()=>{
    const players=[0,1,2,3].map(seat=>({
      id:member(seat),
      name:'M429 Seat '+seat,
      cards:deck(seat===entry.activeSeat?[entry.id]:[])
    }));
    let state=tag.createTagDuel(players,{
      classic:true,
      first:entry.activeSeat,
      seed:'m429-'+entry.id
    });
    state.core.turn=3;
    state.core.players[0].lp=4000;
    state.core.players[1].lp=4000;
    const source=ensureInHand(state,entry.activeSeat,entry.id);
    const drawn=entry.draw?ensureTopDeck(state,entry.activeSeat,normalIds[0]):null;
    assert.match(source.uid,new RegExp('^m'+entry.activeSeat+':'));
    assert.equal(tag.tagDecisionMember(state).id,member(entry.activeSeat));
    assertRules(state);
    tag.assertTagDuel(state);
    const before=inventorySnapshot(state);
    const zonesBefore=snapshotZones(state);
    const record=register(state,entry.id);
    assertNoPublicHandUIDs(record);

    const partnerSeat=(entry.activeSeat+2)%4;
    const ownPanel=ui.tagPrivateMessage(record,member(entry.activeSeat));
    const partnerPanel=ui.tagPrivateMessage(record,member(partnerSeat));
    validateDiscordPayload(ownPanel);
    validateDiscordPayload(partnerPanel);
    const ownComponents=ownPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    const partnerComponents=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    assert.ok(ownComponents.some(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+member(entry.activeSeat)),
      'active representative must receive the action menu');
    assert.ok(!partnerComponents.some(component=>component.custom_id?.startsWith('tag:act:')),
      'inactive partner must not receive the active representative action menu');

    const actions=tag.tagActions(record.state,member(entry.activeSeat));
    const index=actions.findIndex(action=>action.kind==='spell'&&action.card===source.uid);
    assert.ok(index>=0,entry.name+' must be a legal action for the active physical seat');
    const current=await submit(record,member(entry.activeSeat),index,'m429-request-'+entry.id);
    assert.equal(current.revision,record.revision+1,'one Discord interaction must commit exactly one session revision');
    assert.deepEqual(current.state.core.players.map(player=>player.lp),entry.expectedLP,
      entry.name+' must apply the exact shared-team LP result');

    const team=entry.activeSeat%2;
    assert.ok(current.state.core.players[team].grave.some(card=>card.uid===source.uid&&card.id===entry.id),
      entry.name+' must enter the activating team shared Graveyard with its original physical UID');
    for(const seat of [0,1,2,3]){
      const expectedHand=zonesBefore.hands.get(seat).filter(uid=>!(seat===entry.activeSeat&&uid===source.uid));
      if(entry.draw&&seat===entry.activeSeat)expectedHand.push(drawn.uid);
      assert.deepEqual(tag.tagMemberHand(current.state,member(seat)).map(card=>card.uid),expectedHand,
        entry.name+' must mutate only the activating physical hand'+(entry.draw?' and its own draw':''));
      const expectedDeck=zonesBefore.decks.get(seat).filter(uid=>!(entry.draw&&seat===entry.activeSeat&&uid===drawn.uid));
      assert.deepEqual(holder(current.state,seat).deck.map(card=>card.uid),expectedDeck,
        entry.name+' must not borrow another physical seat Deck');
    }
    if(entry.draw){
      assert.ok(tag.tagMemberHand(current.state,member(entry.activeSeat)).some(card=>card.uid===drawn.uid),
        'Upstart Goblin must draw from the active physical representative Deck');
      assert.ok(!tag.tagMemberHand(current.state,member(partnerSeat)).some(card=>card.uid===drawn.uid),
        'Upstart Goblin must not expose the draw to the inactive partner');
    }
    assertInventoryConserved(current.state,before);
    assertRules(current.state);
    tag.assertTagDuel(current.state);
    tag.assertTagDuel(JSON.parse(JSON.stringify(current.state)));
    assertNoPublicHandUIDs(current);

    validateDiscordPayload(ui.tagPrivateMessage(current,member(entry.activeSeat)));
    validateDiscordPayload(ui.tagPrivateMessage(current,member(partnerSeat)));
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
