const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTagDuel,tagInventory,assertTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {sendMonsterToGrave}=require('../dist/monsterExit');
const {
 createSwarmFlipAdapter,assertSwarmFlipRules,SWARM_OF_SCARABS_ID,SWARM_OF_LOCUSTS_ID
}=require('../dist/swarmFlipTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);
  if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;
  if(seen.has(name))return false;
  seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',6);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);
const deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
const fixtures={scarabs:monsterIds[0],locusts:monsterIds[1]};
const effectById=new Map([[fixtures.scarabs,'scarabs'],[fixtures.locusts,'locusts']]);
function lookup(id){const effect=effectById.get(id);return effect?{kind:'monster',effect}:undefined;}
const adapter=createSwarmFlipAdapter(lookup);
let scenarioCount=0,completed=0,inventoryConservationChecks=0;
function scenario(name,fn){scenarioCount++;test(name,()=>{fn();completed++;});}
function setup(seed='m657-swarm-flip',first=0){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));
 const session=adapter.createSession(createTagDuel(players,{classic:true,first,seed}));
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
function deploy(session,team,id,seat=team,faceUp=true,position='atk'){
 const card=take(session,seat,id),turn=session.duel.core.turn;
 const monster={...card,position,faceUp,entered:turn-1,changed:turn-1,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);
 return monster;
}
function setBackrow(session,team,id,seat=team,faceUp=false){
 const card=take(session,seat,id);
 const placed={...card,setTurn:session.duel.core.turn-1,faceUp};
 session.duel.core.players[team].backrow.push(placed);
 return placed;
}
function setField(session,team,id,seat=team,faceUp=true){
 const card=take(session,seat,id);
 const placed={...card,setTurn:session.duel.core.turn-1,faceUp};
 session.duel.core.players[team].field=placed;
 return placed;
}
function beginFlip(session,team,source,actorSeat=session.duel.active[team]){
 const duel=session.duel.core,turn=duel.turn;
 source.faceUp=true;source.position='atk';source.changed=turn;source.lastSummonedTurn=turn;
 duel.current=team;duel.priority=team;duel.phase='response';duel.resume='main';duel.passes=0;
 duel.pending={kind:'flip',actor:team,card:source.uid,id:source.id,triggersQueued:true};
 assertTagDuel(session.duel);
 return actorSeat;
}
function mainPhase(session,team=0){
 const core=session.duel.core;
 core.current=team;core.priority=team;core.phase='main';core.pending={kind:'none'};
 core.chain=[];core.choice=undefined;core.turnEnding=false;core.damageStep=false;
 assertTagDuel(session.duel);
}
function removeMonster(session,team,uid){
 const monsters=session.duel.core.players[team].monsters,index=monsters.findIndex(card=>card.uid===uid);
 assert.ok(index>=0,'monster exists');
 const [card]=monsters.splice(index,1);
 session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
}
function removeBackrow(session,team,uid){
 const player=session.duel.core.players[team],index=player.backrow.findIndex(card=>card.uid===uid);
 assert.ok(index>=0,'backrow exists');
 const [card]=player.backrow.splice(index,1);
 player.grave.push({uid:card.uid,id:card.id});
}
function snapshot(session){
 return new Map(tagInventory(session.duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));
}
function hands(session){
 const result=[];
 for(const player of session.duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(session.duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertConserved(before,beforeHands,session){
 const after=snapshot(session);
 assert.deepEqual([...after.entries()].sort(),[...before.entries()].sort());
 assert.deepEqual(hands(session),beforeHands);
 inventoryConservationChecks++;
}
function prepare(session,source,actorSeat=0,id='swarm-flip-1'){
 return adapter.prepareFlipSummonEffect(session,actorSeat,source.uid,id);
}
function catalogSnapshot(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9/manifest.json'),'utf8'));
 const revision=manifest.revisions.find(item=>item.id===manifest.current);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9',revision.file),'utf8'));
 return {count:catalog.cards.length,ids:new Set(catalog.cards.map(card=>card.id)),revision:manifest.current};
}

scenario('baseline: quatro assentos, decks 20, mão 6 na End Phase, zonas 3+3 e Extra 5',()=>{
 const {session}=setup();
 assertSwarmFlipRules(session.duel);assertTagDuel(session.duel);
 const rules=rulesFor(session.duel.core);
 assert.equal(session.duel.mode,'tag-classic');
 assert.deepEqual(session.duel.core.players.map(player=>player.hand.length),[4,4]);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.extraDeckMax,5);
});

scenario('Swarm of Scarabs oferece monstros de toda a equipe oponente, inclusive face-down e parceiro',()=>{
 const {session}=setup('m657-scarabs-options');
 const source=deploy(session,0,fixtures.scarabs,0,false,'def');
 const target=deploy(session,1,monsterIds[2],1,true,'def');
 const hidden=deploy(session,1,monsterIds[3],3,false,'def');
 const friendly=deploy(session,0,monsterIds[4],2,true,'atk');
 const actor=beginFlip(session,0,source);
 const plan=prepare(session,source,actor,'scarabs-options');
 assert.deepEqual(plan.targetOptions,[{uid:target.uid,zone:'monster'},{uid:hidden.uid,zone:'monster'}]);
 assert.equal(plan.targetOptions.some(item=>item.uid===friendly.uid),false);
});

scenario('Swarm of Scarabs destrói o monstro escolhido e preserva UID/ID no Cemitério',()=>{
 const {session}=setup('m657-scarabs-destroy');
 const source=deploy(session,0,fixtures.scarabs,0,false,'def');
 const target=deploy(session,1,monsterIds[2],3,false,'def');
 const actor=beginFlip(session,0,source),before=snapshot(session),beforeHands=hands(session);
 prepare(session,source,actor,'scarabs-destroy');
 const result=adapter.resolveFlipSummonEffect(session,'scarabs-destroy',target.uid);
 assert.equal(result.status,'destroyed');assert.equal(result.destroyedZone,'monster');
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),false);
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===target.id));
 assertConserved(before,beforeHands,session);
});

