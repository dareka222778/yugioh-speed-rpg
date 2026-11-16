'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m263-shared-zones-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const TRAP_HOLE='04206964';
const WABOKU='12607053';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(NORMALS.length,8,'four physical Decks need eight enabled Normal Monsters');
assert.equal(getPlayableCard(TRAP_HOLE)?.kind,'trap');
assert.equal(getPlayableCard(WABOKU)?.kind,'trap');

function member(caseKey,seat){return 'm263-'+caseKey+'-seat-'+seat;}
function deck(){
  return [...NORMALS.flatMap(id=>[id,id]),TRAP_HOLE,TRAP_HOLE,WABOKU,WABOKU];
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
  throw new Error('M263 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  if(physical.hand.some(card=>card.id===id))return physical.hand.find(card=>card.id===id);
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical Deck must supply a card to its own hand');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setBackrow(state,seat,id){
  const card=takePhysical(state,seat,id);
  const setCard={...card,setTurn:0,faceUp:false};
  state.core.players[seat%2].backrow.push(setCard);
  return setCard;
}
function fillTeam(state,team,activeSeat,partnerSeat){
  const monsters=[
    deploy(state,activeSeat,NORMALS[0]),
    deploy(state,activeSeat,NORMALS[1]),
    deploy(state,partnerSeat,NORMALS[2])
  ];
  const backrow=[
    setBackrow(state,activeSeat,TRAP_HOLE),
    setBackrow(state,activeSeat,WABOKU),
    setBackrow(state,partnerSeat,TRAP_HOLE)
  ];
  assert.ok(monsters.every(card=>card.owner===team));
  assert.ok(monsters[0].uid.startsWith('m'+activeSeat+':'));
  assert.ok(monsters[2].uid.startsWith('m'+partnerSeat+':'));
  assert.ok(backrow[2].uid.startsWith('m'+partnerSeat+':'));
  return {monsters,backrow};
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
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must remain unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function setup(caseKey,first){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  const players=ids.map((id,seat)=>({id,name:'M263 '+caseKey+' seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m263-'+caseKey});
  fillTeam(state,0,0,2);
  fillTeam(state,1,1,3);
  const activeSeat=first;
  ensureInHand(state,activeSeat,NORMALS[3]);
  ensureInHand(state,activeSeat,WABOKU);
  assertRules(state);
  assert.equal(state.core.players[0].monsters.length,3);
  assert.equal(state.core.players[1].monsters.length,3);
  assert.equal(state.core.players[0].backrow.length,3);
  assert.equal(state.core.players[1].backrow.length,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const team of [0,1])for(const card of state.core.players[team].backrow){
    assert.ok(!publicState.includes(card.id),'Set backrow identity must stay hidden');
    assert.ok(!publicState.includes(card.uid),'Set backrow UID must stay hidden');
  }
  const id='m263-'+caseKey,guild='m263-guild-'+caseKey,channel='m263-channel-'+caseKey;
  const members=ids.map((id,seat)=>({id,name:'M263 '+caseKey+' seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,guild,ids,activeSeat,before,record:store.getTag(id)};
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
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public shared field must refresh after a legal action');
  return store.getTag(record.id);
}

for(const first of [0,1]){
  const teamName=first===0?'blue':'red';
  test(teamName+' Discord panel never offers a fourth Monster or fourth backrow set across physical partners',async()=>{
    const fixture=setup(teamName,first);
    const {id,guild,ids,activeSeat,before}=fixture;
    const partnerSeat=activeSeat===0?2:activeSeat===1?3:activeSeat===2?0:1;
    let current=fixture.record;
    assert.equal(tag.tagDecisionMember(current.state).id,ids[activeSeat]);
    const actions=tag.tagActions(current.state,ids[activeSeat]);
    assert.ok(actions.some(action=>action.kind==='end'),'the real action menu must remain usable');
    assert.ok(!actions.some(action=>action.kind==='summon'),
      'a full shared Monster Zone must not offer a fourth summon to the active physical seat');
    assert.ok(!actions.some(action=>action.kind==='set'),
      'a full shared Spell/Trap Zone must not offer a fourth set to the active physical seat');
    assert.deepEqual(tag.tagActions(current.state,ids[partnerSeat]),[],
      'the inactive physical teammate cannot act through the active seat panel');

    const panel=tagPrivateMessage(current,ids[activeSeat]);
    validateDiscordPayload(panel);
    const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+id+':'+current.revision+':'+ids[activeSeat]);
    assert.ok(menu,'the active physical seat must receive its private Discord action menu');
    assert.equal(menu.options.length,actions.length);
    for(const option of menu.options){
      const action=actions[Number(option.value)];
      assert.ok(action,'every Discord option must resolve to a legal engine action');
      assert.ok(!['summon','set'].includes(action.kind),
        'the rendered menu must not contain a fourth-zone action');
    }
    const partnerPanel=tagPrivateMessage(current,ids[partnerSeat]);
    validateDiscordPayload(partnerPanel);
    const partnerCustomIds=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .map(component=>component.custom_id);
    assert.ok(!partnerCustomIds.some(customId=>customId.startsWith('tag:act:')),
      'the inactive partner panel must not expose an action menu');

    const forged=interaction(current,ids[activeSeat],actions.length,'m263-forged-fourth-zone-'+teamName);
    const unchanged=JSON.stringify(current.state);
    await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Jogada indisponível\./);
    assert.deepEqual(forged.calls,['defer'],
      'the Discord adapter may acknowledge the click, but the store must reject the out-of-range action');
    assert.equal(store.getTag(id).revision,current.revision);
    assert.equal(JSON.stringify(store.getTag(id).state),unchanged,
      'a forged fourth-zone selection must not mutate the persisted duel');

    const endIndex=actions.findIndex(action=>action.kind==='end');
    const revision=current.revision;
    current=await submit(current,ids[activeSeat],endIndex,'m263-valid-end-'+teamName);
    assert.equal(current.revision,revision+1);
    assertConserved(current.state,before);
    assertRules(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
    assert.equal(current.state.core.players[0].monsters.length,3);
    assert.equal(current.state.core.players[1].monsters.length,3);
    assert.equal(current.state.core.players[0].backrow.length,3);
    assert.equal(current.state.core.players[1].backrow.length,3);
    assert.ok(current.members.some(member=>member.id===ids[partnerSeat]));
  });
}

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
