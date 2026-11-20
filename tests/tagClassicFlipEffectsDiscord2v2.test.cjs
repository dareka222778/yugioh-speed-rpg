const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'m428-tag-flip-')),'game.sqlite');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {getCard}=require('../dist/collection');
const {validateDiscordPayload}=require('../dist/discordPayload');

const normalIds=tag.tagNormalCardIds.slice(0,10);
const deckIds=[...normalIds.flatMap(id=>[id,id]),'54652250','31560081','14087893','28933734','12607053'];
assert.ok(deckIds.length>=20&&deckIds.length<=30,'fixture deck must respect the 20–30 main-deck rule');

function game(seed){
  return tag.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'Jogador '+i,cards:deckIds})),{seed,classic:true,first:0});
}
function held(s,seat){
  const team=seat%2;
  return s.active[team]===seat?s.core.players[team]:s.reserves[seat];
}
function take(s,seat,id){
  const h=held(s,seat);
  for(const zone of ['hand','deck']){
    const index=h[zone].findIndex(card=>card.id===id);
    if(index>=0)return h[zone].splice(index,1)[0];
  }
  throw new Error('Card '+id+' unavailable in physical seat '+seat);
}
function monster(card,team,faceUp=false){
  return {...card,owner:team,position:faceUp?'atk':'def',faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
}
function act(s,kind,predicate=()=>true){
  const actor=tag.tagDecisionMember(s).id;
  const action=tag.tagActions(s,actor).find(candidate=>candidate.kind===kind&&predicate(candidate));
  assert.ok(action,'Missing '+kind+' action for '+actor+' in '+s.core.phase);
  return tag.stepTagDuel(s,actor,action);
}
function passResponse(s){
  if(s.core.phase==='response')s=act(s,'pass');
  return s;
}
function record(s,id){
  return {id,guild:'guild-fixture',channel:'channel-fixture',message:'message-fixture',revision:7,updated:Date.now(),status:'playing',
    members:s.members.map(member=>({id:member.id,name:member.name,accepted:true})),state:s,rules:'classic-owned'};
}
function inventorySnapshot(s){
  return tag.tagInventory(s).map(card=>card.uid+':'+card.id).sort();
}
function assertInventoryConserved(s,before){
  const after=inventorySnapshot(s);
  assert.deepEqual(after,before,'2v2 FLIP resolution must conserve every physical UID and card ID');
  assert.equal(new Set(after).size,after.length,'UID/card-ID pairs must remain unique');
}

test('Man-Eater Bug resolves a FLIP destruction across teams and Discord hides the opposing set identity',()=>{
  let s=game('m428-man-eater');
  const source=take(s,2,'54652250');
  const target=take(s,3,normalIds[0]);
  const hidden=take(s,3,normalIds[1]);
  s.core.turn=3;
  s.core.players[0].monsters=[monster(source,0,false)];
  s.core.players[1].monsters=[monster(target,1,true),monster(hidden,1,false)];
  tag.assertTagDuel(s);
  const inventoryBefore=inventorySnapshot(s);
  const targetUid=target.uid,hiddenUid=hidden.uid,hiddenName=getCard(hidden.id).name;
  s=act(s,'position',action=>action.mode==='flip');
  s=passResponse(s);
  assert.equal(s.core.phase,'choice');
  s=act(s,'choose',action=>action.target===targetUid);
  s=passResponse(s);
  assert.notEqual(s.core.phase,'response');
  assert.ok(s.core.players[1].grave.some(card=>card.uid===targetUid),'destroyed target remains in the shared opposing GY with its physical UID');
  assert.ok(!s.core.players[1].monsters.some(card=>card.uid===targetUid));
  assert.ok(s.core.players[1].monsters.some(card=>card.uid===hiddenUid&&card.faceUp===false));
  assertInventoryConserved(s,inventoryBefore);

  const publicPayload=ui.tagPublicMessage(record(s,'m428-man-eater'));
  const p0Zones=ui.tagZonesMessage(record(s,'m428-man-eater'),'p0');
  const p3Zones=ui.tagZonesMessage(record(s,'m428-man-eater'),'p3');
  validateDiscordPayload(publicPayload);validateDiscordPayload(p0Zones);validateDiscordPayload(p3Zones);
  const publicText=JSON.stringify(publicPayload),p0ZoneText=JSON.stringify(p0Zones),p3ZoneText=JSON.stringify(p3Zones);
  assert.ok(!publicText.includes(hiddenName),'public field must not disclose an opposing face-down monster');
  assert.ok(!p0ZoneText.includes(hiddenName),'opposing team cannot inspect the set identity');
  assert.ok(p3ZoneText.includes(hiddenName),'a teammate can inspect its own team face-down card');
  assert.ok(!publicText.includes(hiddenUid));
});

test('Magician of Faith returns a shared-GY Spell to the active representative hand, not the inactive partner hand',()=>{
  let s=game('m428-magician-of-faith');
  const source=take(s,0,'31560081');
  const spell=take(s,0,'14087893');
  s.core.turn=3;
  s.core.players[0].monsters=[monster(source,0,false)];
  s.core.players[0].grave=[{...spell,owner:0}];
  // Remove any same-name copy from the inactive partner hand so the privacy
  // assertion can distinguish the physical seat's private projection.
  const partnerSpellCopies=s.reserves[2].hand.filter(card=>card.id===spell.id);
  s.reserves[2].hand=s.reserves[2].hand.filter(card=>card.id!==spell.id);
  s.reserves[2].deck.push(...partnerSpellCopies);
  tag.assertTagDuel(s);
  const inventoryBefore=inventorySnapshot(s);
  const spellUid=spell.uid,spellName=getCard(spell.id).name;
  s=act(s,'position',action=>action.mode==='flip');
  s=passResponse(s);
  assert.equal(s.core.phase,'choice');
  assert.deepEqual(s.core.choice.targets,[spellUid]);
  s=act(s,'choose',action=>action.target===spellUid);
  s=passResponse(s);
  assert.notEqual(s.core.phase,'response');
  assert.ok(tag.tagMemberHand(s,'p0').some(card=>card.uid===spellUid));
  assert.ok(!tag.tagMemberHand(s,'p2').some(card=>card.uid===spellUid));
  assertInventoryConserved(s,inventoryBefore);

  const r=record(s,'m428-magician-of-faith');
  const publicPayload=ui.tagPublicMessage(r);
  const p0Private=ui.tagPrivateMessage(r,'p0');
  const p2Private=ui.tagPrivateMessage(r,'p2');
  const p0Zones=ui.tagZonesMessage(r,'p0');
  for(const payload of [publicPayload,p0Private,p2Private,p0Zones])validateDiscordPayload(payload);
  const p0Text=JSON.stringify(p0Private),p2Text=JSON.stringify(p2Private),publicText=JSON.stringify(publicPayload);
  assert.ok(p0Text.includes(spellName),'active representative sees the recovered Spell in their own private hand');
  assert.ok(!p2Text.includes(spellName),'inactive partner cannot see the active representative private hand');
  assert.ok(!publicText.includes(spellUid),'public Discord panel never serializes physical card UIDs');
});

test('Mask of Darkness retrieves only a Trap from the shared GY into the active representative private hand',()=>{
  let s=game('m428-mask-of-darkness');
  const source=take(s,2,'28933734');
  const trap=take(s,0,'12607053');
  const spell=take(s,0,'14087893');
  s.core.turn=3;
  s.core.players[0].monsters=[monster(source,0,false)];
  s.core.players[0].grave=[{...trap,owner:0},{...spell,owner:0}];
  const partnerTrapCopies=s.reserves[2].hand.filter(card=>card.id===trap.id);
  s.reserves[2].hand=s.reserves[2].hand.filter(card=>card.id!==trap.id);
  s.reserves[2].deck.push(...partnerTrapCopies);
  tag.assertTagDuel(s);
  const inventoryBefore=inventorySnapshot(s);
  const trapUid=trap.uid,spellUid=spell.uid,trapName=getCard(trap.id).name;
  s=act(s,'position',action=>action.mode==='flip');
  s=passResponse(s);
  assert.equal(s.core.phase,'choice');
  assert.deepEqual(s.core.choice.targets,[trapUid]);
  s=act(s,'choose',action=>action.target===trapUid);
  s=passResponse(s);
  assert.notEqual(s.core.phase,'response');
  assert.ok(tag.tagMemberHand(s,'p0').some(card=>card.uid===trapUid));
  assert.ok(!tag.tagMemberHand(s,'p2').some(card=>card.uid===trapUid));
  assert.ok(s.core.players[0].grave.some(card=>card.uid===spellUid),'a Spell is not a legal Mask of Darkness target');
  assertInventoryConserved(s,inventoryBefore);
  const r=record(s,'m428-mask-of-darkness');
  const publicPayload=ui.tagPublicMessage(r),p0Private=ui.tagPrivateMessage(r,'p0'),p2Private=ui.tagPrivateMessage(r,'p2');
  for(const payload of [publicPayload,p0Private,p2Private])validateDiscordPayload(payload);
  assert.ok(JSON.stringify(p0Private).includes(trapName));
  assert.ok(!JSON.stringify(p2Private).includes(trapName));
});
