'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m284-field-spell-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M284 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const engine=require('../dist/duelEngine');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const FIELD_SPELLS=[
  {id:'18161786',name:'Mystic Plasma Zone',attribute:'DARK',monster:'46986414',atk:2500,def:2100},
  {id:'19384334',name:'Molten Destruction',attribute:'FIRE',monster:'82035781',atk:1700,def:1900},
  {id:'45778932',name:'Rising Air Current',attribute:'WIND',monster:'57617178',atk:1400,def:1000}
];
const BLUE_EYES='89631139';
const DIRECT_ATTACK_FILLERS=['12472242','21347810','58861941','32809211','02792265','59290628'];
for(const field of FIELD_SPELLS){
  const card=getPlayableCard(field.id);
  assert.equal(card?.englishName,field.name);
  assert.equal(card?.kind,'spell');
  assert.equal(card?.field,true);
  assert.deepEqual(getEffect(field.id),{
    kind:'field',races:[],attributes:[field.attribute],atk:500,def:-400
  },field.name+' must have its exact attribute-only global modifier');
  const monster=getPlayableCard(field.monster);
  assert.equal(monster?.kind,'monster');
  assert.equal(monster?.attribute,field.attribute);
  assert.equal(monster?.atk,field.atk);
  assert.equal(monster?.defense,field.def);
}
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>
  !FIELD_SPELLS.some(card=>card.id===id)&&
  !FIELD_SPELLS.some(card=>card.monster===id)&&
  id!==BLUE_EYES&&!DIRECT_ATTACK_FILLERS.includes(id)
).slice(0,7);
assert.equal(FILLERS.length,7,'the fixture needs seven distinct certified Normal Monsters');
const POOL=[...FIELD_SPELLS.map(card=>card.id),...FIELD_SPELLS.map(card=>card.monster),
  BLUE_EYES,...DIRECT_ATTACK_FILLERS,...FILLERS];
assert.equal(POOL.length,20,'each physical participant needs a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must use distinct card identities');

function member(seat){return 'm284-seat-'+seat;}
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
  throw new Error('M284 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
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
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3,'each shared team field has only three Monster Zones');
    assert.ok(team.backrow.length<=3,'each shared team field has only three Spell/Trap Zones');
  }
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
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
function interaction(record,userId,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:userId},
    customId:'tag:act:'+record.id+':'+record.revision+':'+userId,
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
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'the real private Discord panel must expose the active seat action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord menu must contain the legal action index '+index);
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
    assert.ok(guard<30,'the Field Spell response windows must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m284-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(field){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M284 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m284-'+field.id});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const ally=deploy(state,2,field.monster);
  const opponent=deploy(state,1,field.monster);
  const control=deploy(state,3,BLUE_EYES);
  const fieldCard=takePhysical(state,0,field.id);
  holder(state,0).hand.push(fieldCard);
  const before=inventory(state);
  assert.match(ally.uid,/^m2:/);
  assert.match(opponent.uid,/^m1:/);
  assert.match(control.uid,/^m3:/);
  assert.match(fieldCard.uid,/^m0:/);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m284-'+field.id,guild='m284-guild',channel='m284-channel';
  const members=ids.map((id,seat)=>({id,name:'M284 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,ally,opponent,control,fieldCard,record:store.getTag(id)};
}
function assertFinal(fixture,state){
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
for(const field of FIELD_SPELLS){
  test(field.name+' is activated through Discord and modifies matching monsters on both shared teams',async()=>{
    const fixture=setup(field);
    const actions=tag.tagActions(fixture.record.state,fixture.actor);
    const index=actions.findIndex(action=>
      action.kind==='field'&&action.card===fixture.fieldCard.uid
    );
    assert.ok(index>=0,'the active participant must see the Field Spell action in their private Discord menu');
    const current=await settleResponses(
      await submit(fixture.record,fixture.actor,index,'m284-'+field.id+'-activate'),
      field.id+'-activate'
    );
    const ally=current.state.core.players[0].monsters.find(card=>card.uid===fixture.ally.uid);
    const opponent=current.state.core.players[1].monsters.find(card=>card.uid===fixture.opponent.uid);
    const control=current.state.core.players[1].monsters.find(card=>card.uid===fixture.control.uid);
    const activeField=current.state.core.players[0].field;
    assert.equal(activeField?.id,field.id);
    assert.equal(activeField?.uid,fixture.fieldCard.uid,'the Field Spell retains the active physical player's UID');
    assert.equal(engine.atk(ally,current.state.core),field.atk+500);
    assert.equal(engine.def(ally,current.state.core),field.def-400);
    assert.equal(engine.atk(opponent,current.state.core),field.atk+500,
      'the Field Spell affects a matching monster on the opposing shared team');
    assert.equal(engine.def(opponent,current.state.core),field.def-400);
    assert.equal(engine.atk(control,current.state.core),3000,
      'a LIGHT control monster receives no ATK modifier');
    assert.equal(engine.def(control,current.state.core),2500,
      'a LIGHT control monster receives no DEF modifier');
    assert.ok(!holder(current.state,0).hand.some(card=>card.uid===fixture.fieldCard.uid));
    assertFinal(fixture,current.state);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
