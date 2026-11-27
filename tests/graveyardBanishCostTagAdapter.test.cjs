const {test}=require('node:test'),assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {swapTeamSeat}=require('../dist/teamRotation');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {getDuelCard}=require('../dist/effectRegistry');
const {createGraveyardBanishCostAdapter}=require('../dist/graveyardBanishCostTagAdapter');

const normal=tag.tagNormalCardIds;
const level2=normal.find(id=>getDuelCard(id)?.level===2);
const level3=normal.find(id=>getDuelCard(id)?.level===3);
assert.ok(level2&&level3,'o catálogo de teste precisa de monstros normais de Nível 2 e 3');
const other=normal.filter(id=>id!==level2&&id!==level3);
const deckIds=[...other.slice(0,7),level2,level3];
const spell='05318639';
const deck=deckIds.flatMap(id=>[id,id]).concat([spell,spell]);
const alias={bazoo:deckIds[0],skull:deckIds[1],fodderA:deckIds[2],fodderB:deckIds[3],fodderC:deckIds[4],target2:level2,target3:level3};
const lookup=id=>id===alias.bazoo?{kind:'monster',effect:'bazoo'}:
 id===alias.skull?{kind:'trap',effect:'skull-lair'}:undefined;
const adapter=createGraveyardBanishCostAdapter(lookup);

function game(first=0){
 const duel=tag.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:deck})),
  {seed:'m680-graveyard-banish-'+first,classic:true,first});
 duel.core.phase='main';duel.core.resume='main';duel.core.priority=duel.core.current;
 return duel;
}
function holder(duel,seat){
 const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
}
function take(duel,seat,id){
 const h=holder(duel,seat),card=h.deck.pop();assert.ok(card,'fixture deck exhausted');return {...card,id};
}
function putGrave(duel,seat,id){
 const card=take(duel,seat,id);duel.core.players[seat%2].grave.push(card);return card;
}
function deploy(duel,seat,id){
 const card=take(duel,seat,id),monster={...card,owner:seat%2,position:'atk',faceUp:true,
  entered:duel.core.turn,changed:0,attacked:0,atkBoost:0,defBoost:0};
 duel.core.players[seat%2].monsters.push(monster);return monster;
}
function setTrap(duel,seat,id){
 const card=take(duel,seat,id),trap={...card,setTurn:duel.core.turn-1,faceUp:true,resolved:true};
 duel.core.players[seat%2].backrow.push(trap);return trap;
}
function turnTo(duel,seat,turn,phase='main'){
 duel.cursor=seat;duel.core.teamRotation.cursor=seat;duel.core.current=seat%2;swapTeamSeat(duel.core,seat);
 duel.core.turn=turn;duel.core.phase=phase;duel.core.resume=phase==='battle'?'battle':'main';
 duel.core.priority=seat%2;tag.assertTagDuel(duel);
}
function inventory(duel){
 return tag.tagInventory(duel).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function banished(duel,team){return duel.core.players[team].banished??[];}
function bazooFixture(){
 const duel=game(0),source=deploy(duel,0,alias.bazoo);
 const a=putGrave(duel,2,alias.fodderA),b=putGrave(duel,0,alias.fodderB),c=putGrave(duel,2,alias.fodderC);
 return {duel,source,cost:[a,b,c]};
}
function skullFixture(){
 const duel=game(0),source=setTrap(duel,1,alias.skull);
 const a=putGrave(duel,3,alias.fodderA),b=putGrave(duel,1,alias.fodderB);
 const target=deploy(duel,0,alias.target2);
 duel.core.phase='response';duel.core.resume='main';duel.core.priority=1;
 tag.assertTagDuel(duel);
 return {duel,source,cost:[a,b],target};
}

test('Bazoo paga 1–3 monstros do Cemitério da equipe e recebe +300 ATK por carta até o fim do turno oponente',()=>{
 const {duel,source,cost}=bazooFixture(),before=inventory(duel),session=adapter.createSession(duel);
 const receipt=adapter.activateBazoo(session,'bazoo-1',source.uid,0,cost.map(c=>c.uid));
 assert.equal(receipt.atkGain,900);assert.equal(receipt.expiresAfterTurn,2);
 assert.equal(adapter.resolveBazoo(session,'bazoo-1').status,'boosted');
 assert.equal(adapter.effectiveAtk(session,source.uid),getDuelCard(alias.bazoo).atk+900);
 assert.deepEqual(banished(session.duel,0).map(c=>c.uid).sort(),cost.map(c=>c.uid).sort());
 assert.deepEqual(inventory(session.duel),before);
});

test('Bazoo não usa o Cemitério adversário nem aceita Magias/Armadilhas como custo',()=>{
 const duel=game(0),source=deploy(duel,0,alias.bazoo),enemy=putGrave(duel,1,alias.fodderA);
 const spellCard=take(duel,2,spell);duel.core.players[0].grave.push(spellCard);
 const session=adapter.createSession(duel),before=inventory(session.duel);
 assert.throws(()=>adapter.activateBazoo(session,'bazoo-enemy',source.uid,0,[enemy.uid]),/Cemitério da equipe/);
 assert.throws(()=>adapter.activateBazoo(session,'bazoo-spell',source.uid,0,[spellCard.uid]),/somente monstros/);
 assert.deepEqual(inventory(session.duel),before);
});

test('Bazoo respeita limite de três, uso por instância/turno e replay idempotente',()=>{
 const {duel,source,cost}=bazooFixture(),session=adapter.createSession(duel);
 assert.throws(()=>adapter.activateBazoo(session,'bazoo-four',source.uid,0,[...cost.map(c=>c.uid),cost[0].uid]),/1 a 3|distintos/);
 const first=adapter.activateBazoo(session,'bazoo-once',source.uid,0,[cost[0].uid]);
 assert.equal(adapter.activateBazoo(session,'bazoo-once',source.uid,0,[cost[0].uid]).replayed,true);
 assert.equal(adapter.resolveBazoo(session,'bazoo-once').status,'boosted');
 assert.throws(()=>adapter.activateBazoo(session,'bazoo-twice',source.uid,0,[cost[1].uid]),/já ativou/);
 assert.equal(adapter.resolveBazoo(session,'bazoo-once').replayed,true);
 assert.equal(first.atkGain,300);
});

test('negação de Bazoo não devolve o custo nem concede ATK',()=>{
 const {duel,source,cost}=bazooFixture(),session=adapter.createSession(duel);
 adapter.activateBazoo(session,'bazoo-negated',source.uid,0,[cost[0].uid,cost[1].uid]);
 const result=adapter.resolveBazoo(session,'bazoo-negated',{negated:true});
 assert.equal(result.status,'effect-negated');assert.equal(adapter.bazooBonus(session,source.uid),0);
 assert.ok(banished(session.duel,0).some(c=>c.uid===cost[0].uid));
});

test('Bazoo não aplica o bônus se a mesma instância sair do campo antes da resolução',()=>{
 const {duel,source,cost}=bazooFixture(),session=adapter.createSession(duel);
 adapter.activateBazoo(session,'bazoo-stale',source.uid,0,[cost[0].uid]);
 const player=session.duel.core.players[0],index=player.monsters.findIndex(m=>m.uid===source.uid);
 player.grave.push(player.monsters.splice(index,1)[0]);synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveBazoo(session,'bazoo-stale').status,'source-left-field');
 assert.equal(adapter.bazooBonus(session,source.uid),0);
});