scenario('o alvo de Scarabs que deixa o campo não é substituído por outro monstro',()=>{
 const {session}=setup('m657-scarabs-no-retarget');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1),other=deploy(session,1,monsterIds[3],3);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'scarabs-no-retarget');
 removeMonster(session,1,target.uid);
 const result=adapter.resolveFlipSummonEffect(session,'scarabs-no-retarget',target.uid);
 assert.equal(result.status,'target-lost');
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===other.uid));
});

scenario('o alvo de Scarabs que muda para a equipe controladora fica inválido',()=>{
 const {session}=setup('m657-scarabs-control');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],3);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'scarabs-control');
 const [m]=session.duel.core.players[1].monsters.splice(session.duel.core.players[1].monsters.findIndex(card=>card.uid===target.uid),1);
 session.duel.core.players[0].monsters.push(m);
 const result=adapter.resolveFlipSummonEffect(session,'scarabs-control',target.uid);
 assert.equal(result.status,'target-lost');
 assert.ok(session.duel.core.players[0].monsters.some(card=>card.uid===target.uid));
});

scenario('o alvo de Scarabs que vira face-down continua sendo o alvo e é destruído',()=>{
 const {session}=setup('m657-scarabs-face-down');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1,true,'atk');
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'scarabs-face-down');
 target.faceUp=false;target.position='def';
 const result=adapter.resolveFlipSummonEffect(session,'scarabs-face-down',target.uid);
 assert.equal(result.status,'destroyed');
});

scenario('o efeito Flip já ativado resolve mesmo que a fonte saia do campo',()=>{
 const {session}=setup('m657-scarabs-source-gone');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],3);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'scarabs-source-gone');
 removeMonster(session,0,source.uid);
 session.duel.core.pending={kind:'none'};
 const result=adapter.resolveFlipSummonEffect(session,'scarabs-source-gone',target.uid);
 assert.equal(result.status,'destroyed');
});

scenario('Swarm of Locusts oferece backrow e Field Zone da equipe oponente, sem incluir a própria equipe',()=>{
 const {session}=setup('m657-locust-options');
 const source=deploy(session,0,fixtures.locusts);
 const backrow=setBackrow(session,1,trapIds[0],3,false);
 const field=setField(session,1,spellIds[0],1,true);
 const own=setBackrow(session,0,trapIds[1],2,false);
 const actor=beginFlip(session,0,source);
 const plan=prepare(session,source,actor,'locust-options');
 assert.deepEqual(plan.targetOptions,[{uid:backrow.uid,zone:'backrow'},{uid:field.uid,zone:'field'}]);
 assert.equal(plan.targetOptions.some(item=>item.uid===own.uid),false);
});

