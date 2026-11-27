const {test}=require('node:test'),assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {createTokenGroup}=require('../dist/tokens');
const {createOwnerHandReturnAdapter,publicReturnReceipt}=require('../dist/ownerHandReturnTagAdapter');

const normal=tag.tagNormalCardIds,level2=normal.find(id=>getDuelCard(id)?.level===2),level3=normal.find(id=>getDuelCard(id)?.level===3);
const water=normal.find(id=>getDuelCard(id)?.attribute==='WATER');
assert.ok(level2&&level3&&water,'fixtures precisam de monstros normais de Nível 2/3 e WATER');
const other=normal.filter(id=>id!==level2&&id!==level3&&id!==water);
const deckIds=[...other.slice(0,5),water,level2,level3];
const spell='05318639',trap='44095762',deck=deckIds.flatMap(id=>[id,id]).concat([spell,spell,trap,trap]);
const alias={nightmare:deckIds[0],monster:deckIds[1],monster2:deckIds[2],water,level2,level3,compulsory:trap};
const lookup=id=>id===alias.nightmare?{kind:'monster',effect:'nightmare-penguin'}:
 id===trap?{kind:'trap',effect:'compulsory'}:undefined;
const adapter=createOwnerHandReturnAdapter(lookup);

function game(first=0){
 const duel=tag.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:deck})),
  {seed:'m681-owner-return-'+first,classic:true,first});
 duel.core.phase='main';duel.core.resume='main';duel.core.priority=duel.core.current;return duel;
}
function holder(duel,seat){
 const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
}
function take(duel,seat,id){
 const h=holder(duel,seat),index=h.deck.findIndex(c=>c.id===id);assert.notEqual(index,-1,'fixture card missing: '+id);return h.deck.splice(index,1)[0];
}
function deploy(duel,seat,id){
 const card=take(duel,seat,id),monster={...card,owner:seat%2,position:'atk',faceUp:true,
  entered:duel.core.turn,changed:0,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[seat%2].monsters.push(monster);return monster;
}
function setTrap(duel,seat,id=trap){
 const card=take(duel,seat,id),backrow={...card,setTurn:duel.core.turn-1,faceUp:false,resolved:false};
 duel.core.players[seat%2].backrow.push(backrow);return backrow;
}
function setBackrow(duel,seat,id){
 const card=take(duel,seat,id),backrow={...card,setTurn:duel.core.turn-1,faceUp:false,resolved:false};
 duel.core.players[seat%2].backrow.push(backrow);return backrow;
}
function nightmareFixture(){
 const duel=game(0),source=deploy(duel,0,alias.nightmare),target=deploy(duel,3,alias.monster);
 return {duel,source,target};
}
function compulsoryFixture(){
 const duel=game(0),source=setTrap(duel,0),target=deploy(duel,3,alias.monster);
 return {duel,source,target};
}

test('Nightmare Penguin devolve monstro adversário à mão do dono físico, inclusive reserva inativa',()=>{
 const {duel,source,target}=nightmareFixture(),session=adapter.createSession(duel);
 adapter.activateNightmareFlip(session,'nightmare-1',source.uid,target.uid);
 const result=adapter.resolveNightmareFlip(session,'nightmare-1');
 assert.equal(result.status,'returned');assert.equal(result.receipt.ownerSeat,3);assert.equal(result.receipt.destination,'hand');
 assert.ok(tag.tagMemberHand(session.duel,'p3').some(c=>c.uid===target.uid));
 assert.ok(!tag.tagMemberHand(session.duel,'p1').some(c=>c.uid===target.uid));
 assert.ok(!session.duel.core.players[1].monsters.some(m=>m.uid===target.uid));
});

test('Nightmare Penguin pode devolver Spell/Trap face-down sem expor a identidade na resposta pública',()=>{
 const duel=game(0),source=deploy(duel,0,alias.nightmare),target=setBackrow(duel,3,spell),session=adapter.createSession(duel);
 adapter.activateNightmareFlip(session,'nightmare-backrow',source.uid,target.uid);
 const result=adapter.resolveNightmareFlip(session,'nightmare-backrow');
 assert.equal(result.status,'returned');assert.equal(result.receipt.ownerSeat,3);
 const publicResult=publicReturnReceipt(result.receipt);
 assert.deepEqual(publicResult,{ownerSeat:3,destination:'hand'});
 assert.ok(!('targetUid' in publicResult)&&!('cardId' in publicResult));
 assert.ok(tag.tagMemberHand(session.duel,'p3').some(c=>c.uid===target.uid&&c.id===spell));
});

test('Nightmare Penguin não pode escolher a própria equipe e não resolve binding obsoleto',()=>{
 const duel=game(0),source=deploy(duel,0,alias.nightmare),own=deploy(duel,2,alias.monster);
 const session=adapter.createSession(duel);
 assert.throws(()=>adapter.activateNightmareFlip(session,'nightmare-own',source.uid,own.uid),/oponente/);
 const enemy=deploy(session.duel,1,alias.monster2);
 adapter.activateNightmareFlip(session,'nightmare-stale',source.uid,enemy.uid);
 const player=session.duel.core.players[1],index=player.monsters.findIndex(m=>m.uid===enemy.uid);
 player.grave.push(player.monsters.splice(index,1)[0]);synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveNightmareFlip(session,'nightmare-stale').status,'target-left-field');
});

