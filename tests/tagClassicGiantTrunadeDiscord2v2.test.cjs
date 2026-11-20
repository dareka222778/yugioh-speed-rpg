const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m408-giant-trunade-'));
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

const TRUNADE='42703248';
const BACKROW=['55144522','44095762','77414722','14087893'];
const SPECIAL=new Set([TRUNADE,...BACKROW]);
let request=0;

function snapshot(){
 return JSON.stringify({
  players:db.prepare('SELECT * FROM players ORDER BY discord_id').all(),
  cards:db.prepare('SELECT * FROM player_cards ORDER BY owner,card_key').all()
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
 const ids=['m408-p0','m408-p1','m408-p2','m408-p3'];
 ids.forEach(id=>createPlayer(id,id));
 const databaseBefore=snapshot();
 let r=store.createTagLobby(ids,'m408-guild','m408-channel','classic-loan');
 for(const member of r.members.filter(p=>!p.accepted))r=store.acceptTag(r.id,member.id,r.guild,r.revision);
 assert.equal(r.status,'playing');

 const roster=r.members.map((member,i)=>{
  const cards=npcs[i%3].cards.filter(id=>id!==TRUNADE);
  if(i===0)cards[0]=TRUNADE;
  return {id:member.id,name:member.name,cards,extra:[...(npcs[i%3].extra??[])]};
 });
 assert.ok(roster.every(p=>p.cards.length>=RULES_PROFILE.mainDeckMin&&p.cards.length<=RULES_PROFILE.mainDeckMax));
 assert.ok(roster.every(p=>p.extra.length<=RULES_PROFILE.extraDeckMax));
 assert.ok(!npcs[0].cards.includes(TRUNADE),'Giant Trunade must be added exactly once to the fixture deck');

 const s=tag.createTagDuel(roster,{classic:true,seed:'m408-giant-trunade-discord',first:0});
 assert.equal(s.core.rulesVersion,RULES_PROFILE.id,'new 2v2 sessions must use the current six-card rules, not legacy v2');
 assert.equal(RULES_PROFILE.handLimit,6);
 assert.equal(RULES_PROFILE.monsterZones,3);
 assert.equal(RULES_PROFILE.spellTrapZones,3);
 assert.equal(RULES_PROFILE.extraDeckMax,5);
 s.core.turn=3;

 // Move every special card out of all opening hands first. This prevents a
 // second copy in another seat's private hand from masking an ownership leak.
 for(let seat=0;seat<4;seat++){
  const p=held(s,seat);
  const displaced=p.hand.filter(c=>SPECIAL.has(c.id));
  p.hand=p.hand.filter(c=>!SPECIAL.has(c.id));
  p.deck.push(...displaced);
 }
 const returnedBySeat=[[],[],[],[]];
 returnedBySeat[0].push(take(s,0,TRUNADE),take(s,0,BACKROW[0]));
 returnedBySeat[1].push(take(s,1,BACKROW[1]));
 returnedBySeat[2].push(take(s,2,BACKROW[2]));
 returnedBySeat[3].push(take(s,3,BACKROW[3]));
 for(const cards of returnedBySeat)for(const card of cards){card.setTurn=0;card.faceUp=false;}

 // Team fields are shared, but each card retains the UID of its physical owner.
 s.core.players[0].backrow=[...returnedBySeat[0],...returnedBySeat[2]];
 s.core.players[1].backrow=[...returnedBySeat[1],...returnedBySeat[3]];
 assert.equal(s.core.players[0].backrow.length,3);
 assert.equal(s.core.players[1].backrow.length,2);
 assert.ok(s.core.players.every(p=>p.backrow.length<=RULES_PROFILE.spellTrapZones));

 // Giant Trunade returns two cards to seat 0 (itself plus its teammate's
 // other set card); each other physical seat receives one. All become seven
 // during Main Phase and must wait until End Phase to discard to six.
 const targets=[5,6,6,6];
 for(let seat=0;seat<4;seat++){
  const p=held(s,seat);
  while(p.hand.length<targets[seat]){
   const index=p.deck.findIndex(c=>!SPECIAL.has(c.id));
   assert.notEqual(index,-1);
   p.hand.push(p.deck.splice(index,1)[0]);
  }
  assert.equal(p.hand.length,targets[seat]);
 }
 tag.assertTagDuel(s);
 assert.equal(tag.tagInventory(s).length,120,'four 30-card Main Decks must conserve all 120 physical cards');
 const inventoryBefore=inventoryMap(s),extraBefore=extraMap(s);
 db.prepare('UPDATE tag_sessions SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 r=store.getTag(r.id);
 return {r,ids,databaseBefore,returnedBySeat,inventoryBefore,extraBefore};
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
  id:'m408-request-'+(++request),
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

test('Giant Trunade resolves through Discord 2v2, returns all five set cards to physical owners, then End Phase discards every hand from seven to six',async()=>{
 const fixture=createPlaying();
 let r=fixture.r;
 const ids=fixture.ids;
 const returnedBySeat=fixture.returnedBySeat;
 const trunadeUid=returnedBySeat[0][0].uid;
 assert.equal(r.state.mode,'tag-classic');
 assert.deepEqual(r.state.active,[0,1]);
 assert.equal(tag.tagDecisionMember(r.state).id,ids[0]);
 assert.deepEqual(ids.map(id=>tag.tagMemberHand(r.state,id).length),[5,6,6,6]);
 assert.ok(getPlayableCard(TRUNADE));
 assert.equal(getPlayableCard(TRUNADE).kind,'spell');
 assert.equal(getCardStatus(TRUNADE).stage,'certified');

 // The inactive partner owns a set card but cannot submit the team's action.
 assert.deepEqual(tag.tagActions(r.state,ids[2]),[]);
 const revisionBefore=store.getTag(r.id).revision;
 await assert.rejects(handleTagComponent({
  guildId:r.guild,user:{id:ids[2]},id:'m408-inactive-attempt',
  customId:'tag:act:'+r.id+':'+r.revision+':'+ids[2],values:['0'],
  deferUpdate:async()=>{},editReply:async()=>{throw Error('parceiro inativo não pode agir');}
 },async()=>{},()=>{}));
 assert.equal(store.getTag(r.id).revision,revisionBefore,'a tentativa do parceiro inativo não pode alterar o duelo');

 // Activate the set Giant Trunade through the same component handler used by Discord.
 r=await dispatch(r,ids[0],a=>a.kind==='spell'&&a.card===trunadeUid);
 for(let n=0;r.state.core.phase==='response';n++){
  assert.ok(n<8,'a janela de resposta precisa terminar');
  const actor=tag.tagDecisionMember(r.state).id;
  r=await dispatch(r,actor,a=>a.kind==='pass');
 }
 assert.equal(r.state.core.phase,'main','o efeito termina antes da Fase Final; não há descarte antecipado');
 assert.deepEqual(ids.map(id=>tag.tagMemberHand(r.state,id).length),[7,7,7,7]);

 for(let seat=0;seat<4;seat++){
  const hand=tag.tagMemberHand(r.state,ids[seat]);
  for(const card of returnedBySeat[seat])assert.ok(hand.some(c=>c.uid===card.uid),'a carta deve voltar à mão do proprietário físico '+seat);
  for(let other=0;other<4;other++)if(other!==seat){
   const otherHand=tag.tagMemberHand(r.state,ids[other]);
   for(const card of returnedBySeat[seat])assert.ok(!otherHand.some(c=>c.uid===card.uid),'a carta não pode migrar para outro assento');
  }
 }
 assert.equal(r.state.core.players[0].backrow.length,0);
 assert.equal(r.state.core.players[1].backrow.length,0);

 const publicBeforeEnd=ui.tagPublicMessage(r);
 validateDiscordPayload(publicBeforeEnd);
 const publicBeforeText=JSON.stringify(publicBeforeEnd);
 for(const card of returnedBySeat.flat())assert.ok(!publicBeforeText.includes(card.uid),'o painel público não deve expor UIDs privados');
 const handCountsBeforeEnd=publicBeforeEnd.embeds[0].toJSON().fields.find(f=>f.name==='Mãos e baralhos').value;
 assert.equal((handCountsBeforeEnd.match(/7 na mão/g)||[]).length,4);
 for(let seat=0;seat<4;seat++){
  const privatePanel=ui.tagPrivateMessage(r,ids[seat]);
  validateDiscordPayload(privatePanel);
  const text=JSON.stringify(privatePanel.embeds[0].toJSON());
  for(const card of returnedBySeat[seat])assert.ok(text.includes(getCard(card.id).name),'o proprietário deve ver sua carta devolvida');
  for(let other=0;other<4;other++)if(other!==seat)for(const card of returnedBySeat[other])assert.ok(!text.includes(getCard(card.id).name),'a mão de outro assento não pode aparecer no painel privado');
 }

 // Current rules check the hand limit at End Phase, not immediately on return.
 r=await dispatch(r,ids[0],a=>a.kind==='end');
 for(let n=0;r.state.core.phase==='response';n++){
  assert.ok(n<8);
  const actor=tag.tagDecisionMember(r.state).id;
  r=await dispatch(r,actor,a=>a.kind==='pass');
 }
 assert.equal(r.state.core.phase,'discard');
 const discardOrder=[];
 while(r.state.core.phase==='discard'){
  const actor=tag.tagDecisionMember(r.state).id;
  const seat=ids.indexOf(actor);
  assert.ok(seat>=0);
  assert.equal(tag.tagMemberHand(r.state,actor).length,7,'cada proprietário descarta somente na própria janela da Fase Final');
  discardOrder.push(seat);
  r=await dispatch(r,actor,a=>a.kind==='discard');
 }
 assert.deepEqual(discardOrder,[0,1,2,3]);
 assert.deepEqual(ids.map(id=>tag.tagMemberHand(r.state,id).length),[6,6,6,6]);
 assert.equal(r.state.core.phase,'main');
 assert.deepEqual(inventoryMap(r.state),fixture.inventoryBefore,'nenhum UID ou identidade física pode ser criado, perdido ou trocado');
 assert.deepEqual(extraMap(r.state),fixture.extraBefore,'o Adicional individual permanece intacto');
 assert.equal(snapshot(),fixture.databaseBefore,'duelo emprestado não altera coleção nem inventário persistente');
 const publicAfterEnd=ui.tagPublicMessage(r);
 validateDiscordPayload(publicAfterEnd);
 const handCountsAfterEnd=publicAfterEnd.embeds[0].toJSON().fields.find(f=>f.name==='Mãos e baralhos').value;
 assert.equal((handCountsAfterEnd.match(/6 na mão/g)||[]).length,4);
});
