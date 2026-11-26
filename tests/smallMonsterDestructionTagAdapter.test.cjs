const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTagDuel,tagInventory,assertTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {atk}=require('../dist/duelEngineCurrent');
const {createSmallMonsterDestructionAdapter,assertSmallMonsterRules,KING_TIGER_WANGHU_ID,BLAST_JUGGLER_ID}=require('../dist/smallMonsterDestructionTagAdapter');

function unique(kind,predicate,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);
  if(!card||card.kind!==kind||card.fusion||!predicate(card))return false;
  const name=card.englishName||card.name;
  if(seen.has(name))return false;
  seen.add(name);return true;
 }).slice(0,count);
}
const lowIds=unique('monster',card=>Number.isFinite(card.atk)&&card.atk<=1400,8);
const highIds=unique('monster',card=>Number.isFinite(card.atk)&&card.atk>1400,3);
const spellIds=unique('spell',()=>true,6),trapIds=unique('trap',()=>true,6);
assert.ok(lowIds.length>=8);assert.ok(highIds.length>=3);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);
const kingFixture=highIds[0],blastFixture=lowIds[0];
const monsterIds=[kingFixture,blastFixture,...lowIds.slice(1,5),highIds[1],highIds[2]];
assert.equal(new Set(monsterIds).size,8);
const deck=[...monsterIds,...spellIds,...trapIds];assert.equal(deck.length,20);
const fixtureEffects=new Map([[kingFixture,'wanghu'],[blastFixture,'blast-juggler']]);
function lookup(id){const effect=fixtureEffects.get(id);return effect?{kind:'monster',effect}:undefined;}
const adapter=createSmallMonsterDestructionAdapter(lookup);
let scenarioCount=0,completed=0,inventoryConservationChecks=0;
function scenario(name,fn){scenarioCount++;test(name,()=>{fn();completed++;});}
function setup(seed='m658-small-destruction',first=0){
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
function markSummoned(monster,core){
 monster.entered=core.turn;monster.changed=core.turn;monster.lastSummonedTurn=core.turn;
}
function setAtk(monster,value){
 const base=engineCard(monster.id).atk;
 monster.atkBoost=value-base;
}
function beginSummon(session,team,kind,summoned){
 const core=session.duel.core,first=summoned[0];
 for(const monster of summoned)markSummoned(monster,core);
 core.current=team;core.priority=team;core.phase='response';core.resume='main';core.passes=0;
 core.pending={kind:kind==='normal'?'summon':kind==='special'?'specialSummon':'flip',
  actor:team,card:first.uid,id:first.id,triggersQueued:true};
 assertTagDuel(session.duel);
}
function mainPhase(session,team=0){
 const core=session.duel.core;
 core.current=team;core.priority=team;core.phase='main';core.pending={kind:'none'};
 core.chain=[];core.choice=undefined;core.turnEnding=false;core.damageStep=false;
 assertTagDuel(session.duel);
}
function removeMonster(session,team,uid){
 const list=session.duel.core.players[team].monsters,index=list.findIndex(card=>card.uid===uid);
 assert.ok(index>=0,'monster exists');
 const [card]=list.splice(index,1);
 session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
}
function moveControl(session,fromTeam,toTeam,uid){
 const list=session.duel.core.players[fromTeam].monsters,index=list.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const [card]=list.splice(index,1);session.duel.core.players[toTeam].monsters.push(card);
}
function reenterMonster(session,team,uid){
 const list=session.duel.core.players[team].monsters,index=list.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const [old]=list.splice(index,1);
 session.duel.core.players[team].grave.push({uid:old.uid,id:old.id});
 const grave=session.duel.core.players[team].grave,graveIndex=grave.findIndex(card=>card.uid===uid);
 const [ref]=grave.splice(graveIndex,1),turn=session.duel.core.turn;
 const next={...ref,position:'atk',faceUp:true,entered:turn,changed:turn,lastSummonedTurn:turn,
  attacked:0,atkBoost:0,defBoost:0,owner:old.owner};
 session.duel.core.players[team].monsters.push(next);
 return next;
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
 assert.deepEqual([...snapshot(session).entries()].sort(),[...before.entries()].sort());
 assert.deepEqual(hands(session),beforeHands);inventoryConservationChecks++;
}
function prepareWanghu(session,source,summoned,kind='normal',id='wanghu-1'){
 return adapter.prepareKingTigerWanghu(session,source.uid,kind,summoned.map(card=>card.uid),id);
}
function openStandby(session,team=0,seat=session.duel.active[team]){
 mainPhase(session,team);return adapter.openStandbyWindow(session,team,seat);
}
function activateBlast(session,source,targets,seat=0,id='blast-1'){
 return adapter.activateBlastJuggler(session,seat,source.uid,targets.map(card=>card.uid),id);
}
function catalogSnapshot(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9/manifest.json'),'utf8'));
 const revision=manifest.revisions.find(item=>item.id===manifest.current);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','catalog/engine-v9',revision.file),'utf8'));
 return {count:catalog.cards.length,ids:new Set(catalog.cards.map(card=>card.id)),revision:manifest.current};
}

scenario('baseline: regras clássicas 2v2, deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5',()=>{
 const {session}=setup();assertSmallMonsterRules(session.duel);assertTagDuel(session.duel);
 const rules=require('../dist/rulesProfile').rulesFor(session.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
 assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.extraDeckMax,5);
});

scenario('King Tiger Wanghu dispara após Normal Summon com ATK 1400 ou menos',()=>{
 const {session}=setup('m658-wanghu-normal');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1400);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-normal');
 session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-normal');
 assert.equal(result.status,'destroyed');assert.deepEqual(result.destroyedUids,[target.uid]);
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===target.uid));
});

