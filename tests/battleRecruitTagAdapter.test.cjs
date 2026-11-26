const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTagDuel,tagInventory,assertTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {sendMonsterToGrave}=require('../dist/monsterExit');
const {createBattleRecruitAdapter,assertBattleRecruitRules,GIANT_RAT_ID,GIANT_GERM_ID,NIMBLE_MOMONGA_ID}=require('../dist/battleRecruitTagAdapter');

function unique(kind,predicate,count=100){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);
  if(!card||card.kind!==kind||card.fusion||!predicate(card))return false;
  const name=card.englishName||card.name;
  if(seen.has(name))return false;
  seen.add(name);return true;
 }).slice(0,count);
}
const normal=unique('monster',card=>card.monsterType==='normal'&&Number.isFinite(card.atk));
const ratFixture=normal.find(card=>card.atk>1500&&card.attribute!=='EARTH');
const germFixture=normal.find(card=>card.atk<=1000&&card.id!==ratFixture?.id);
const momongaFixture=normal.find(card=>card.atk<=1000&&card.id!==ratFixture?.id&&card.id!==germFixture?.id);
const fixtureIds=new Set([ratFixture?.id,germFixture?.id,momongaFixture?.id]);
const earthLow=normal.filter(card=>card.attribute==='EARTH'&&card.atk<=1500&&!fixtureIds.has(card.id)).slice(0,4);
const nonEarthLow=normal.find(card=>card.attribute!=='EARTH'&&card.atk<=1500&&!fixtureIds.has(card.id)&&!earthLow.some(x=>x.id===card.id));
const earthHigh=normal.find(card=>card.attribute==='EARTH'&&card.atk>1500&&!fixtureIds.has(card.id)&&!earthLow.some(x=>x.id===card.id));
const highNonEarth=normal.find(card=>card.attribute!=='EARTH'&&card.atk>1500&&!fixtureIds.has(card.id)&&card.id!==ratFixture?.id);
const spellIds=unique('spell',()=>true,3),trapIds=unique('trap',()=>true,3);
assert.ok(ratFixture&&germFixture&&momongaFixture);
assert.ok(earthLow.length>=4&&nonEarthLow&&earthHigh&&highNonEarth);
assert.equal(spellIds.length,3);assert.equal(trapIds.length,3);
const deck=[
 ratFixture.id,germFixture.id,germFixture.id,germFixture.id,
 momongaFixture.id,momongaFixture.id,momongaFixture.id,
 ...earthLow.map(card=>card.id),nonEarthLow.id,earthHigh.id,highNonEarth.id,
 ...spellIds.map(card=>card.id),...trapIds.map(card=>card.id)
];
assert.equal(deck.length,20);
const fixtureEffects=new Map([
 [ratFixture.id,'giant-rat'],[germFixture.id,'giant-germ'],[momongaFixture.id,'nimble-momonga']
]);
function lookup(id){const effect=fixtureEffects.get(id);return effect?{kind:'monster',effect}:undefined;}
const adapter=createBattleRecruitAdapter(lookup);
let scenarioCount=0,completed=0,inventoryConservationChecks=0;
function scenario(name,fn){scenarioCount++;test(name,()=>{fn();completed++;});}
function setup(seed='m659-battle-recruiters'){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));
 const duel=createTagDuel(players,{classic:true,first:0,seed});
 const session=adapter.createSession(duel);
 return {session,adapter};
}
function holder(session,seat){
 const team=seat%2;
 return seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
}
function take(session,seat,id){
 const source=holder(session,seat);
 for(const zone of ['hand','deck','extra']){
  const list=source[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id+' seat '+seat);
}
function deploy(session,seat,id){
 const team=seat%2,ref=take(session,seat,id),turn=session.duel.core.turn;
 const monster={...ref,owner:team,position:'atk',faceUp:true,entered:turn-1,changed:turn-1,attacked:0,atkBoost:0,defBoost:0};
 session.duel.core.players[team].monsters.push(monster);
 assertTagDuel(session.duel);
 return monster;
}
function ensureCopiesInDeck(session,seat,id,count){
 const source=holder(session,seat);
 while(source.deck.filter(card=>card.id===id).length<count){
  const index=source.hand.findIndex(card=>card.id===id);
  if(index<0)break;
  source.deck.push(source.hand.splice(index,1)[0]);
 }
 return source.deck.filter(card=>card.id===id);
}
function ensureEarthTarget(session,seat,predicate=card=>card.attribute==='EARTH'&&card.atk<=1500){
 const source=holder(session,seat);
 let found=source.deck.find(ref=>{const card=engineCard(ref.id);return card&&predicate(card);});
 if(!found){
  const index=source.hand.findIndex(ref=>{const card=engineCard(ref.id);return card&&predicate(card);});
  if(index>=0){found=source.hand.splice(index,1)[0];source.deck.push(found);}
 }
 assert.ok(found,'eligible Earth target is in the active physical deck');
 return found;
}
function sourceFor(session,effect,seat=1){
 const id=effect==='giant-rat'?ratFixture.id:effect==='giant-germ'?germFixture.id:momongaFixture.id;
 return deploy(session,seat,id);
}
function receiptFor(session,source,battleId='battle-1',overrides={}){
 const seat=Number(/^m([0-3]):/.exec(source.uid)?.[1]);
 const team=seat%2;
 return {battleId,sourceUid:source.uid,controllerTeam:team,actorSeat:session.duel.active[team],
  turn:session.duel.core.turn,destroyedByBattle:true,sentToGrave:true,sourceWasBattleParticipant:true,...overrides};
}
function prepare(session,effect,seat=1,battleId='battle-1',activationId='activation-1'){
 const source=sourceFor(session,effect,seat);
 assert.equal(sendMonsterToGrave(session.duel.core,source.uid,true,'destroy'),true);
 assertTagDuel(session.duel);
 const receipt=receiptFor(session,source,battleId);
 const plan=adapter.prepareBattleRecruit(session,receipt,activationId);
 return {source,receipt,plan};
}
function inventory(session){
 return new Map(tagInventory(session.duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function hands(session){
 const all=[];
 for(const player of session.duel.core.players)for(const card of player.hand)all.push(card.uid);
 for(const held of Object.values(session.duel.reserves))for(const card of held.hand)all.push(card.uid);
 return all.sort();
}
function assertConserved(before,beforeHands,session){
 assert.deepEqual([...inventory(session).entries()].sort(),[...before.entries()].sort());
 assert.deepEqual(hands(session),beforeHands);
 inventoryConservationChecks++;
}
function safeResolve(session,activationId,selectedUids=[],negated=false){
 const before=inventory(session),beforeHands=hands(session);
 const result=adapter.resolveBattleRecruit(session,activationId,selectedUids,negated);
 assertConserved(before,beforeHands,session);
 return result;
}
function catalogSnapshot(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9/manifest.json'),'utf8'));
 const revision=manifest.revisions.find(item=>item.id===manifest.current);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9',revision.file),'utf8'));
 return {count:catalog.cards.length,ids:new Set(catalog.cards.map(card=>card.id)),revision:manifest.current};
}
function fillTeam(session,team,ids){
 for(const id of ids)deploy(session,session.duel.active[team],id);
}

scenario('baseline: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5',()=>{
 const {session}=setup();assertBattleRecruitRules(session.duel);assertTagDuel(session.duel);
 const rules=require('../dist/rulesProfile').rulesFor(session.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.extraDeckMax,5);
});
scenario('recusa evento que não foi destruição por batalha',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat');
 const receipt=receiptFor(session,source,'b1',{destroyedByBattle:false});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/Recibo/);
});
scenario('recusa evento em que a carta não foi enviada ao Cemitério',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat');
 const receipt=receiptFor(session,source,'b1',{sentToGrave:false});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/Recibo/);
});
scenario('recusa recibo sem prova de participação na batalha',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat');
 const receipt=receiptFor(session,source,'b1',{sourceWasBattleParticipant:false});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/Recibo/);
});
scenario('recusa fonte que ainda não está no Cemitério físico da equipe proprietária',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat');
 assert.throws(()=>adapter.prepareBattleRecruit(session,receiptFor(session,source),'a1'),/Cemitério/);
});
scenario('recusa equipe controladora incompatível com o proprietário físico',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat',2);
 sendMonsterToGrave(session.duel.core,source.uid,true,'destroy');
 const receipt=receiptFor(session,source,'b1',{controllerTeam:1,actorSeat:1});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/proprietário físico/);
});
scenario('recusa assento inativo como autor do gatilho',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat',1);
 sendMonsterToGrave(session.duel.core,source.uid,true,'destroy');
 const receipt=receiptFor(session,source,'b1',{actorSeat:3});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/membro ativo/);
});
scenario('recusa recibo de turno anterior',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat',1);
 sendMonsterToGrave(session.duel.core,source.uid,true,'destroy');
 const receipt=receiptFor(session,source,'b1',{turn:session.duel.core.turn-1});
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'a1'),/Recibo/);
});
scenario('não reutiliza ID de ativação',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat',1);
 sendMonsterToGrave(session.duel.core,source.uid,true,'destroy');
 const receipt=receiptFor(session,source);
 adapter.prepareBattleRecruit(session,receipt,'same-id');
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'same-id'),/reutilizado/);
});
scenario('uma mesma fonte não gera dois gatilhos na mesma batalha',()=>{
 const {session}=setup(),source=sourceFor(session,'giant-rat',1);
 sendMonsterToGrave(session.duel.core,source.uid,true,'destroy');
 const receipt=receiptFor(session,source,'same-battle');
 adapter.prepareBattleRecruit(session,receipt,'first');
 assert.throws(()=>adapter.prepareBattleRecruit(session,receipt,'second'),/já gerou/);
});
scenario('Giant Rat Invoca um EARTH com ATK até 1500 do Deck ativo em Ataque',()=>{
 const {session}=setup(),{source,plan}=prepare(session,'giant-rat',1,'rat-success','rat-success');
 const target=ensureEarthTarget(session,1);
 const before=inventory(session),beforeHands=hands(session);
 const result=safeResolve(session,plan.activationId,[target.uid]);
 assert.equal(result.status,'summoned');assert.deepEqual(result.summonedUids,[target.uid]);
 const monster=session.duel.core.players[1].monsters.find(card=>card.uid===target.uid);
 assert.ok(monster);assert.equal(monster.position,'atk');assert.equal(monster.faceUp,true);
 assert.equal(monster.uid,target.uid);assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===source.uid));
 assertConserved(before,beforeHands,session);
});
scenario('Giant Rat recusa monstro que não seja EARTH',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-non-earth','rat-non-earth');
 const target=ensureCopiesInDeck(session,1,nonEarthLow.id,1)[0];
 assert.ok(target);
 assert.throws(()=>safeResolve(session,plan.activationId,[target.uid]),/EARTH/);
});
scenario('Giant Rat recusa EARTH com ATK acima de 1500',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-high-earth','rat-high-earth');
 const target=ensureCopiesInDeck(session,1,earthHigh.id,1)[0];
 assert.ok(target);
 assert.throws(()=>safeResolve(session,plan.activationId,[target.uid]),/1500/);
});
scenario('Giant Rat não pode Invocar mais de um monstro',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-two','rat-two');
 const targets=[ensureCopiesInDeck(session,1,earthLow[0].id,1)[0],ensureCopiesInDeck(session,1,earthLow[1].id,1)[0]];
 assert.equal(targets.length,2);
 assert.throws(()=>safeResolve(session,plan.activationId,targets.map(card=>card.uid)),/apenas um/);
});
scenario('Giant Rat resolve opcionalmente sem Invocar',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-skip','rat-skip');
 const result=safeResolve(session,plan.activationId,[]);
 assert.equal(result.status,'no-summon');assert.equal(result.summonedUids.length,0);
});
scenario('Giant Rat só consulta o Deck do assento ativo, nunca a reserva do parceiro',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-private','rat-private');
 ensureCopiesInDeck(session,3,earthLow[0].id,1);
 const active=holder(session,1),reserve=holder(session,3);
 for(const ref of [...active.deck])if(engineCard(ref.id)?.attribute==='EARTH'&&engineCard(ref.id)?.atk<=1500){
  active.deck.splice(active.deck.indexOf(ref),1);active.hand.push(ref);
 }
 const reserveTarget=reserve.deck.find(ref=>engineCard(ref.id)?.attribute==='EARTH'&&engineCard(ref.id)?.atk<=1500);
 assert.ok(reserveTarget);
 assert.throws(()=>safeResolve(session,plan.activationId,[reserveTarget.uid]),/Deck ativo/);
});
scenario('Giant Rat não excede três Monster Zones',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-full','rat-full');
 fillTeam(session,1,[earthLow[0].id,earthLow[1].id,earthLow[2].id]);
 assert.throws(()=>safeResolve(session,plan.activationId,[ensureEarthTarget(session,1).uid]),/Monster Zones/);
});
scenario('Giant Rat recusa UID que não está no Deck ativo',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-forged','rat-forged');
 assert.throws(()=>safeResolve(session,plan.activationId,['m1:forged']),/Deck ativo/);
});
scenario('Giant Germ causa 500 de dano e Invoca múltiplas cópias em Ataque',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-multiple','germ-multiple');
 const copies=ensureCopiesInDeck(session,1,germFixture.id,2);assert.equal(copies.length,2);
 const before=inventory(session),beforeHands=hands(session),lp=session.duel.core.players[0].lp;
 const result=safeResolve(session,plan.activationId,copies.map(card=>card.uid));
 assert.equal(result.damage,500);assert.equal(result.status,'summoned');assert.equal(session.duel.core.players[0].lp,lp-500);
 assert.equal(result.summonedUids.length,2);
 for(const uid of result.summonedUids){const monster=session.duel.core.players[1].monsters.find(card=>card.uid===uid);assert.ok(monster);assert.equal(monster.position,'atk');assert.equal(monster.faceUp,true);}
 assertConserved(before,beforeHands,session);
});
scenario('Giant Germ causa dano mesmo sem recrutar cópias',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-zero','germ-zero');
 const lp=session.duel.core.players[0].lp,result=safeResolve(session,plan.activationId,[]);
 assert.equal(result.damage,500);assert.equal(session.duel.core.players[0].lp,lp-500);
 assert.equal(result.status,'no-summon');assert.equal(result.summonedUids.length,0);
});
scenario('Giant Germ recusa cartas de outro nome',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-foreign','germ-foreign');
 const target=ensureCopiesInDeck(session,1,earthLow[0].id,1)[0];
 assert.throws(()=>safeResolve(session,plan.activationId,[target.uid]),/nome exigido/);
});
scenario('Giant Germ respeita a capacidade 3+3 do campo',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-full','germ-full');
 fillTeam(session,1,[earthLow[0].id,earthLow[1].id,earthLow[2].id]);
 const copies=ensureCopiesInDeck(session,1,germFixture.id,1);
 assert.ok(copies.length);
 assert.throws(()=>safeResolve(session,plan.activationId,[copies[0].uid]),/Monster Zones/);
});
scenario('Giant Germ encerra o duelo por dano letal antes de Invocar',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-lethal','germ-lethal');
 session.duel.core.players[0].lp=500;
 const copies=ensureCopiesInDeck(session,1,germFixture.id,1);
 const result=safeResolve(session,plan.activationId,[copies[0].uid]);
 assert.equal(result.status,'lethal');assert.equal(result.damage,500);
 assert.equal(session.duel.core.phase,'finished');assert.equal(session.duel.core.players[0].lp,0);
 assert.equal(session.duel.core.winner,session.duel.core.players[1].id);
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===copies[0].uid),false);
});
scenario('negar Giant Germ impede dano e recrutamento',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-negated','germ-negated');
 const lp=session.duel.core.players[0].lp,result=safeResolve(session,plan.activationId,[],true);
 assert.equal(result.status,'negated');assert.equal(result.damage,0);assert.equal(session.duel.core.players[0].lp,lp);
});
scenario('Nimble Momonga ganha 1000 PV e Invoca cópias em Defesa face-down',()=>{
 const {session}=setup(),{plan}=prepare(session,'nimble-momonga',1,'momonga-multiple','momonga-multiple');
 const copies=ensureCopiesInDeck(session,1,momongaFixture.id,2);assert.equal(copies.length,2);
 const lp=session.duel.core.players[1].lp,before=inventory(session),beforeHands=hands(session);
 const result=safeResolve(session,plan.activationId,copies.map(card=>card.uid));
 assert.equal(result.lifeGained,1000);assert.equal(session.duel.core.players[1].lp,lp+1000);
 assert.equal(result.summonedUids.length,2);
 for(const uid of result.summonedUids){const monster=session.duel.core.players[1].monsters.find(card=>card.uid===uid);assert.ok(monster);assert.equal(monster.position,'def');assert.equal(monster.faceUp,false);}
 assertConserved(before,beforeHands,session);
});
scenario('Nimble Momonga ganha PV mesmo sem recrutar cópias',()=>{
 const {session}=setup(),{plan}=prepare(session,'nimble-momonga',1,'momonga-zero','momonga-zero');
 const lp=session.duel.core.players[1].lp,result=safeResolve(session,plan.activationId,[]);
 assert.equal(result.lifeGained,1000);assert.equal(session.duel.core.players[1].lp,lp+1000);
 assert.equal(result.status,'no-summon');
});
scenario('Nimble Momonga recusa carta de outro nome',()=>{
 const {session}=setup(),{plan}=prepare(session,'nimble-momonga',1,'momonga-foreign','momonga-foreign');
 const target=ensureCopiesInDeck(session,1,earthLow[0].id,1)[0];
 assert.throws(()=>safeResolve(session,plan.activationId,[target.uid]),/nome exigido/);
});
scenario('Nimble Momonga respeita a capacidade 3+3 do campo',()=>{
 const {session}=setup(),{plan}=prepare(session,'nimble-momonga',1,'momonga-full','momonga-full');
 fillTeam(session,1,[earthLow[0].id,earthLow[1].id,earthLow[2].id]);
 const copies=ensureCopiesInDeck(session,1,momongaFixture.id,1);
 assert.ok(copies.length);
 assert.throws(()=>safeResolve(session,plan.activationId,[copies[0].uid]),/Monster Zones/);
});
scenario('negar Nimble Momonga não concede PV nem Invoca',()=>{
 const {session}=setup(),{plan}=prepare(session,'nimble-momonga',1,'momonga-negated','momonga-negated');
 const lp=session.duel.core.players[1].lp,result=safeResolve(session,plan.activationId,[],true);
 assert.equal(result.status,'negated');assert.equal(result.lifeGained,0);assert.equal(session.duel.core.players[1].lp,lp);
});
scenario('fonte pode sair do Cemitério após a ativação sem cancelar o efeito',()=>{
 const {session}=setup(),{source,plan}=prepare(session,'giant-rat',1,'rat-source-leaves','rat-source-leaves');
 const grave=session.duel.core.players[1].grave,index=grave.findIndex(card=>card.uid===source.uid);
 const [card]=grave.splice(index,1);(session.duel.core.players[1].banished??=[]).push(card);
 require('../dist/cardLifetime').synchronizeCardLifetimes(session.duel.core);
 const target=ensureEarthTarget(session,1),result=safeResolve(session,plan.activationId,[target.uid]);
 assert.equal(result.status,'summoned');assert.ok(session.duel.core.players[1].monsters.some(monster=>monster.uid===target.uid));
});
scenario('resolução repetida é idempotente e não Invoca duas vezes',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-idempotent','germ-idempotent');
 const copies=ensureCopiesInDeck(session,1,germFixture.id,2);
 const first=safeResolve(session,plan.activationId,copies.map(card=>card.uid));
 const second=safeResolve(session,plan.activationId,copies.map(card=>card.uid));
 assert.deepEqual(second,first);assert.equal(session.duel.core.players[1].monsters.filter(card=>fixtureEffects.get(card.id)==='giant-germ').length,2);
});
scenario('gatilho fica obsoleto se o turno avançar antes da resolução',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-stale','rat-stale');
 session.pending[plan.activationId].turn--;
 assert.throws(()=>safeResolve(session,plan.activationId,[]),/turno ou o assento/);
});
scenario('monstro fisicamente pertencente ao parceiro usa o Deck privado do membro ativo',()=>{
 const {session}=setup(),{source,plan}=prepare(session,'giant-rat',2,'rat-partner-owner','rat-partner-owner');
 assert.equal(plan.sourceOwnerSeat,2);assert.equal(plan.controllerTeam,0);assert.equal(plan.deckSeat,0);
 const target=ensureEarthTarget(session,0),result=safeResolve(session,plan.activationId,[target.uid]);
 assert.equal(result.status,'summoned');assert.ok(session.duel.core.players[0].monsters.some(card=>card.uid===target.uid));
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
});
scenario('mão privada acima de seis permanece intacta até a End Phase',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-hand-seven','rat-hand-seven');
 const target=ensureEarthTarget(session,1),source=holder(session,1);
 while(source.hand.length<7){const extra=source.deck.pop();assert.ok(extra);source.hand.push(extra);}
 const before=hands(session);
 safeResolve(session,plan.activationId,[target.uid]);
 assert.equal(holder(session,1).hand.length,7);assert.deepEqual(hands(session),before);
});
scenario('conserva todas as identidades físicas e não concede inventário',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-germ',1,'germ-inventory','germ-inventory');
 const copies=ensureCopiesInDeck(session,1,germFixture.id,2),before=inventory(session),beforeHands=hands(session);
 safeResolve(session,plan.activationId,copies.map(card=>card.uid));
 assertConserved(before,beforeHands,session);assert.equal(inventory(session).size,80);
});
scenario('o Extra Deck continua limitado a cinco e não é usado como Deck de recrutamento',()=>{
 const {session}=setup(),{plan}=prepare(session,'giant-rat',1,'rat-extra','rat-extra');
 assert.equal(session.duel.core.players[1].extra.length,0);
 assertBattleRecruitRules(session.duel);
 assert.throws(()=>safeResolve(session,plan.activationId,['m1:extra-not-in-deck']),/Deck ativo/);
});
scenario('as três Monster Zones e três Spell/Trap Zones permanecem separadas da Field Zone',()=>{
 const {session}=setup();assertBattleRecruitRules(session.duel);
 assert.equal(session.duel.core.players[0].monsters.length,0);assert.equal(session.duel.core.players[0].backrow.length,0);
 assert.equal(session.duel.core.players[0].field??null,null);
});
scenario('as três cartas reais permanecem fora do catálogo e sem certificação automática',()=>{
 const snapshot=catalogSnapshot();
 assert.equal(snapshot.count,969);
 for(const id of [GIANT_RAT_ID,GIANT_GERM_ID,NIMBLE_MOMONGA_ID])assert.equal(snapshot.ids.has(id),false);
});
after(()=>{
 const snapshot=catalogSnapshot();
 const evidence={mission:'M659',passed:completed===scenarioCount,scenarioCount,completed,
  inventoryConservationChecks,certifiedCardsBefore:969,certifiedCardsAfter:snapshot.count,
  newCertifications:0,inventoryGrants:0,integratedIntoCentralResolver:false,
  discordLiveValidated:false,productionChanged:false,catalogRevision:snapshot.revision,
  cardIds:[GIANT_RAT_ID,GIANT_GERM_ID,NIMBLE_MOMONGA_ID]};
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync(path.join('artifacts','m659-battle-recruiters-results.json'),JSON.stringify(evidence,null,2)+'\n');
});
