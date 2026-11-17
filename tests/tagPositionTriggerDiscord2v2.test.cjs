'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m344-position-trigger-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const BITE_SHOES='50122883',DESERTAPIR='13409151',RYU_KISHIN_CLOWN='42647539';
const AXE_RAIDER='48305365',CELTIC_GUARDIAN='91152256';
const CASES=[
  {id:BITE_SHOES,name:'Bite Shoes',trigger:'flip',mode:'switch',sourceSeat:2},
  {id:DESERTAPIR,name:'Desertapir',trigger:'flip',mode:'set',sourceSeat:2},
  {id:RYU_KISHIN_CLOWN,name:'Ryu-Kishin Clown',trigger:'onSummon',mode:'switch',sourceSeat:0}
];
for(const c of CASES){
  assert.equal(getPlayableCard(c.id)?.englishName,c.name);
  assert.equal(getCardStatus(c.id)?.stage,'certified');
  assert.equal(getMonsterEffect(c.id)?.trigger,c.trigger);
  assert.equal(getMonsterEffect(c.id)?.activation?.policy,'mandatory');
  assert.equal(getMonsterEffect(c.id)?.operation.kind,'positionChange');
}
const normals=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>![...CASES.map(c=>c.id)].includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(x=>x.card?.kind==='monster'&&x.card.monsterType==='normal')
  .slice(0,10).map(x=>x.id);
assert.ok(normals.length>=4);