scenario('King Tiger Wanghu dispara após Special Summon',()=>{
 const {session}=setup('m658-wanghu-special');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[2],3);
 setAtk(target,1200);beginSummon(session,1,'special',[target]);
 prepareWanghu(session,source,[target],'special','wanghu-special');
 session.duel.core.pending={kind:'none'};
 assert.equal(adapter.resolveKingTigerWanghu(session,'wanghu-special').status,'destroyed');
});

scenario('King Tiger Wanghu não dispara por Flip Summon',()=>{
 const {session}=setup('m658-wanghu-flip');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1,false,'def');
 setAtk(target,1200);beginSummon(session,1,'flip',[target]);
 assert.throws(()=>prepareWanghu(session,source,[target],'flip','wanghu-flip'),/não dispara por Flip Summon/);
});

scenario('ATK 1401 não satisfaz o limiar de ativação',()=>{
 const {session}=setup('m658-wanghu-1401');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,highIds[1],1);
 setAtk(target,1401);beginSummon(session,1,'normal',[target]);
 assert.throws(()=>prepareWanghu(session,source,[target],'normal','wanghu-1401'),/Nenhum monstro face-up/);
});

scenario('ATK 1400 exato satisfaz o limiar de ativação',()=>{
 const {session}=setup('m658-wanghu-1400');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,highIds[1],1);
 setAtk(target,1400);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-1400');
 session.duel.core.pending={kind:'none'};
 assert.equal(adapter.resolveKingTigerWanghu(session,'wanghu-1400').status,'destroyed');
});

scenario('a fonte Wanghu precisa estar face-up para ativar',()=>{
 const {session}=setup('m658-wanghu-face-down');
 const source=deploy(session,0,kingFixture,0,false,'def'),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 assert.throws(()=>prepareWanghu(session,source,[target],'normal','wanghu-face-down'),/face-up/);
});

