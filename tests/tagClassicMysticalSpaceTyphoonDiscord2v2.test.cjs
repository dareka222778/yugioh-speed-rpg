const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m409-mst-'));
process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const {db,createPlayer}=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {getCard}=require('../dist/collection');
const {RULES_PROFILE}=require('../dist/rulesProfile');
const {npcs}=require('../dist/npcContent');

const MST='05318639';
const BACKROW_BY_SEAT=['55144522','77414722','56120475','14087893'];
const SPECIAL=new Set([MST,...BACKROW_BY_SEAT]);
let request=0;

function snapshot(){
 return JSON.stringify({
  players:db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
  cards:db.prepare('SELECT * FROM player_cards').all()
 });
}
function held(s,seat){return seat<2?s.core.players[seat]:s.reserves[seat];}
function take(s,seat,id){
 const p=held(s,seat);
 for(const zone of ['hand','deck']){
  const index=p[zone].findIndex(c=>c.id===id);
  if(index>=0)return p[zone].splice(index,1)[0];
 }
 throw Error('Fixture não encontrou '+id+' no assento '+seat);
}
function inventoryMap(s){
 return tag.tagInventory(s).map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function extraMap(s){
 return [s.core.players[0].extra??[],s.core.players[1].extra??[],s.reserves[2].extra??[],s.reserves[3].extra??[]]
  .flat().map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function createPlaying(){
 const ids=['m409-p0','m409-p1','m409-p2','m409-p3'];
 ids.forEach(id=>createPlayer(id,id));
 const databaseBefore=snapshot();
 let r=store.createTagLobby(ids,'m409-guild','m409-channel','classic-loan');
 for(const member of r.members.filter(p=>!p.accepted))r=store.acceptTag(r.id,member.id,r.guild,r.revision);
 assert.equal(r.status,'playing');

 const roster=r.members.map((member,i)=>({
  id:member.id,
  name:member.name,
  cards:[...npcs[i%3].cards],
  extra:[...(npcs[i%3].extra??[])]
 }));
 assert.ok(roster.every(p=>p.cards.length>=RULES_PROFILE.mainDeckMin&&p.cards.length<=RULES_PROFILE.mainDeckMax));
 assert.ok(roster.every(p=>p.extra.length<=RULES_PROFILE.extraDeckMax));
 assert.ok(getPlayableCard(MST));
 assert.equal(getPlayableCard(MST).kind,'spell');
 assert.equal(getCardStatus(MST).stage,'certified','MST is an existing certified card; this mission adds no new certification');

 const s=tag.createTagDuel(roster,{classic:true,seed:'m409-mystical-space-typhoon',first:0});
 assert.equal(s.core.rulesVersion,RULES_PROFILE.id);
 assert.equal(RULES_PROFILE.mainDeckMin,20);
 assert.equal(RULES_PROFILE.mainDeckMax,30);
 assert.equal(RULES_PROFILE.extraDeckMax,5);
 assert.equal(RULES_PROFILE.monsterZones,3);
 assert.equal(RULES_PROFILE.spellTrapZones,3);
 assert.equal(RULES_PROFILE.handLimit,6);
 assert.equal(RULES_PROFILE.handCheck,'end');
 s.core.turn=3;

 // Move every fixture target out of opening hands before placing one physical
 // copy per seat. The Main Deck inventory remains exactly four 30-card decks.
 for(let seat=0;seat<4;seat++){
  const p=held(s,seat);
  const displaced=p.hand.filter(c=>SPECIAL.has(c.id));
  p.hand=p.hand.filter(c=>!SPECIAL.has(c.id));
  p.deck.push(...displaced);
 }
 const mst=take(s,0,MST);
 held(s,0).hand.push(mst);
 const backrow=BACKROW_BY_SEAT.map((id,seat)=>{
  const card=take(s,seat,id);
  card.setTurn=0;
  card.faceUp=false;
  return card;
 });
 s.core.players[0].backrow=[backrow[0],backrow[2]];
 s.core.players[1].backrow=[backrow[1],backrow[3]];
 assert.deepEqual(s.core.players.map(p=>p.backrow.length),[2,2]);
 assert.ok(s.core.players.every(p=>p.backrow.length<=RULES_PROFILE.spellTrapZones));
 tag.assertTagDuel(s);
 assert.equal(tag.tagInventory(s).length,120,'four Main Decks of 30 physical cards must be conserved');
 const inventoryBefore=inventoryMap(s),extraBefore=extraMap(s);
 const handsBefore=ids.map(id=>tag.tagMemberHand(s,id).map(c=>c.uid).sort());
 db.prepare('UPDATE tag_sessions SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 r=store.getTag(r.id);
 return {r,ids,mst,backrow,databaseBefore,inventoryBefore,extraBefore,handsBefore};
}

async function dispatch(r,actor,predicate){
 const current=store.getTag(r.id);
 const actions=tag.tagActions(current.state,actor);
 const index=actions.findIndex(predicate);
 assert.ok(index>=0,'Nenhuma ação legal correspondente para '+actor+' em '+current.state.core.phase);
 let acknowledged=false,edited=false,refreshed=false;
 await handleTagComponent({
  guildId:current.guild,
  user:{id:actor},
  id:'m409-request-'+(++request),
  customId:'tag:act:'+current.id+':'+current.revision+':'+actor,
  values:[String(index)],
  deferUpdate:async()=>{
   acknowledged=true;
   assert.equal(store.getTag(current.id).revision,current.revision,'Discord deve reconhecer antes de mutar o estado');
  },
  editReply:async payload=>{edited=true;validateDiscordPayload(payload);}
 },async latest=>{
  refreshed=true;
  validateDiscordPayload(ui.tagPublicMessage(latest));
 },kind=>assert.equal(kind,'update'));
 assert.ok(acknowledged&&edited&&refreshed,'a interação deve reconhecer, atualizar o painel privado e republicar o campo');
 const next=store.getTag(r.id);
 assert.equal(next.revision,current.revision+1);
 return next;
}

after(()=>{
 db.close();
 fs.rmSync(folder,{recursive:true,force:true});
});

test('Mystical Space Typhoon resolves through the Discord 2v2 handler and destroys exactly one hidden Spell/Trap in the shared field',async()=>{
 const fixture=createPlaying();
 let r=fixture.r;
 const {ids,mst,backrow}=fixture;
 const ownTeamTarget=backrow[2];
 const opposingTarget=backrow[3];
 assert.equal(r.state.mode,'tag-classic');
 assert.deepEqual(r.state.active,[0,1]);
 assert.equal(tag.tagDecisionMember(r.state).id,ids[0]);
 assert.ok(tag.tagMemberHand(r.state,ids[0]).some(c=>c.uid===mst.uid));

 // The active player may target either team's shared backrow. The inactive
 // partner cannot submit the action, and the set target's identity stays hidden.
 const legalTargets=tag.tagActions(r.state,ids[0])
  .filter(a=>a.kind==='spell'&&a.card===mst.uid)
  .map(a=>a.target);
 assert.ok(legalTargets.includes(ownTeamTarget.uid),'MST may target a teammate-owned set card in the shared field');
 assert.ok(legalTargets.includes(opposingTarget.uid),'MST may target an opponent-owned set card in the shared field');
 assert.deepEqual(tag.tagActions(r.state,ids[2]),[],'the inactive teammate cannot act for the team');
 const publicBefore=ui.tagPublicMessage(r);
 validateDiscordPayload(publicBefore);
 const publicText=JSON.stringify(publicBefore);
 assert.ok(!publicText.includes(opposingTarget.uid),'public panel must not expose the hidden UID');
 assert.ok(!publicText.includes(opposingTarget.id),'public panel must not expose the hidden card ID');
 assert.ok(!publicText.includes(getCard(opposingTarget.id).name),'public panel must not reveal the set card name');
 const privateBefore=ui.tagPrivateMessage(r,ids[0]);
 validateDiscordPayload(privateBefore);
 assert.ok(!JSON.stringify(privateBefore).includes(getCard(opposingTarget.id).name),'the active player's private hand panel must not reveal a rival set card');

 const revisionBefore=store.getTag(r.id).revision;
 await assert.rejects(handleTagComponent({
  guildId:r.guild,user:{id:ids[2]},id:'m409-inactive-attempt',
  customId:'tag:act:'+r.id+':'+r.revision+':'+ids[2],values:['0'],
  deferUpdate:async()=>{},editReply:async()=>{throw Error('parceiro inativo não pode agir');}
 },async()=>{},()=>{}));
 assert.equal(store.getTag(r.id).revision,revisionBefore,'an inactive partner attempt must not mutate the duel');

 // Activate from the physical owner's hand through handleTagComponent, not
 // by calling stepTagDuel directly. The target belongs to seat 3, not seat 1.
 r=await dispatch(r,ids[0],a=>a.kind==='spell'&&a.card===mst.uid&&a.target===opposingTarget.uid);
 for(let n=0;r.state.core.phase==='response';n++){
  assert.ok(n<8,'the response window must close');
  const actor=tag.tagDecisionMember(r.state).id;
  r=await dispatch(r,actor,a=>a.kind==='pass');
 }
 assert.equal(r.state.core.phase,'main');
 assert.ok(r.state.core.players[1].grave.some(c=>c.uid===opposingTarget.uid&&c.id===opposingTarget.id),
  'the exact targeted card must enter the opposing team's shared Graveyard');
 assert.ok(!r.state.core.players[1].backrow.some(c=>c.uid===opposingTarget.uid));
 assert.ok(r.state.core.players[1].backrow.some(c=>c.uid===backrow[1].uid),'the other opposing set card must remain');
 assert.ok(r.state.core.players[0].backrow.some(c=>c.uid===backrow[0].uid));
 assert.ok(r.state.core.players[0].backrow.some(c=>c.uid===ownTeamTarget.uid));
 assert.ok(r.state.core.players[0].grave.some(c=>c.uid===mst.uid&&c.id===MST),
  'the resolving Quick-Play Spell itself must enter its controller team Graveyard');
 assert.ok(r.state.core.log.some(line=>line.includes('sem negar sua ativação')),
  'destroying a Spell/Trap must not be reported as negating its activation');

 const handsAfter=ids.map(id=>tag.tagMemberHand(r.state,id).map(c=>c.uid).sort());
 assert.deepEqual(handsAfter[0],fixture.handsBefore[0].filter(uid=>uid!==mst.uid));
 for(let seat=1;seat<4;seat++)assert.deepEqual(handsAfter[seat],fixture.handsBefore[seat]);
 assert.deepEqual(inventoryMap(r.state),fixture.inventoryBefore,'all physical card UIDs and identities must be conserved');
 assert.deepEqual(extraMap(r.state),fixture.extraBefore,'each participant Extra Deck must remain private and unchanged');
 assert.equal(snapshot(),fixture.databaseBefore,'a borrowed 2v2 duel must not alter persistent player inventory');
 validateDiscordPayload(ui.tagPublicMessage(r));
 for(const id of ids)validateDiscordPayload(ui.tagPrivateMessage(r,id));
});