scenario('Swarm of Locusts destrói Magia/Armadilha baixada e a envia ao Cemitério',()=>{
 const {session}=setup('m657-locust-backrow');
 const source=deploy(session,0,fixtures.locusts);
 const target=setBackrow(session,1,trapIds[0],3,false);
 const actor=beginFlip(session,0,source),before=snapshot(session),beforeHands=hands(session);
 prepare(session,source,actor,'locust-backrow');
 const result=adapter.resolveFlipSummonEffect(session,'locust-backrow',target.uid);
 assert.equal(result.status,'destroyed');assert.equal(result.destroyedZone,'backrow');
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===target.id));
 assertConserved(before,beforeHands,session);
});

scenario('Swarm of Locusts pode destruir a Magia de Campo do oponente',()=>{
 const {session}=setup('m657-locust-field');
 const source=deploy(session,0,fixtures.locusts);
 const field=setField(session,1,spellIds[0],3,true);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'locust-field');
 const result=adapter.resolveFlipSummonEffect(session,'locust-field',field.uid);
 assert.equal(result.status,'destroyed');assert.equal(result.destroyedZone,'field');
 assert.equal(session.duel.core.players[1].field,null);
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===field.uid));
});

scenario('uma Magia/Armadilha que muda de backrow para Field Zone deixa de ser o alvo original',()=>{
 const {session}=setup('m657-locust-zone-change');
 const source=deploy(session,0,fixtures.locusts);
 const target=setBackrow(session,1,trapIds[0],3,false);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'locust-zone-change');
 const [moved]=session.duel.core.players[1].backrow.splice(session.duel.core.players[1].backrow.findIndex(card=>card.uid===target.uid),1);
 session.duel.core.players[1].field=moved;
 const result=adapter.resolveFlipSummonEffect(session,'locust-zone-change',target.uid);
 assert.equal(result.status,'target-lost');
 assert.equal(session.duel.core.players[1].field.uid,target.uid);
});

scenario('Locusts não pode selecionar monstros',()=>{
 const {session}=setup('m657-locust-no-monster');
 const source=deploy(session,0,fixtures.locusts),target=deploy(session,1,monsterIds[2],3);
 const actor=beginFlip(session,0,source);
 assert.throws(()=>prepare(session,source,actor,'locust-no-monster'),/Não existe alvo legal/);
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid));
});

scenario('Scarabs não ativa sem monstro oponente para destruir',()=>{
 const {session}=setup('m657-scarabs-no-target');
 const source=deploy(session,0,fixtures.scarabs);
 const actor=beginFlip(session,0,source);
 assert.throws(()=>prepare(session,source,actor,'scarabs-no-target'),/Não existe alvo legal/);
});

scenario('somente o membro ativo que realizou a Flip Summon ativa o gatilho',()=>{
 const {session}=setup('m657-active-seat');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 beginFlip(session,0,source);
 assert.throws(()=>prepare(session,source,2,'active-seat'),/participante ativo/);
 assert.ok(target.uid);
});

scenario('um ID de fonte que não corresponde ao evento Flip é rejeitado',()=>{
 const {session}=setup('m657-source-mismatch');
 const source=deploy(session,0,fixtures.scarabs),other=deploy(session,0,monsterIds[2],2);
 const actor=beginFlip(session,0,source);
 assert.throws(()=>prepare(session,other,actor,'source-mismatch'),/janela de gatilho/);
});

scenario('um ataque ou revelação de batalha não substitui uma Flip Summon',()=>{
 const {session}=setup('m657-not-flip');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 const core=session.duel.core;
 core.phase='response';core.pending={kind:'none'};
 assert.throws(()=>prepare(session,source,0,'not-flip'),/janela de gatilho/);
});

scenario('a fonte precisa estar face-up em Posição de Ataque após a Flip Summon',()=>{
 const {session}=setup('m657-source-face-up');
 const source=deploy(session,0,fixtures.scarabs,0,false,'def'),target=deploy(session,1,monsterIds[2],1);
 const actor=beginFlip(session,0,source);
 source.position='def';
 assert.throws(()=>prepare(session,source,actor,'source-face-up'),/recém-Flip Summoned/);
 assert.ok(target.uid);
});