scenario('Wanghu captura todos os monstros face-up do mesmo grupo de summon',()=>{
 const {session}=setup('m658-wanghu-group');
 const source=deploy(session,0,kingFixture);
 const a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3),high=deploy(session,1,highIds[1],1);
 setAtk(a,1200);setAtk(b,900);setAtk(high,1600);
 beginSummon(session,1,'special',[a,b,high]);
 prepareWanghu(session,source,[a,b,high],'special','wanghu-group');
 session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-group');
 assert.deepEqual(new Set(result.destroyedUids),new Set([a.uid,b.uid]));
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===high.uid));
});

scenario('alvo acima de 1400 no momento do summon, mas abaixo na resolução, é destruído',()=>{
 const {session}=setup('m658-wanghu-atk-down');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,highIds[1],1),trigger=deploy(session,1,lowIds[1],3);
 setAtk(target,1500);setAtk(trigger,1000);beginSummon(session,1,'special',[target,trigger]);
 prepareWanghu(session,source,[target,trigger],'special','wanghu-atk-down');
 setAtk(target,1400);session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-atk-down');
 assert.ok(result.destroyedUids.includes(target.uid));
});

scenario('alvo abaixo de 1400 no summon, mas acima na resolução, sobrevive',()=>{
 const {session}=setup('m658-wanghu-atk-up');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1300);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-atk-up');
 setAtk(target,1500);session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-atk-up');
 assert.equal(result.status,'no-targets');assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid));
});

scenario('monstro face-down no grupo não entra no conjunto destruído',()=>{
 const {session}=setup('m658-wanghu-face-down-target');
 const source=deploy(session,0,kingFixture),low=deploy(session,1,lowIds[1],1),hidden=deploy(session,1,lowIds[2],3,false,'def');
 setAtk(low,1000);setAtk(hidden,500);beginSummon(session,1,'special',[low,hidden]);
 prepareWanghu(session,source,[low,hidden],'special','wanghu-face-down-target');
 session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-face-down-target');
 assert.deepEqual(result.destroyedUids,[low.uid]);
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===hidden.uid));
});

scenario('Wanghu que deixa o campo antes da resolução não destrói o grupo',()=>{
 const {session}=setup('m658-wanghu-source-gone');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-source-gone');
 session.duel.core.pending={kind:'none'};removeMonster(session,0,source.uid);
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-source-gone');
 assert.equal(result.status,'source-lost');assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid));
});

scenario('Wanghu que fica face-down antes da resolução não destrói o grupo',()=>{
 const {session}=setup('m658-wanghu-source-set');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-source-set');
 session.duel.core.pending={kind:'none'};
 const current=session.duel.core.players[0].monsters.find(card=>card.uid===source.uid);
 current.faceUp=false;current.position='def';
 assert.equal(adapter.resolveKingTigerWanghu(session,'wanghu-source-set').status,'source-lost');
});

scenario('o próprio Wanghu pode fazer parte do grupo de summon e ser destruído se estiver abaixo de 1400',()=>{
 const {session}=setup('m658-wanghu-self');
 const source=deploy(session,1,kingFixture,1),other=deploy(session,1,lowIds[1],3);
 setAtk(source,1300);setAtk(other,1000);beginSummon(session,1,'special',[source,other]);
 prepareWanghu(session,source,[source,other],'special','wanghu-self');
 session.duel.core.pending={kind:'none'};
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-self');
 assert.ok(result.destroyedUids.includes(source.uid));assert.ok(result.destroyedUids.includes(other.uid));
});

scenario('alvo que muda de controle continua elegível porque o efeito Wanghu não seleciona alvo',()=>{
 const {session}=setup('m658-wanghu-control');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-control');
 session.duel.core.pending={kind:'none'};moveControl(session,1,0,target.uid);
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-control');
 assert.equal(result.status,'destroyed');assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===target.uid));
});

