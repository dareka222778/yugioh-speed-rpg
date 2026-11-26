import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {engineCard,getDuelCard} from './effectRegistry';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import type {DuelState} from './duelEngine';
import {specialSummonFromPile} from './monsterEntry';
import {shuffleDuel} from './duelRandom';

export const GIANT_RAT_ID='97077563';
export const GIANT_GERM_ID='95178994';
export const NIMBLE_MOMONGA_ID='22567609';

export type BattleRecruitTeam=0|1;
export type BattleRecruitSeat=0|1|2|3;
export type BattleRecruitEffect='giant-rat'|'giant-germ'|'nimble-momonga';
export type BattleRecruitLookup=(id:string)=>{kind:'monster';effect:BattleRecruitEffect}|undefined;
export type BattleDestructionReceipt={
 battleId:string;sourceUid:string;controllerTeam:BattleRecruitTeam;actorSeat:BattleRecruitSeat;turn:number;
 destroyedByBattle:true;sentToGrave:true;sourceWasBattleParticipant:true;
};
export type BattleRecruitPlan={
 activationId:string;battleId:string;sourceUid:string;sourceOwnerSeat:BattleRecruitSeat;
 controllerTeam:BattleRecruitTeam;deckSeat:BattleRecruitSeat;effect:BattleRecruitEffect;turn:number;
};
export type BattleRecruitResolution={
 activationId:string;battleId:string;sourceUid:string;effect:BattleRecruitEffect;
 status:'summoned'|'no-summon'|'negated'|'lethal';summonedUids:string[];
 damage:number;lifeGained:number;turn:number;
};
export type BattleRecruitSession={
 duel:TagDuel;pending:Record<string,BattleRecruitPlan>;
 resolved:Record<string,BattleRecruitResolution>;usedSourceEvents:Record<string,string>;
};

export const defaultBattleRecruitLookup:BattleRecruitLookup=(id)=>{
 if(id===GIANT_RAT_ID)return {kind:'monster',effect:'giant-rat'};
 if(id===GIANT_GERM_ID)return {kind:'monster',effect:'giant-germ'};
 if(id===NIMBLE_MOMONGA_ID)return {kind:'monster',effect:'nimble-momonga'};
 return undefined;
};
function validTeam(value:unknown):value is BattleRecruitTeam{return value===0||value===1;}
function physicalSeat(uid:string):BattleRecruitSeat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as BattleRecruitSeat:null;
}
function validId(value:unknown):value is string{
 return typeof value==='string'&&value.trim().length>0&&value.length<=128&&/^[-a-zA-Z0-9:_]+$/.test(value);
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||
  duel.core.players.length!==2||!Array.isArray(duel.active)||duel.active.length!==2||
  !Array.isArray(duel.members)||duel.members.length!==4||!duel.reserves||
  !duel.core.teamRotation||!Array.isArray(duel.core.chain)){
  throw new Error('O adapter exige TagDuel clássico 2v2.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid)||physicalSeat(card.uid)===null)throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function handSnapshot(duel:TagDuel):string[]{
 const result:string[]=[];
 for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('A operação alterou uma mão privada.');
}
export function assertBattleRecruitRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!engineCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Extra Deck excedeu cinco cartas no assento '+seat+'.');
 }
}
function assertSession(session:BattleRecruitSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||!session.usedSourceEvents)
  throw new Error('Sessão M659 inválida.');
 assertTagDuel(session.duel);assertBattleRecruitRules(session.duel);
}
function assertReceipt(value:BattleDestructionReceipt):void{
 if(!value||!validId(value.battleId)||typeof value.sourceUid!=='string'||!value.sourceUid||
  !validTeam(value.controllerTeam)||!Number.isInteger(value.actorSeat)||value.actorSeat<0||value.actorSeat>3||
  !Number.isSafeInteger(value.turn)||value.turn<1||value.destroyedByBattle!==true||
  value.sentToGrave!==true||value.sourceWasBattleParticipant!==true){
  throw new Error('Recibo de destruição em batalha inválido.');
 }
}
function candidateCard(duel:TagDuel,team:BattleRecruitTeam,uid:string){
 const ref=duel.core.players[team].deck.find(card=>card.uid===uid);
 if(!ref)return undefined;
 const info=engineCard(ref.id),presented=getDuelCard(ref.id);
 if(!info||presented?.kind!=='monster'||info.kind!=='monster'||info.fusion)return undefined;
 return {ref,info};
}
function finishByLifePoints(core:DuelState,winnerTeam:BattleRecruitTeam|null):void{
 delete core.movementSelection;delete core.afterEffectFlips;delete core.effectFlips;delete core.ritual;
 delete core.standby;delete core.triggerBuild;delete core.chainRoot;delete core.choice;delete core.handFlow;
 delete core.battleFlip;core.graveTriggers=[];core.summonTriggers=[];core.chain=[];core.pending={kind:'none'};
 core.damageStep=undefined;core.turnEnding=false;core.phase='finished';
 core.winner=winnerTeam===null?null:core.players[winnerTeam].id;core.reason='pontos de vida';
 core.log.push(winnerTeam===null?'Duelo empatado: pontos de vida.':core.players[winnerTeam].name+' venceu: pontos de vida.');
}