test('a aura contínua de Nightmare Penguin concede +200 ATK por cópia face-up a monstros WATER da equipe',()=>{
 const duel=game(0),a=deploy(duel,0,alias.nightmare),b=deploy(duel,2,alias.nightmare),waterMonster=deploy(duel,0,alias.water);
 const session=adapter.createSession(duel);
 assert.equal(adapter.nightmareWaterAtkBonus(session,0,waterMonster.uid),400);
 assert.equal(adapter.effectiveAtk(session,waterMonster.uid),getDuelCard(alias.water).atk+400);
 const nonWater=deploy(session.duel,0,alias.monster2);
 assert.equal(adapter.nightmareWaterAtkBonus(session,0,nonWater.uid),0);
 session.duel.core.players[0].monsters.find(m=>m.uid===b.uid).faceUp=false;
 assert.equal(adapter.nightmareWaterAtkBonus(session,0,waterMonster.uid),200);
 session.duel.core.players[0].monsters.find(m=>m.uid===a.uid).faceUp=false;
 assert.equal(adapter.nightmareWaterAtkBonus(session,0,waterMonster.uid),0);
});

test('Compulsory Evacuation Device devolve monstro ao dono físico e envia a própria Armadilha ao Cemitério',()=>{
 const {duel,source,target}=compulsoryFixture(),session=adapter.createSession(duel);
 adapter.activateCompulsory(session,'compulsory-1',source.uid,0,target.uid);
 const result=adapter.resolveCompulsory(session,'compulsory-1');
 assert.equal(result.status,'returned');assert.equal(result.receipt.ownerSeat,3);
 assert.ok(tag.tagMemberHand(session.duel,'p3').some(c=>c.uid===target.uid));
 assert.ok(session.duel.core.players[0].grave.some(c=>c.uid===source.uid));
});

test('Compulsory devolve monstro roubado à mão do proprietário original, não à mão do controlador',()=>{
 const {duel,source,target}=compulsoryFixture();
 duel.core.players[1].monsters=duel.core.players[1].monsters.filter(m=>m.uid!==target.uid);
 target.owner=1;duel.core.players[0].monsters.push(target);
 const session=adapter.createSession(duel);
 adapter.activateCompulsory(session,'compulsory-stolen',source.uid,0,target.uid);
 const result=adapter.resolveCompulsory(session,'compulsory-stolen');
 assert.equal(result.status,'returned');assert.equal(result.receipt.ownerSeat,3);
 assert.ok(tag.tagMemberHand(session.duel,'p3').some(c=>c.uid===target.uid));
 assert.ok(!tag.tagMemberHand(session.duel,'p0').some(c=>c.uid===target.uid));
});

test('negação da ativação ou do efeito de Compulsory não devolve o monstro',()=>{
 for(const option of [{negatedActivation:true},{negatedEffect:true}]){
  const {duel,source,target}=compulsoryFixture(),session=adapter.createSession(duel);
  const id=option.negatedActivation?'comp-negate-activation':'comp-negate-effect';
  adapter.activateCompulsory(session,id,source.uid,0,target.uid);
  const result=adapter.resolveCompulsory(session,id,option);
  assert.equal(result.status,option.negatedActivation?'activation-negated':'effect-negated');
  assert.ok(session.duel.core.players[1].monsters.some(m=>m.uid===target.uid));
  assert.ok(session.duel.core.players[0].grave.some(c=>c.uid===source.uid));
 }
});