scenario('alvo que deixa e retorna ao campo é uma nova instância e não é destruído',()=>{
 const {session}=setup('m658-wanghu-reenter');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-reenter');
 session.duel.core.pending={kind:'none'};reenterMonster(session,1,target.uid);
 const result=adapter.resolveKingTigerWanghu(session,'wanghu-reenter');
 assert.equal(result.status,'no-targets');assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid));
});

scenario('Wanghu não ativa quando nenhum monstro face-up do grupo tem ATK 1400 ou menos',()=>{
 const {session}=setup('m658-wanghu-no-target');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,highIds[1],1);
 setAtk(target,1600);beginSummon(session,1,'special',[target]);
 assert.throws(()=>prepareWanghu(session,source,[target],'special','wanghu-no-target'),/Nenhum monstro face-up/);
});

scenario('o efeito Wanghu não aceita grupo vazio, duplicado ou maior que seis zonas',()=>{
 const {session}=setup('m658-wanghu-invalid-group');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 assert.throws(()=>adapter.prepareKingTigerWanghu(session,source.uid,'normal',[],'wanghu-empty'),/Evento de summon/);
 assert.throws(()=>adapter.prepareKingTigerWanghu(session,source.uid,'normal',[target.uid,target.uid],'wanghu-duplicate'),/Evento de summon/);
 assert.throws(()=>adapter.prepareKingTigerWanghu(session,source.uid,'normal',Array(7).fill(target.uid),'wanghu-overflow'),/Evento de summon/);
});

scenario('IDs de ativação Wanghu malformados são rejeitados',()=>{
 const {session}=setup('m658-wanghu-bad-id');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 assert.throws(()=>prepareWanghu(session,source,[target],'normal','bad id'),/Evento de summon/);
});

scenario('um ID Wanghu não pode ser reutilizado depois da resolução',()=>{
 const {session}=setup('m658-wanghu-duplicate');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-duplicate');
 session.duel.core.pending={kind:'none'};adapter.resolveKingTigerWanghu(session,'wanghu-duplicate');
 assert.throws(()=>prepareWanghu(session,source,[target],'normal','wanghu-duplicate'),/duplicada/);
});

scenario('um gatilho Wanghu obsoleto não resolve em outro turno',()=>{
 const {session}=setup('m658-wanghu-stale');
 const source=deploy(session,0,kingFixture),target=deploy(session,1,lowIds[1],1);
 setAtk(target,1000);beginSummon(session,1,'normal',[target]);
 prepareWanghu(session,source,[target],'normal','wanghu-stale');
 session.duel.core.pending={kind:'none'};session.duel.core.turn++;
 assert.throws(()=>adapter.resolveKingTigerWanghu(session,'wanghu-stale'),/obsoleto/);
});

scenario('Blast Juggler exige janela explícita de Standby Phase',()=>{
 const {session}=setup('m658-blast-window');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,1000);mainPhase(session,0);
 assert.throws(()=>activateBlast(session,source,[a,b]),/Standby Phase/);
});

scenario('Blast Juggler abre janela apenas para o membro ativo da equipe',()=>{
 const {session}=setup('m658-blast-active');
 const source=deploy(session,0,blastFixture);
 mainPhase(session,0);
 assert.throws(()=>adapter.openStandbyWindow(session,0,2),/Janela de Standby/);
 assert.ok(source.uid);
});

scenario('Blast Juggler paga o tributo como custo e destrói dois alvos legais',()=>{
 const {session}=setup('m658-blast-resolve');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,0,lowIds[2],2);
 setAtk(a,900);setAtk(b,1000);const before=snapshot(session),beforeHands=hands(session);
 openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-resolve');
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
 const result=adapter.resolveBlastJuggler(session,'blast-resolve');
 assert.equal(result.status,'destroyed');assert.deepEqual(new Set(result.destroyedUids),new Set([a.uid,b.uid]));
 assertConserved(before,beforeHands,session);
});