export function createBattleRecruitAdapter(lookup:BattleRecruitLookup=defaultBattleRecruitLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):BattleRecruitSession{
  assertTagDuel(duel);assertBattleRecruitRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:{},usedSourceEvents:{}};
 }
 function prepareBattleRecruit(session:BattleRecruitSession,receipt:BattleDestructionReceipt,activationId:string):BattleRecruitPlan{
  assertSession(session);assertReceipt(receipt);
  const core=session.duel.core;
  if(core.phase==='finished'||receipt.turn!==core.turn)throw new Error('Evento de batalha obsoleto.');
  if(!validId(activationId)||Object.prototype.hasOwnProperty.call(session.pending,activationId)||
   Object.prototype.hasOwnProperty.call(session.resolved,activationId)){
   throw new Error('ID de ativação inválido ou reutilizado.');
  }
  const ownerSeat=physicalSeat(receipt.sourceUid);
  if(ownerSeat===null)throw new Error('UID físico da fonte inválido.');
  const ownerTeam=(ownerSeat%2) as BattleRecruitTeam;
  if(receipt.controllerTeam!==ownerTeam)throw new Error('O efeito no Cemitério pertence à equipe do proprietário físico.');
  const activeSeat=session.duel.active[ownerTeam];
  if(receipt.actorSeat!==activeSeat)throw new Error('Somente o membro ativo da equipe pode resolver o gatilho.');
  const source=core.players[ownerTeam].grave.find(card=>card.uid===receipt.sourceUid);
  const info=source&&engineCard(source.id),definition=source&&lookup(source.id);
  if(!source||info?.kind!=='monster'||definition?.kind!=='monster')
   throw new Error('A fonte precisa estar no Cemitério do proprietário após destruição em batalha.');
  const sourceEventKey=receipt.battleId+':'+receipt.sourceUid;
  if(Object.prototype.hasOwnProperty.call(session.usedSourceEvents,sourceEventKey))
   throw new Error('Este monstro já gerou um gatilho nesta batalha.');
  const plan:BattleRecruitPlan={
   activationId,battleId:receipt.battleId,sourceUid:receipt.sourceUid,sourceOwnerSeat:ownerSeat,
   controllerTeam:ownerTeam,deckSeat:activeSeat,effect:definition.effect,turn:core.turn
  };
  session.pending[activationId]=structuredClone(plan);session.usedSourceEvents[sourceEventKey]=activationId;
  return structuredClone(plan);
 }
 function resolveBattleRecruit(session:BattleRecruitSession,activationId:string,selectedUids:string[]=[],negated=false):BattleRecruitResolution{
  assertSession(session);
  const previous=session.resolved[activationId];if(previous)return structuredClone(previous);
  const plan=session.pending[activationId];if(!plan)throw new Error('Não existe gatilho M659 pendente.');
  if(session.duel.core.turn!==plan.turn||session.duel.active[plan.controllerTeam]!==plan.deckSeat)
   throw new Error('O turno ou o assento do Deck mudou antes da resolução.');
  if(!Array.isArray(selectedUids)||selectedUids.length>RULES_PROFILE.monsterZones||
   selectedUids.some(uid=>typeof uid!=='string'||!uid)||new Set(selectedUids).size!==selectedUids.length)
   throw new Error('Seleção de Deck inválida.');
  if(plan.effect==='giant-rat'&&selectedUids.length>1)
   throw new Error('Giant Rat pode Invocar apenas um monstro.');
  const working=structuredClone(session.duel),core=working.core,team=plan.controllerTeam;
  const before=inventorySnapshot(session.duel),handsBefore=handSnapshot(session.duel);
  const available=RULES_PROFILE.monsterZones-core.players[team].monsters.length;
  if(selectedUids.length>available)throw new Error('A seleção excede as Monster Zones disponíveis.');
  if(!negated){
   for(const uid of selectedUids){
    const candidate=candidateCard(working,team,uid);
    if(!candidate)throw new Error('A carta escolhida não está no Deck ativo ou não pode ser Invocada.');
    if(plan.effect==='giant-rat'){
     if(candidate.info.attribute!=='EARTH'||!Number.isSafeInteger(candidate.info.atk)||candidate.info.atk!>1500)
      throw new Error('Giant Rat exige monstro EARTH com ATK 1500 ou menos.');
    }else if(lookup(candidate.ref.id)?.effect!==plan.effect){
     throw new Error('A carta escolhida não corresponde ao nome exigido pelo efeito.');
    }
   }
  }
  let damage=0,lifeGained=0,status:BattleRecruitResolution['status']='no-summon';
  const summonedUids:string[]=[];
  if(negated)status='negated';
  else{
   if(plan.effect==='giant-germ'){
    damage=500;const opponent=core.players[1-team];opponent.lp=Math.max(0,opponent.lp-damage);
    if(opponent.lp===0){
     const winner=core.players[team].lp<=0?null:team;finishByLifePoints(core,winner);status='lethal';
    }
   }else if(plan.effect==='nimble-momonga'){
    lifeGained=1000;core.players[team].lp+=lifeGained;
   }
   if(status!=='lethal'){
    for(const uid of selectedUids){
     const position=plan.effect==='nimble-momonga'?'def':'atk';
     const monster=specialSummonFromPile(core,team,team,'deck',uid,position);
     if(!monster)throw new Error('A Invocação-Especial deixou de ser legal.');
     if(plan.effect==='nimble-momonga')monster.faceUp=false;
     summonedUids.push(uid);
    }
    if(summonedUids.length)shuffleDuel(core.players[team].deck,core);
    if(summonedUids.length)status='summoned';
   }
  }
  const result:BattleRecruitResolution={activationId,battleId:plan.battleId,sourceUid:plan.sourceUid,
   effect:plan.effect,status,summonedUids,damage,lifeGained,turn:plan.turn};
  session.duel=working;delete session.pending[activationId];session.resolved[activationId]=structuredClone(result);
  assertSameInventory(before,session.duel);assertHandsUnchanged(handsBefore,session.duel);
  assertBattleRecruitRules(session.duel);assertTagDuel(session.duel);
  return structuredClone(result);
 }
 return {createSession,prepareBattleRecruit,resolveBattleRecruit};
}