test('bônus de Bazoo sobrevive ao turno do controlador e expira só ao fim do turno oponente',()=>{
 const {duel,source,cost}=bazooFixture(),session=adapter.createSession(duel);
 adapter.activateBazoo(session,'bazoo-duration',source.uid,0,[cost[0].uid,cost[1].uid]);
 adapter.resolveBazoo(session,'bazoo-duration');
 session.duel.core.turn=2;
 assert.equal(adapter.effectiveAtk(session,source.uid),getDuelCard(alias.bazoo).atk+600);
 assert.deepEqual(adapter.expireBazooBonuses(session,1,0),[]);
 assert.deepEqual(adapter.expireBazooBonuses(session,2,1),[source.uid]);
 assert.equal(adapter.effectiveAtk(session,source.uid),getDuelCard(alias.bazoo).atk);
});

test('Skull Lair paga o custo no Cemitério da equipe controladora e escolhe o monstro apenas na resolução',()=>{
 const {duel,source,cost,target}=skullFixture(),before=inventory(duel),session=adapter.createSession(duel);
 const receipt=adapter.activateSkullLair(session,'skull-1',source.uid,1,cost.map(c=>c.uid));
 assert.equal(receipt.requiredLevel,2);
 assert.equal(adapter.resolveSkullLair(session,'skull-1').status,'target-required');
 const result=adapter.resolveSkullLair(session,'skull-1',target.uid);
 assert.equal(result.status,'destroyed');
 assert.ok(session.duel.core.players[0].grave.some(c=>c.uid===target.uid));
 assert.ok(banished(session.duel,1).some(c=>c.uid===cost[0].uid));
 assert.deepEqual(inventory(session.duel),before);
});