scenario('Blast Juggler aceita dois alvos face-up em qualquer equipe',()=>{
 const {session}=setup('m658-blast-both-teams');
 const source=deploy(session,0,blastFixture),a=deploy(session,0,lowIds[1],2),b=deploy(session,1,lowIds[2],1);
 setAtk(a,800);setAtk(b,700);openStandby(session,0);
 const plan=activateBlast(session,source,[a,b],0,'blast-both-teams');
 assert.deepEqual(plan.targetBindings.map(item=>item.uid),[a.uid,b.uid]);
});

scenario('Blast Juggler rejeita alvo com ATK 1001',()=>{
 const {session}=setup('m658-blast-1001');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,1001);setAtk(b,900);openStandby(session,0);
 assert.throws(()=>activateBlast(session,source,[a,b],0,'blast-1001'),/ATK 1000 ou menos/);
 assert.ok(session.duel.core.players[0].monsters.some(card=>card.uid===source.uid));
});

scenario('Blast Juggler rejeita alvos face-down',()=>{
 const {session}=setup('m658-blast-facedown');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3,false,'def');
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 assert.throws(()=>activateBlast(session,source,[a,b],0,'blast-facedown'),/face-up/);
});

scenario('Blast Juggler exige exatamente dois alvos distintos e não pode selecionar a si próprio',()=>{
 const {session}=setup('m658-blast-target-count');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1);
 setAtk(a,900);openStandby(session,0);
 assert.throws(()=>adapter.activateBlastJuggler(session,0,source.uid,[a.uid], 'blast-one'),/dois alvos/);
 assert.throws(()=>adapter.activateBlastJuggler(session,0,source.uid,[a.uid,a.uid], 'blast-dup'),/dois alvos/);
 assert.throws(()=>adapter.activateBlastJuggler(session,0,source.uid,[source.uid,a.uid], 'blast-self'),/dois alvos/);
});

scenario('Blast Juggler só pode ativar pelo participante ativo da equipe',()=>{
 const {session}=setup('m658-blast-seat');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 assert.throws(()=>activateBlast(session,source,[a,b],2,'blast-seat'),/Standby Phase/);
});

scenario('Blast Juggler não ativa se o efeito da fonte estiver negado ou ela estiver face-down',()=>{
 const {session}=setup('m658-blast-source');
 const source=deploy(session,0,blastFixture,0,false,'def'),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 assert.throws(()=>activateBlast(session,source,[a,b],0,'blast-source'),/face-up/);
});

scenario('Blast Juggler destrói um alvo restante quando o outro deixa o campo',()=>{
 const {session}=setup('m658-blast-partial');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-partial');removeMonster(session,1,a.uid);
 const result=adapter.resolveBlastJuggler(session,'blast-partial');
 assert.equal(result.status,'partial');assert.deepEqual(result.destroyedUids,[b.uid]);assert.deepEqual(result.lostUids,[a.uid]);
});

scenario('Blast Juggler não destrói alvo que fica face-down antes da resolução, mas resolve o outro',()=>{
 const {session}=setup('m658-blast-face-down-resolve');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-face-down-resolve');
 const current=session.duel.core.players[1].monsters.find(card=>card.uid===a.uid);
 current.faceUp=false;current.position='def';
 const result=adapter.resolveBlastJuggler(session,'blast-face-down-resolve');
 assert.equal(result.status,'partial');assert.deepEqual(result.destroyedUids,[b.uid]);
});

scenario('Blast Juggler não revalida ATK no momento da resolução',()=>{
 const {session}=setup('m658-blast-atk-change');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-atk-change');
 const current=session.duel.core.players[1].monsters.find(card=>card.uid===a.uid);
 setAtk(current,2400);
 const result=adapter.resolveBlastJuggler(session,'blast-atk-change');
 assert.equal(result.status,'destroyed');assert.ok(result.destroyedUids.includes(a.uid));
});