scenario('uma Invocação ocorrida em turno anterior não dispara o efeito Flip',()=>{
 const {session}=setup('m657-old-flip');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 const actor=beginFlip(session,0,source);
 source.lastSummonedTurn=session.duel.core.turn-1;
 assert.throws(()=>prepare(session,source,actor,'old-flip'),/recém-Flip Summoned/);
 assert.ok(target.uid);
});

scenario('uma ativação não pode reutilizar o mesmo ID',()=>{
 const {session}=setup('m657-duplicate');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'duplicate');
 assert.throws(()=>prepare(session,source,actor,'duplicate'),/duplicada/);
 assert.ok(target.uid);
});

scenario('IDs de ativação malformados são rejeitados',()=>{
 const {session}=setup('m657-invalid-id');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 const actor=beginFlip(session,0,source);
 assert.throws(()=>prepare(session,source,actor,'bad id'),/Evento de ativação inválido/);
 assert.ok(target.uid);
});

scenario('um alvo removido antes da resolução não causa retarget, mesmo havendo outro alvo',()=>{
 const {session}=setup('m657-locust-target-lost');
 const source=deploy(session,0,fixtures.locusts);
 const target=setBackrow(session,1,trapIds[0],3,false),other=setBackrow(session,1,trapIds[1],1,false);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'locust-target-lost');
 removeBackrow(session,1,target.uid);
 const result=adapter.resolveFlipSummonEffect(session,'locust-target-lost',target.uid);
 assert.equal(result.status,'target-lost');
 assert.ok(session.duel.core.players[1].backrow.some(card=>card.uid===other.uid));
});

scenario('uma ativação obsoleta de outro turno não resolve',()=>{
 const {session}=setup('m657-stale-turn');
 const source=deploy(session,0,fixtures.scarabs),target=deploy(session,1,monsterIds[2],1);
 const actor=beginFlip(session,0,source);
 prepare(session,source,actor,'stale-turn');
 session.duel.core.turn++;
 assert.throws(()=>adapter.resolveFlipSummonEffect(session,'stale-turn',target.uid),/obsoleta/);
});

scenario('a mudança própria para face-down só ocorre na Main Phase',()=>{
 const {session}=setup('m657-set-main');
 const source=deploy(session,0,fixtures.scarabs);
 mainPhase(session,0);
 const result=adapter.changeToFaceDownDefense(session,0,source.uid);
 assert.equal(result.status,'set');
 assert.equal(session.duel.core.players[0].monsters[0].faceUp,false);
 assert.equal(session.duel.core.players[0].monsters[0].position,'def');
});

scenario('o membro inativo do parceiro não pode ativar a mudança de posição',()=>{
 const {session}=setup('m657-set-seat');
 const source=deploy(session,0,fixtures.scarabs);
 mainPhase(session,0);
 assert.throws(()=>adapter.changeToFaceDownDefense(session,2,source.uid),/participante ativo/);
});

scenario('a mudança própria não pode ser ativada durante a Battle Phase',()=>{
 const {session}=setup('m657-set-battle');
 const source=deploy(session,0,fixtures.scarabs);
 mainPhase(session,0);session.duel.core.phase='battle';
 assert.throws(()=>adapter.changeToFaceDownDefense(session,0,source.uid),/Main Phase/);
});

scenario('um Swarm já face-down não pode usar a própria mudança de posição',()=>{
 const {session}=setup('m657-set-already-down');
 const source=deploy(session,0,fixtures.scarabs,0,false,'def');
 mainPhase(session,0);
 assert.throws(()=>adapter.changeToFaceDownDefense(session,0,source.uid),/face-up/);
});

scenario('a mudança própria respeita bloqueio de posição vigente',()=>{
 const {session}=setup('m657-set-lock');
 const source=deploy(session,0,fixtures.scarabs);
 mainPhase(session,0);source.positionLockedThrough=session.duel.core.turn;
 assert.throws(()=>adapter.changeToFaceDownDefense(session,0,source.uid),/não pode mudar de posição/);
});

