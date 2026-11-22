const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m410-dark-hole-'));
process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const {db,createPlayer}=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {RULES_PROFILE}=require('../dist/rulesProfile');
const {npcs}=require('../dist/npcContent');

const DARK_HOLE='53129443';
const MONSTERS_BY_SEAT=['74677422','46986414','89631139','44287299'];
const SPECIAL=new Set([DARK_HOLE,...MONSTERS_BY_SEAT]);
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
 const ids=['m410-p0','m410-p1','m410-p2','m410-p3'];
 ids.forEach(id=>createPlayer(id,id));
 const databaseBefore=snapshot();
 let r=store.createTagLobby(ids,'m410-guild','m410-channel','classic-loan');
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
 assert.equal(getPlayableCard(DARK_HOLE).kind,'spell');
 assert.equal(getCardStatus(DARK_HOLE).stage,'certified','Dark Hole is an existing certified card; this mission adds no new certification');
 for(const id of MONSTERS_BY_SEAT)assert.equal(getPlayableCard(id).kind,'monster');

 // Seat 1 (Yugi) is the first decision maker and owns the Dark Hole copy.
 const s=tag.createTagDuel(roster,{classic:true,seed:'m410-dark-hole',first:1});
 assert.deepEqual(s.active,[2,1]);
 assert.equal(tag.tagDecisionMember(s).id,ids[1]);
 s.core.turn=3;
 for(let seat=0;seat<4;seat++){
  const p=held(s,seat);
  const displaced=p.hand.filter(c=>SPECIAL.has(c.id));
  p.hand=p.hand.filter(c=>!SPECIAL.has(c.id));
  p.deck.push(...displaced);
 }
 const darkHole=take(s,1,DARK_HOLE);
 held(s,1).hand.push(darkHole);
 const monsters=MONSTERS_BY_SEAT.map((id,seat)=>{
  const ref=take(s,seat,id);
  return {...ref,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
 });
 s.core.players[0].monsters=[monsters[0],monsters[2]];
 s.core.players[1].monsters=[monsters[1],monsters[3]];
 assert.deepEqual(s.core.players.map(p=>p.monsters.length),[2,2]);
 assert.ok(s.core.players.every(p=>p.monsters.length<=RULES_PROFILE.monsterZones));
 tag.assertTagDuel(s);
 assert.equal(tag.tagInventory(s).length,120,'four Main Decks of 30 physical cards must be conserved');
 const inventoryBefore=inventoryMap(s),extraBefore=extraMap(s);
 const handsBefore=ids.map(id=>tag.tagMemberHand(s,id).map(c=>c.uid).sort());
 db.prepare('UPDATE tag_sessions SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 r=store.getTag(r.id);
 return {r,ids,darkHole,monsters,databaseBefore,inventoryBefore,extraBefore,handsBefore};
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
  id:'m410-request-'+(++request),
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

test('Dark Hole resolves through the Discord 2v2 handler and destroys monsters from all four physical seats',async()=>{
 const fixture=createPlaying();
 let r=fixture.r;
 const {ids,darkHole,monsters}=fixture;
 assert.equal(r.state.mode,'tag-classic');
 assert.equal(tag.tagDecisionMember(r.state).id,ids[1]);
 assert.ok(tag.tagMemberHand(r.state,ids[1]).some(c=>c.uid===darkHole.uid));
 assert.deepEqual(tag.tagActions(r.state,ids[3]),[],'the inactive teammate cannot act for the team');

 const publicBefore=ui.tagPublicMessage(r);
 validateDiscordPayload(publicBefore);
 const beforeText=JSON.stringify(publicBefore);
 for(const monster of monsters)assert.ok(beforeText.includes(monster.id),'face-up monsters should be represented publicly before Dark Hole');
 const privateBefore=ui.tagPrivateMessage(r,ids[1]);
 validateDiscordPayload(privateBefore);

 r=await dispatch(r,ids[1],a=>a.kind==='spell'&&a.card===darkHole.uid);
 for(let n=0;r.state.core.phase==='response';n++){
  assert.ok(n<8,'the response window must close');
  const actor=tag.tagDecisionMember(r.state).id;
  r=await dispatch(r,actor,a=>a.kind==='pass');
 }
 assert.equal(r.state.core.phase,'main');
 assert.deepEqual(r.state.core.players.map(p=>p.monsters.length),[0,0],'Dark Hole destroys monsters from both shared team fields');
 for(const [seat,monster] of monsters.entries()){
  const team=seat%2;
  assert.ok(r.state.core.players[team].grave.some(c=>c.uid===monster.uid&&c.id===monster.id),
   'the physical card from seat '+seat+' must reach its team Graveyard with UID/ID intact');
 }
 assert.ok(r.state.core.players[1].grave.some(c=>c.uid===darkHole.uid&&c.id===DARK_HOLE),
  'Dark Hole itself must resolve to its controller team Graveyard');
 assert.ok(r.state.core.log.some(line=>line.includes('Buraco Negro destruiu os monstros do campo.')));
 assert.deepEqual(inventoryMap(r.state),fixture.inventoryBefore,'all 120 physical card UIDs and identities must be conserved');
 assert.deepEqual(extraMap(r.state),fixture.extraBefore,'all four Extra Decks must remain unchanged');
 const handsAfter=ids.map(id=>tag.tagMemberHand(r.state,id).map(c=>c.uid).sort());
 assert.deepEqual(handsAfter[1],fixture.handsBefore[1].filter(uid=>uid!==darkHole.uid));
 for(const seat of [0,2,3])assert.deepEqual(handsAfter[seat],fixture.handsBefore[seat]);
 assert.equal(snapshot(),fixture.databaseBefore,'a borrowed 2v2 duel must not alter persistent player inventory');
 validateDiscordPayload(ui.tagPublicMessage(r));
 for(const id of ids)validateDiscordPayload(ui.tagPrivateMessage(r,id));
});