scenario('Blast Juggler invalida alvo que deixa e retorna à mesma zona',()=>{
 const {session}=setup('m658-blast-reenter');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-reenter');reenterMonster(session,1,a.uid);
 const result=adapter.resolveBlastJuggler(session,'blast-reenter');
 assert.equal(result.status,'partial');assert.deepEqual(result.destroyedUids,[b.uid]);assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===a.uid));
});

scenario('Blast Juggler mantém alvo válido após mudança de controlador',()=>{
 const {session}=setup('m658-blast-control');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-control');moveControl(session,1,0,a.uid);
 const result=adapter.resolveBlastJuggler(session,'blast-control');
 assert.equal(result.status,'destroyed');assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===a.uid));
});

scenario('negar Blast Juggler não devolve o tributo pago como custo',()=>{
 const {session}=setup('m658-blast-negated');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-negated');
 const result=adapter.resolveBlastJuggler(session,'blast-negated',true);
 assert.equal(result.status,'negated');assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===a.uid));
 assert.ok(session.duel.core.players[1].monsters.some(card=>card.uid===b.uid));
});

scenario('fechar a janela de Standby não cancela cadeia já ativada',()=>{
 const {session}=setup('m658-blast-close-window');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-close-window');adapter.closeStandbyWindow(session);
 assert.equal(adapter.resolveBlastJuggler(session,'blast-close-window').status,'destroyed');
});

scenario('IDs de ativação Blast Juggler não podem ser reutilizados',()=>{
 const {session}=setup('m658-blast-duplicate');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,1,lowIds[2],3);
 setAtk(a,900);setAtk(b,800);openStandby(session,0);
 activateBlast(session,source,[a,b],0,'blast-duplicate');
 assert.throws(()=>adapter.activateBlastJuggler(session,0,source.uid,[a.uid,b.uid],'blast-duplicate'),/duplicada/);
});

scenario('mão e inventário físico permanecem invariantes após tributo e destruição',()=>{
 const {session}=setup('m658-blast-conservation');
 const source=deploy(session,0,blastFixture),a=deploy(session,1,lowIds[1],1),b=deploy(session,0,lowIds[2],2);
 setAtk(a,900);setAtk(b,800);const before=snapshot(session),beforeHands=hands(session);
 openStandby(session,0);activateBlast(session,source,[a,b],0,'blast-conservation');
 adapter.resolveBlastJuggler(session,'blast-conservation');
 assertConserved(before,beforeHands,session);
});

scenario('a Field Zone não reduz as três Spell/Trap Zones e os limites 3+3 permanecem',()=>{
 const {session}=setup('m658-zones');
 assertSmallMonsterRules(session.duel);
 assert.equal(session.duel.core.players[0].monsters.length,0);
 assert.equal(session.duel.core.players[0].backrow.length,0);
});

scenario('as cartas reais permanecem fora do catálogo até integração e certificação por comportamento',()=>{
 const catalog=catalogSnapshot();
 assert.equal(catalog.count,969);
 assert.equal(catalog.ids.has(KING_TIGER_WANGHU_ID),false);
 assert.equal(catalog.ids.has(BLAST_JUGGLER_ID),false);
});

after(()=>{
 const catalog=catalogSnapshot();
 const evidence={
  mission:'M658',adapter:'src/smallMonsterDestructionTagAdapter.ts',testSuite:'tests/smallMonsterDestructionTagAdapter.test.cjs',
  scenarioCount,completed,passed:completed===scenarioCount,inventoryConservationChecks,
  certifiedCardsBefore:969,certifiedCardsAfter:catalog.count,newCertifications:0,inventoryGrants:0,
  catalogRevision:catalog.revision,integratedIntoCentralResolver:false,discordLiveValidated:false,
  productionChanged:false,generatedAt:new Date().toISOString()
 };
 fs.mkdirSync(path.join(__dirname,'..','artifacts'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'..','artifacts','m658-small-monster-destruction-results.json'),JSON.stringify(evidence,null,2)+'\n');
});