scenario('a mudança própria só pode ser usada uma vez por turno, mesmo após voltar face-up',()=>{
 const {session}=setup('m657-set-once');
 const source=deploy(session,0,fixtures.scarabs);
 mainPhase(session,0);
 adapter.changeToFaceDownDefense(session,0,source.uid);
 source.faceUp=true;source.position='atk';
 assert.throws(()=>adapter.changeToFaceDownDefense(session,0,source.uid),/já foi usado/);
 source.effectUsedTurn=undefined;
 assert.throws(()=>adapter.changeToFaceDownDefense(session,0,source.uid),/já foi usado/);
});

scenario('a mudança própria preserva identidade física, mão e propriedade do monstro',()=>{
 const {session}=setup('m657-set-conservation');
 const source=deploy(session,0,fixtures.locusts,0,true,'def');
 const before=snapshot(session),beforeHands=hands(session),owner=source.owner;
 mainPhase(session,0);
 adapter.changeToFaceDownDefense(session,0,source.uid);
 assertConserved(before,beforeHands,session);
 assert.equal(session.duel.core.players[0].monsters[0].owner,owner);
 assert.equal(session.duel.core.players[0].monsters[0].uid,source.uid);
});

scenario('a Field Zone não consome as três Spell/Trap Zones',()=>{
 const {session}=setup('m657-field-independent');
 setBackrow(session,0,trapIds[0],0);setBackrow(session,0,trapIds[1],2);setBackrow(session,0,trapIds[2],0);
 setField(session,0,spellIds[0],2);
 assertSwarmFlipRules(session.duel);
 assert.equal(session.duel.core.players[0].backrow.length,3);
 assert.ok(session.duel.core.players[0].field);
});

scenario('quatro monstros na mesma equipe violam o limite de três Monster Zones',()=>{
 const {session}=setup('m657-four-monsters');
 for(let i=0;i<4;i++)deploy(session,0,monsterIds[i],i%2===0?0:2);
 assert.throws(()=>assertSwarmFlipRules(session.duel),/três Monster Zones/);
});

scenario('quatro cartas na retaguarda violam o limite de três Spell/Trap Zones',()=>{
 const {session}=setup('m657-four-backrow');
 for(let i=0;i<4;i++)setBackrow(session,0,trapIds[i%trapIds.length],i%2===0?0:2);
 assert.throws(()=>assertSwarmFlipRules(session.duel),/três Spell\/Trap Zones/);
});

scenario('o formato rejeita deck principal abaixo de 20 cartas',()=>{
 const short=[...deck.slice(0,19)];
 const players=[0,1,2,3].map(i=>({id:'short'+i,name:'Short '+i,cards:[...short]}));
 assert.throws(()=>createTagDuel(players,{classic:true,seed:'m657-short'}),/20 a 30/);
});

scenario('o formato rejeita mais de cinco cartas no Extra Deck',()=>{
 const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,6);
 assert.equal(fusionIds.length,6);
 const players=[0,1,2,3].map(i=>({id:'extra'+i,name:'Extra '+i,cards:[...deck],extra:[...fusionIds]}));
 assert.throws(()=>createTagDuel(players,{classic:true,seed:'m657-extra'}),/máximo de 5/);
});

scenario('as duas cartas continuam fora do catálogo/certificação até integração central',()=>{
 const catalog=catalogSnapshot();
 assert.equal(catalog.count,969);
 assert.equal(catalog.ids.has(SWARM_OF_SCARABS_ID),false);
 assert.equal(catalog.ids.has(SWARM_OF_LOCUSTS_ID),false);
});

after(()=>{
 const catalog=catalogSnapshot();
 const evidence={
  mission:'M657',adapter:'src/swarmFlipTagAdapter.ts',testSuite:'tests/swarmFlipTagAdapter.test.cjs',
  scenarioCount,completed,passed:completed===scenarioCount,inventoryConservationChecks,
  certifiedCardsBefore:969,certifiedCardsAfter:catalog.count,newCertifications:0,inventoryGrants:0,
  catalogRevision:catalog.revision,integratedIntoCentralResolver:false,discordLiveValidated:false,
  productionChanged:false,generatedAt:new Date().toISOString()
 };
 fs.mkdirSync(path.join(__dirname,'..','artifacts'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'..','artifacts','m657-swarm-flip-results.json'),JSON.stringify(evidence,null,2)+'\n');
});