test('Skull Lair é não-direcionada: alvo de nível incorreto pode ser substituído antes da escolha de resolução',()=>{
 const {duel,source,cost}=skullFixture(),wrong=deploy(duel,0,alias.target3),right=deploy(duel,1,alias.target2);
 const session=adapter.createSession(duel);
 adapter.activateSkullLair(session,'skull-retarget',source.uid,1,cost.map(c=>c.uid));
 assert.equal(adapter.resolveSkullLair(session,'skull-retarget',wrong.uid).status,'target-not-eligible');
 assert.equal(adapter.resolveSkullLair(session,'skull-retarget',right.uid).status,'destroyed');
 assert.ok(session.duel.core.players[1].grave.some(c=>c.uid===right.uid));
 assert.ok(session.duel.core.players[0].monsters.some(m=>m.uid===wrong.uid));
});

test('Skull Lair paga o custo mesmo sem monstro face-up de nível correspondente',()=>{
 const {duel,source,cost}=skullFixture();
 duel.core.players[0].monsters=duel.core.players[0].monsters.filter(m=>m.id!==alias.target2);
 const session=adapter.createSession(duel);
 adapter.activateSkullLair(session,'skull-no-target',source.uid,1,cost.map(c=>c.uid));
 assert.equal(adapter.resolveSkullLair(session,'skull-no-target').status,'no-eligible-target');
 assert.equal(banished(session.duel,1).length,2);
});

test('Skull Lair não resolve se a armadilha sair da zona; o custo permanece banido',()=>{
 const {duel,source,cost,target}=skullFixture(),session=adapter.createSession(duel);
 adapter.activateSkullLair(session,'skull-source-left',source.uid,1,cost.map(c=>c.uid));
 const backrow=session.duel.core.players[1].backrow;backrow.splice(backrow.findIndex(c=>c.uid===source.uid),1);
 synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveSkullLair(session,'skull-source-left',target.uid).status,'source-left-field');
 assert.ok(session.duel.core.players[0].monsters.some(m=>m.uid===target.uid));
 assert.equal(banished(session.duel,1).length,2);
});

test('negação de ativação/efeito de Skull Lair não devolve monstros banidos como custo',()=>{
 for(const option of [{negatedActivation:true},{negatedEffect:true}]){
  const {duel,source,cost,target}=skullFixture(),session=adapter.createSession(duel);
  const id=option.negatedActivation?'skull-negate-activation':'skull-negate-effect';
  adapter.activateSkullLair(session,id,source.uid,1,cost.map(c=>c.uid));
  const result=adapter.resolveSkullLair(session,id,target.uid,option);
  assert.equal(result.status,option.negatedActivation?'activation-negated':'effect-negated');
  assert.equal(banished(session.duel,1).length,2);
  assert.ok(session.duel.core.players[0].monsters.some(m=>m.uid===target.uid));
 }
});

test('Skull Lair rejeita custo não-monstro e mantém inventário inalterado',()=>{
 const {duel,source}=skullFixture(),spellCard=take(duel,3,spell);
 duel.core.players[1].grave.push(spellCard);
 const session=adapter.createSession(duel),before=inventory(session.duel);
 assert.throws(()=>adapter.activateSkullLair(session,'skull-spell-cost',source.uid,1,[spellCard.uid]),/somente monstros/);
 assert.deepEqual(inventory(session.duel),before);
});

test('regras 2v2 preservam Deck 20–30, mão 6 somente na End Phase, 3+3 zonas, Field Zone separada e Extra 5',()=>{
 const duel=game(0);
 duel.core.players[0].hand.push(...duel.core.players[0].deck.splice(0,3));
 duel.core.players[0].field={...take(duel,0,alias.fodderA),setTurn:0,faceUp:true,resolved:true};
 assert.equal(duel.core.players[0].hand.length,7);
 assert.doesNotThrow(()=>adapter.createSession(duel));
 const crowded=game(0);
 for(let i=0;i<4;i++)deploy(crowded,0,deckIds[i]);
 assert.throws(()=>adapter.createSession(crowded),/Monster Zones/);
});

test('janelas inválidas e IDs reutilizados com fatos diferentes são rejeitados sem perda de inventário',()=>{
 const {duel,source,cost}=bazooFixture(),session=adapter.createSession(duel),before=inventory(session.duel);
 assert.throws(()=>adapter.activateBazoo(session,'bad-window',source.uid,1,[cost[0].uid]),/Main Phase/);
 const first=adapter.activateBazoo(session,'bazoo-reuse',source.uid,0,[cost[0].uid]);
 assert.throws(()=>adapter.activateBazoo(session,'bazoo-reuse',source.uid,0,[cost[1].uid]),/reutilizado/);
 assert.ok(first);
 assert.equal(inventory(session.duel).length,before.length);
});