function member(key,seat){return 'm344-'+key+'-seat-'+seat;}
function deck(required){
  const ids=[...new Set([...required,...normals])];
  return Array.from({length:20},(_,i)=>ids[i%ids.length]);
}
function holder(s,seat){const t=seat%2;return s.active[t]===seat?s.core.players[t]:s.reserves[seat];}
function take(s,seat,id){
  const p=holder(s,seat);
  for(const zone of ['hand','deck']){
    const i=p[zone].findIndex(c=>c.id===id);
    if(i>=0)return p[zone].splice(i,1)[0];
  }
  throw new Error('M344 missing physical card '+id+' at seat '+seat);
}
function putMonster(s,seat,id,position='atk',faceUp=true){
  const card=take(s,seat,id);
  const m={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  s.core.players[seat%2].monsters.push(m);
  return m;
}
function assertRules(s){
  const r=rulesFor(s.core);
  assert.equal(r.mainDeckMin,20);assert.equal(r.mainDeckMax,30);
  assert.equal(r.handLimit,6);assert.equal(r.handCheck,'end');
  assert.equal(r.extraDeckMax,5);assert.equal(r.monsterZones,3);assert.equal(r.spellTrapZones,3);
  for(const team of s.core.players){assert.ok(team.monsters.length<=3);assert.ok(team.backrow.length<=3);}
  for(const seat of [0,1,2,3])assert.ok((holder(s,seat).extra||[]).length<=5);
}
function inventory(s){
  const cards=tag.tagInventory(s);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(c=>[c.uid,c.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(s,before){
  const cards=tag.tagInventory(s);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(c=>c.uid)).size,before.size);
  for(const c of cards)assert.equal(before.get(c.uid),c.id);
}
function assertPrivate(s,key){
  const pub=JSON.stringify(tag.publicTagDuel(s));
  for(const seat of [0,1,2,3])for(const c of tag.tagMemberHand(s,member(key,seat)))
    assert.ok(!pub.includes(c.uid),'private hand UID leaked');
}
function assertPublic(record){
  const payload=tagPublicMessage(record);validateDiscordPayload(payload);
  const json=JSON.stringify(payload);
  for(const c of tag.tagInventory(record.state))assert.ok(!json.includes(c.uid),'public UID leak');
}
async function submit(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));validateDiscordPayload(panel);
  const rows=panel.components.map(r=>r.toJSON()).flatMap(r=>r.components||[]);
  const menu=rows.find(c=>c.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu&&menu.options.some(o=>o.value===String(index)),'private menu must expose exact legal action');
  const calls=[];
  const interaction={
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
    values:[String(index)],isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{assert.equal(store.getTag(record.id).revision,record.revision);calls.push('defer');},
    editReply:async p=>{validateDiscordPayload(p);calls.push('edit');}
  };
  let refresh=0;
  await handleTagComponent(interaction,async next=>{refresh++;validateDiscordPayload(tagPublicMessage(next));},()=>{});
  assert.deepEqual(calls,['defer','edit']);assert.ok(refresh>0);
  return store.getTag(record.id);
}
async function settle(record,key){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30);
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const i=actions.findIndex(a=>a.kind==='pass');
    assert.ok(i>=0,'each responder must receive pass');
    current=await submit(current,actor,i,'m344-'+key+'-pass-'+guard);
  }
  return current;
}
function setup(c,key){
  const ids=[0,1,2,3].map(i=>member(key,i));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m344-guild-'+key,channel='m344-channel-'+key;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const required=[BITE_SHOES,DESERTAPIR,RYU_KISHIN_CLOWN,AXE_RAIDER,CELTIC_GUARDIAN];
  const players=ids.map((id,i)=>({id,name:lobby.members[i].name,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m344-'+key});
  state.core.turn=3;
  assert.equal(state.active[0],0);assert.equal(state.active[1],1);
  assert.equal(tag.tagDecisionMember(state).id,member(key,0));
  const source=c.trigger==='flip'
    ?putMonster(state,c.sourceSeat,c.id,'def',false)
    :(()=>{const card=take(state,0,c.id);holder(state,0).hand.push(card);return card;})();
  const target=putMonster(state,3,AXE_RAIDER,'atk',true);
  const hidden=putMonster(state,1,CELTIC_GUARDIAN,'def',false);
  assert.match(source.uid,new RegExp('^m'+c.sourceSeat+':'));
  assert.match(target.uid,/^m3:/);assert.match(hidden.uid,/^m1:/);
  assertRules(state);assertPrivate(state,key);tag.assertTagDuel(state);
  const before=inventory(state);
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),7,Date.now(),'playing','classic-loan',lobby.id);
  return {record:store.getTag(lobby.id),source,target,hidden,before,guild,actor:ids[0],partner:ids[2],key};
}
async function activate(f,c){
  const actions=tag.tagActions(f.record.state,f.actor);
  const i=actions.findIndex(a=>c.trigger==='flip'
    ?a.kind==='position'&&a.card===f.source.uid&&a.mode==='flip'
    :a.kind==='summon'&&a.card===f.source.uid&&a.position==='atk');
  assert.ok(i>=0,'active representative must receive source action');
  const partnerPanel=tagPrivateMessage(f.record,f.partner);validateDiscordPayload(partnerPanel);
  const partnerRows=partnerPanel.components.map(r=>r.toJSON()).flatMap(r=>r.components||[]);
  assert.ok(!partnerRows.some(x=>x.custom_id.startsWith('tag:act:')),'inactive partner cannot act');
  const pub=tagPublicMessage(f.record);validateDiscordPayload(pub);
  assert.ok(!JSON.stringify(pub).includes(f.source.uid));
  return submit(f.record,f.actor,i,'m344-'+f.key+'-activate');
}
async function choose(f,c,record){
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,f.actor);
  const choices=tag.tagActions(record.state,actor).map((a,i)=>({a,i})).filter(x=>x.a.kind==='choose');
  assert.ok(choices.some(x=>x.a.target===f.target.uid),'face-up opposing monster must be selectable');
  if(c.id===DESERTAPIR)assert.ok(!choices.some(x=>x.a.target===f.source.uid),'Desertapir cannot target itself');
  return submit(record,actor,choices.find(x=>x.a.target===f.target.uid).i,'m344-'+f.key+'-choose');
}
for(const c of CASES){
  test(c.name+' changes a selected shared-field monster through the real Discord handler',async()=>{
    const f=setup(c,c.name.toLowerCase().replaceAll(' ','-'));
    let current=await activate(f,c);
    current=await settle(current,f.key);
    current=await choose(f,c,current);
    current=await settle(current,f.key);
    const state=current.state;
    const source=state.core.players[0].monsters.find(x=>x.uid===f.source.uid);
    const target=state.core.players[1].monsters.find(x=>x.uid===f.target.uid);
    const hidden=state.core.players[1].monsters.find(x=>x.uid===f.hidden.uid);
    assert.ok(source&&source.faceUp,'source remains face-up after its mandatory trigger');
    assert.ok(target&&hidden&&!hidden.faceUp,'unrelated face-down monster stays hidden');
    if(c.mode==='switch')assert.equal(target.position,'def');
    else assert.ok(!target.faceUp&&target.position==='def');
    assertConserved(state,f.before);assertPrivate(state,f.key);assertRules(state);
    assertPublic(current);tag.assertTagDuel(state);tag.assertTagDuel(JSON.parse(JSON.stringify(state)));
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