test('Compulsory perde o alvo que sai e retorna como nova instância; a Armadilha ainda vai ao Cemitério',()=>{
 const {duel,source,target}=compulsoryFixture(),session=adapter.createSession(duel);
 adapter.activateCompulsory(session,'comp-stale',source.uid,0,target.uid);
 const player=session.duel.core.players[1],index=player.monsters.findIndex(m=>m.uid===target.uid);
 player.grave.push(player.monsters.splice(index,1)[0]);synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveCompulsory(session,'comp-stale').status,'target-left-field');
 assert.ok(session.duel.core.players[1].grave.some(c=>c.uid===target.uid));
 assert.ok(session.duel.core.players[0].grave.some(c=>c.uid===source.uid));
});

test('Compulsory aceita resposta no turno oponente e preserva o dono físico da Armadilha',()=>{
 const duel=game(0),source=setTrap(duel,3),target=deploy(duel,0,alias.monster);
 duel.core.phase='response';duel.core.resume='main';duel.core.priority=1;tag.assertTagDuel(duel);
 const session=adapter.createSession(duel);
 adapter.activateCompulsory(session,'comp-response',source.uid,3,target.uid);
 assert.equal(adapter.resolveCompulsory(session,'comp-response').status,'returned');
 assert.ok(session.duel.core.players[1].grave.some(c=>c.uid===source.uid));
});

test('token devolvido desaparece com causa return, sem entrar em mão ou inventário',()=>{
 const duel=game(0),source=deploy(duel,0,alias.nightmare),token=createTokenGroup(duel.core,1,1,'atk')[0];
 tag.assertTagDuel(duel);
 const session=adapter.createSession(duel);
 adapter.activateNightmareFlip(session,'nightmare-token',source.uid,token.uid);
 const result=adapter.resolveNightmareFlip(session,'nightmare-token');
 assert.equal(result.status,'returned');assert.equal(result.receipt.destination,'gone');
 const entry=session.duel.core.tokenLedger.entries.find(e=>e.uid===token.uid);
 assert.equal(entry.status,'removed');assert.equal(entry.cause,'return');
 assert.ok(!tag.tagMemberHand(session.duel,'p1').some(c=>c.uid===token.uid));
});

test('IDs de ativação são idempotentes e não podem ser reutilizados para outro alvo',()=>{
 const {duel,source,target}=nightmareFixture(),session=adapter.createSession(duel);
 const first=adapter.activateNightmareFlip(session,'nightmare-idempotent',source.uid,target.uid);
 assert.equal(adapter.activateNightmareFlip(session,'nightmare-idempotent',source.uid,target.uid),first);
 const other=deploy(session.duel,1,alias.monster2);
 assert.throws(()=>adapter.activateNightmareFlip(session,'nightmare-idempotent',source.uid,other.uid),/reutilizado/);
 assert.equal(adapter.resolveNightmareFlip(session,'nightmare-idempotent').replayed,false);
 assert.equal(adapter.resolveNightmareFlip(session,'nightmare-idempotent').replayed,true);
});

test('regras mantêm mão 6 somente na End Phase e limites de 3 Monster + 3 Spell/Trap Zones',()=>{
 const duel=game(0);duel.core.players[0].hand.push(...duel.core.players[0].deck.splice(0,3));
 assert.equal(duel.core.players[0].hand.length,7);assert.doesNotThrow(()=>adapter.createSession(duel));
 const crowded=game(0);for(let i=0;i<4;i++)deploy(crowded,0,deckIds[i]);assert.throws(()=>adapter.createSession(crowded));
 const crowdedBackrow=game(0);
 for(const id of [trap,trap,spell,spell]){const card=take(crowdedBackrow,0,id);crowdedBackrow.core.players[0].backrow.push({...card,setTurn:0,faceUp:false,resolved:false});}
 assert.throws(()=>adapter.createSession(crowdedBackrow));
});

test('IDs de carta, propriedade física e inventário permanecem intactos após os retornos',()=>{
 const {duel,source,target}=nightmareFixture(),before=tag.tagInventory(duel).map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
 const session=adapter.createSession(duel);adapter.activateNightmareFlip(session,'nightmare-conservation',source.uid,target.uid);
 adapter.resolveNightmareFlip(session,'nightmare-conservation');
 const after=tag.tagInventory(session.duel).map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(after,before);
});
