import type {Backrow,Monster,DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard,getEffect} from './effectRegistry';
import {bindTarget,targetBindingValid,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';
import {cardActivationAllowed,canAffectMonster,continuousTrapActivationsBlocked,continuousTrapsNegated,monsterEffectsNegated} from './continuousEffects';

export const DARK_RULER_HA_DES_ID='53982768';
export const DARK_RULER_HA_DES_KONAMI_CID=5301;
export const DARK_BALTER_THE_TERRIBLE_ID='80071763';
export const DARK_BALTER_THE_TERRIBLE_KONAMI_CID=5302;
export const SKILL_DRAIN_ID='82732705';
export const SKILL_DRAIN_KONAMI_CID=5740;

export type FiendNegationTeam=0|1;
export type FiendNegationSeat=0|1|2|3;
export type FiendNegationEffect='ha-des'|'dark-balter'|'skill-drain';
export type FiendNegationLookup=(id:string)=>{kind:'monster'|'trap';effect:FiendNegationEffect}|undefined;
export type SkillDrainActivation={
 activationId:string;sourceUid:string;sourceTeam:FiendNegationTeam;sourceSeat:FiendNegationSeat;
 actorSeat:FiendNegationSeat;sourceBinding:TargetBinding;turn:number;lpPaid:number;status:'paid'|'duel-ended-by-cost';
};
export type SkillDrainResolution={
 activationId:string;sourceUid:string;status:'active'|'activation-negated'|'effect-negated'|'source-left-field'|'duel-ended-by-cost';
 lpPaid:number;replayed:boolean;
};
export type BalterSpellActivation={
 activationId:string;sourceUid:string;sourceTeam:FiendNegationTeam;sourceSeat:FiendNegationSeat;
 actorSeat:FiendNegationSeat;sourceBinding:TargetBinding;turn:number;spellActivationId:string;lpPaid:number;
 status:'paid'|'duel-ended-by-cost';
};
export type BalterSpellResolution={
 activationId:string;sourceUid:string;spellActivationId:string;
 status:'spell-effect-negated'|'effect-negated'|'activation-negated'|'source-left-field'|'duel-ended-by-cost';
 lpPaid:number;replayed:boolean;
};
export type BattleNegation={
 battleId:string;destroyerUid:string;destroyedUid:string;sourceUids:string[];
 status:'effect-negated'|'not-negated'|'not-effect-monster'|'not-battle-destruction';replayed:boolean;
};
export type FiendEffectNegationSession={
 duel:TagDuel;
 skillDrainActivations:Record<string,SkillDrainActivation>;
 skillDrainResolved:Record<string,SkillDrainResolution>;
 balterSpellActivations:Record<string,BalterSpellActivation>;
 balterSpellResolved:Record<string,BalterSpellResolution>;
 battleNegations:Record<string,BattleNegation>;
};

const isTeam=(v:unknown):v is FiendNegationTeam=>v===0||v===1;
const isSeat=(v:unknown):v is FiendNegationSeat=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3;
function assertId(v:unknown,label:string,max=128):asserts v is string{
 if(typeof v!=='string'||!v.trim()||v.length>max||!/^[a-zA-Z0-9:_-]+$/.test(v))throw new Error(label+' inválido.');
}
function teamForSeat(seat:FiendNegationSeat):FiendNegationTeam{return (seat%2) as FiendNegationTeam;}
function physicalSeat(uid:string):FiendNegationSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as FiendNegationSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2||!duel.core.teamRotation||
  !Array.isArray(duel.core.chain)||!duel.reserves)throw new Error('Estrutura física TagDuel incompleta.');
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(c=>c.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null||duel.members[seat]?.team!==teamForSeat(seat)||result.has(card.uid))throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
/** Rechecks physical deck sizes and the owner's immutable classic field layout. */
export function assertFiendEffectNegationRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode passar de seis durante uma resolução; o limite só é aplicado na End Phase.
}
function findMonster(duel:TagDuel,uid:string):{team:FiendNegationTeam;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(m=>m.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function findBackrow(duel:TagDuel,uid:string):{team:FiendNegationTeam;card:Backrow}|undefined{
 for(const team of [0,1] as const){const card=duel.core.players[team].backrow.find(c=>c.uid===uid);if(card)return {team,card};}
 return undefined;
}
function assertActiveSeat(duel:TagDuel,team:FiendNegationTeam,seat:FiendNegationSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.cursor!==seat||duel.active[team]!==seat||teamForSeat(seat)!==team){
  throw new Error('A ação pertence ao assento ativo da equipe controladora.');
 }
}
function assertResponseWindow(duel:TagDuel,team:FiendNegationTeam):void{
 const core=duel.core;
 if(!['main','battle','response'].includes(core.phase)||core.turnEnding||core.damageStep||
  core.priority!==team||core.phase==='finished')throw new Error('A negação exige uma janela de resposta válida fora da Etapa de Dano.');
}
function finishByCost(core:DuelState,team:FiendNegationTeam):void{
 core.phase='finished';core.winner=core.players[1-team].id;core.reason='pontos de vida';
 core.pending={kind:'none'};core.chain=[];core.choice=undefined;core.handFlow=undefined;
 core.triggerBuild=undefined;core.graveTriggers=[];core.summonTriggers=[];core.battleFlip=undefined;
}
function moveTrapToOwnerGrave(duel:TagDuel,uid:string):boolean{
 const location=findBackrow(duel,uid),ownerSeat=physicalSeat(uid);
 if(!location||ownerSeat===null)return false;
 locationTeamBackrow(duel,location.team,uid);
 duel.core.players[ownerSeat%2].grave.push({uid:location.card.uid,id:location.card.id});
 synchronizeCardLifetimes(duel.core);return true;
}
function locationTeamBackrow(duel:TagDuel,team:FiendNegationTeam,uid:string):void{
 duel.core.players[team].backrow=duel.core.players[team].backrow.filter(card=>card.uid!==uid);
}
function skillDrainSources(duel:TagDuel,lookup:FiendNegationLookup):string[]{
 if(continuousTrapsNegated(duel.core))return [];
 return duel.core.players.flatMap(player=>player.backrow
  .filter(card=>card.faceUp&&card.resolved===true&&lookup(card.id)?.kind==='trap'&&lookup(card.id)?.effect==='skill-drain')
  .map(card=>card.uid));
}
function skillDrainNegatesMonster(duel:TagDuel,uid:string,lookup:FiendNegationLookup):boolean{
 const found=findMonster(duel,uid);
 return !!found?.monster.faceUp&&skillDrainSources(duel,lookup).length>0&&canAffectMonster(duel.core,uid,'trap');
}
function otherMonsterNegation(duel:TagDuel,uid:string,lookup:FiendNegationLookup):boolean{
 return skillDrainNegatesMonster(duel,uid,lookup)||monsterEffectsNegated(duel.core,uid);
}
function assertSession(session:FiendEffectNegationSession):void{
 if(!session||!session.duel||!session.skillDrainActivations||!session.skillDrainResolved||
  !session.balterSpellActivations||!session.balterSpellResolved||!session.battleNegations)throw new Error('Sessão M682 inválida.');
 assertFiendEffectNegationRules(session.duel);
 for(const [id,activation] of Object.entries(session.skillDrainActivations)){
  if(!activation||activation.activationId!==id||!isSeat(activation.actorSeat)||!isSeat(activation.sourceSeat)||
   !isTeam(activation.sourceTeam)||!Number.isSafeInteger(activation.turn)||!Number.isSafeInteger(activation.lpPaid))throw new Error('Ativação Skill Drain inválida.');
 }
}
export const defaultFiendNegationLookup:FiendNegationLookup=(id)=>{
 if(id===DARK_RULER_HA_DES_ID)return {kind:'monster',effect:'ha-des'};
 if(id===DARK_BALTER_THE_TERRIBLE_ID)return {kind:'monster',effect:'dark-balter'};
 if(id===SKILL_DRAIN_ID)return {kind:'trap',effect:'skill-drain'};
 return undefined;
};
export function createFiendEffectNegationAdapter(lookup:FiendNegationLookup=defaultFiendNegationLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):FiendEffectNegationSession{
  assertFiendEffectNegationRules(duel);
  return {duel:structuredClone(duel),skillDrainActivations:{},skillDrainResolved:{},balterSpellActivations:{},balterSpellResolved:{},battleNegations:{}};
 }
 function activeSources(duel:TagDuel){
  assertFiendEffectNegationRules(duel);
  const skillDrainUids=skillDrainSources(duel,lookup);
  const haDesUids=duel.core.players.flatMap(player=>player.monsters
   .filter(monster=>monster.faceUp&&lookup(monster.id)?.effect==='ha-des'&&!otherMonsterNegation(duel,monster.uid,lookup))
   .map(monster=>monster.uid));
  const darkBalterUids=duel.core.players.flatMap(player=>player.monsters
   .filter(monster=>monster.faceUp&&lookup(monster.id)?.effect==='dark-balter'&&!otherMonsterNegation(duel,monster.uid,lookup))
   .map(monster=>monster.uid));
  return {skillDrainUids,haDesUids,darkBalterUids};
 }
 /** Skill Drain negates face-up monster effects, but never prohibits their activation. */
 function monsterEffectActivationAllowed(duel:TagDuel,_uid:string):boolean{
  assertFiendEffectNegationRules(duel);return true;
 }
 function monsterEffectNegated(duel:TagDuel,uid:string):boolean{
  assertFiendEffectNegationRules(duel);return otherMonsterNegation(duel,uid,lookup);
 }
 function activateSkillDrain(session:FiendEffectNegationSession,activationId:string,sourceUid:string,actorSeat:FiendNegationSeat):SkillDrainActivation{
  assertSession(session);assertId(activationId,'ID de ativação');assertId(sourceUid,'UID da fonte');
  const previous=session.skillDrainActivations[activationId];
  if(previous){
   if(previous.sourceUid!==sourceUid||previous.actorSeat!==actorSeat)throw new Error('ID de ativação Skill Drain reutilizado com fatos diferentes.');
   return {...previous};
  }
  const location=findBackrow(session.duel,sourceUid),ownerSeat=physicalSeat(sourceUid);
  if(!location||location.card.faceUp||location.card.setTurn>=session.duel.core.turn||lookup(location.card.id)?.effect!=='skill-drain'||ownerSeat===null){
   throw new Error('Skill Drain deve estar Baixada desde um turno anterior.');
  }
  const team=location.team;assertActiveSeat(session.duel,team,actorSeat);assertResponseWindow(session.duel,team);
  if(continuousTrapActivationsBlocked(session.duel.core)||!cardActivationAllowed(session.duel.core,team,'trap')){
   throw new Error('A ativação de Armadilhas está bloqueada.');
  }
  const working=structuredClone(session.duel),workingLocation=findBackrow(working,sourceUid)!;
  const lpBefore=working.core.players[team].lp;
  if(lpBefore<1000)throw new Error('PV insuficientes para pagar 1000.');
  const sourceBinding=bindTarget(working.core,sourceUid);
  if(!sourceBinding||sourceBinding.zone!=='backrow')throw new Error('Vínculo físico da Armadilha inválido.');
  working.core.players[team].lp-=1000;
  workingLocation.card.faceUp=true;workingLocation.card.resolved=false;
  const status:SkillDrainActivation['status']=working.core.players[team].lp===0?'duel-ended-by-cost':'paid';
  if(status==='duel-ended-by-cost')finishByCost(working.core,team);
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(inventorySnapshot(session.duel),working);
  const receipt:SkillDrainActivation={activationId,sourceUid,sourceTeam:team,sourceSeat:ownerSeat,actorSeat,
   sourceBinding,turn:working.core.turn,lpPaid:1000,status};
  session.duel=working;session.skillDrainActivations[activationId]=structuredClone(receipt);
  return {...receipt};
 }
 function resolveSkillDrain(session:FiendEffectNegationSession,activationId:string,options:{activationNegated?:boolean;effectNegated?:boolean}={}):SkillDrainResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.skillDrainResolved[activationId];if(previous)return {...previous,replayed:true};
  const activation=session.skillDrainActivations[activationId];if(!activation)throw new Error('Ativação Skill Drain inexistente.');
  if(activation.status==='duel-ended-by-cost'){
   const result:SkillDrainResolution={activationId,sourceUid:activation.sourceUid,status:'duel-ended-by-cost',lpPaid:activation.lpPaid,replayed:false};
   session.skillDrainResolved[activationId]=result;return {...result};
  }
  const location=findBackrow(session.duel,activation.sourceUid);
  if(!location||!location.card.faceUp||!targetBindingValid(session.duel.core,activation.sourceBinding)){
   const result:SkillDrainResolution={activationId,sourceUid:activation.sourceUid,status:'source-left-field',lpPaid:activation.lpPaid,replayed:false};
   session.skillDrainResolved[activationId]=result;return {...result};
  }
  if(options.activationNegated){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);
   assertTagDuel(session.duel);
   const result:SkillDrainResolution={activationId,sourceUid:activation.sourceUid,status:'activation-negated',lpPaid:activation.lpPaid,replayed:false};
   session.skillDrainResolved[activationId]=result;return {...result};
  }
  location.card.faceUp=true;location.card.resolved=true;
  const status=options.effectNegated||continuousTrapsNegated(session.duel.core)?'effect-negated':'active';
  const result:SkillDrainResolution={activationId,sourceUid:activation.sourceUid,status,lpPaid:activation.lpPaid,replayed:false};
  session.skillDrainResolved[activationId]=result;return {...result};
 }
 function activateDarkBalterSpellNegation(session:FiendEffectNegationSession,input:{
  activationId:string;sourceUid:string;actorSeat:FiendNegationSeat;spellActivationId:string;
  spellType:'normal'|'quickplay'|'continuous'|'field'|'equip'|'ritual';
 }):BalterSpellActivation{
  assertSession(session);assertId(input.activationId,'ID de ativação');assertId(input.sourceUid,'UID da fonte');
  assertId(input.spellActivationId,'ID da ativação de Magia');
  const previous=session.balterSpellActivations[input.activationId];
  if(previous){
   if(previous.sourceUid!==input.sourceUid||previous.actorSeat!==input.actorSeat||previous.spellActivationId!==input.spellActivationId||input.spellType!=='normal'){
    throw new Error('ID de ativação Dark Balter reutilizado com fatos diferentes.');
   }
   return {...previous};
  }
  if(input.spellType!=='normal')throw new Error('Dark Balter só responde à ativação de uma Magia Normal.');
  const found=findMonster(session.duel,input.sourceUid),ownerSeat=physicalSeat(input.sourceUid);
  if(!found||!found.monster.faceUp||lookup(found.monster.id)?.effect!=='dark-balter'||ownerSeat===null){
   throw new Error('Dark Balter deve estar face-up no campo.');
  }
  assertActiveSeat(session.duel,found.team,input.actorSeat);assertResponseWindow(session.duel,found.team);
  const working=structuredClone(session.duel),lpBefore=working.core.players[found.team].lp;
  if(lpBefore<1000)throw new Error('PV insuficientes para pagar 1000.');
  const sourceBinding=bindTarget(working.core,input.sourceUid);
  if(!sourceBinding||sourceBinding.zone!=='monsters')throw new Error('Vínculo físico de Dark Balter inválido.');
  working.core.players[found.team].lp-=1000;
  const status:BalterSpellActivation['status']=working.core.players[found.team].lp===0?'duel-ended-by-cost':'paid';
  if(status==='duel-ended-by-cost')finishByCost(working.core,found.team);
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(inventorySnapshot(session.duel),working);
  const receipt:BalterSpellActivation={activationId:input.activationId,sourceUid:input.sourceUid,sourceTeam:found.team,sourceSeat:ownerSeat,
   actorSeat:input.actorSeat,sourceBinding,turn:working.core.turn,spellActivationId:input.spellActivationId,lpPaid:1000,status};
  session.duel=working;session.balterSpellActivations[input.activationId]=structuredClone(receipt);
  return {...receipt};
 }
 function resolveDarkBalterSpellNegation(session:FiendEffectNegationSession,activationId:string,options:{activationNegated?:boolean;effectNegated?:boolean}={}):BalterSpellResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.balterSpellResolved[activationId];if(previous)return {...previous,replayed:true};
  const activation=session.balterSpellActivations[activationId];if(!activation)throw new Error('Ativação Dark Balter inexistente.');
  if(activation.status==='duel-ended-by-cost'){
   const result:BalterSpellResolution={activationId,sourceUid:activation.sourceUid,spellActivationId:activation.spellActivationId,
    status:'duel-ended-by-cost',lpPaid:activation.lpPaid,replayed:false};
   session.balterSpellResolved[activationId]=result;return {...result};
  }
  const found=findMonster(session.duel,activation.sourceUid);
  if(!found||!targetBindingValid(session.duel.core,activation.sourceBinding)){
   const result:BalterSpellResolution={activationId,sourceUid:activation.sourceUid,spellActivationId:activation.spellActivationId,
    status:'source-left-field',lpPaid:activation.lpPaid,replayed:false};
   session.balterSpellResolved[activationId]=result;return {...result};
  }
  const status=options.activationNegated?'activation-negated':
   options.effectNegated||otherMonsterNegation(session.duel,activation.sourceUid,lookup)?'effect-negated':'spell-effect-negated';
  const result:BalterSpellResolution={activationId,sourceUid:activation.sourceUid,spellActivationId:activation.spellActivationId,
   status,lpPaid:activation.lpPaid,replayed:false};
  session.balterSpellResolved[activationId]=result;return {...result};
 }
 /** Apply after the battle-destruction fact is fixed, before queuing GY triggers. */
 function recordBattleDestruction(session:FiendEffectNegationSession,input:{
  battleId:string;destroyerUid:string;destroyedUid:string;destroyedByBattle:boolean;
 }):BattleNegation{
  assertSession(session);assertId(input.battleId,'ID de batalha');assertId(input.destroyerUid,'UID do atacante');
  assertId(input.destroyedUid,'UID do monstro destruído');
  const previous=session.battleNegations[input.battleId];
  if(previous){
   if(previous.destroyerUid!==input.destroyerUid||previous.destroyedUid!==input.destroyedUid)throw new Error('ID de batalha reutilizado com fatos diferentes.');
   return {...previous,replayed:true};
  }
  if(input.destroyedByBattle!==true){
   const result:BattleNegation={battleId:input.battleId,destroyerUid:input.destroyerUid,destroyedUid:input.destroyedUid,
    sourceUids:[],status:'not-battle-destruction',replayed:false};session.battleNegations[input.battleId]=result;return {...result};
  }
  const attacker=findMonster(session.duel,input.destroyerUid),target=findMonster(session.duel,input.destroyedUid);
  if(!attacker||!target)throw new Error('Os dois monstros devem estar no campo no registro de destruição.');
  if(attacker.team===target.team)throw new Error('Uma batalha válida precisa envolver equipes adversárias.');
  const targetCard=getDuelCard(target.monster.id),targetEffect=getEffect(target.monster.id);
  const effectMonster=targetCard?.kind==='monster'&&(targetCard.monsterType==='effect'||targetEffect?.kind==='monsterEffect');
  if(!effectMonster){
   const result:BattleNegation={battleId:input.battleId,destroyerUid:input.destroyerUid,destroyedUid:input.destroyedUid,
    sourceUids:[],status:'not-effect-monster',replayed:false};session.battleNegations[input.battleId]=result;return {...result};
  }
  const attackerCard=getDuelCard(attacker.monster.id),sourceUids:string[]=[];
  if(attackerCard?.race==='Fiend'){
   for(const team of [0,1] as const)for(const source of session.duel.core.players[team].monsters){
    if(team===attacker.team&&source.faceUp&&lookup(source.id)?.effect==='ha-des'&&!otherMonsterNegation(session.duel,source.uid,lookup))sourceUids.push(source.uid);
   }
  }
  if(attacker.monster.uid===input.destroyerUid&&attacker.monster.faceUp&&lookup(attacker.monster.id)?.effect==='dark-balter'&&
   !otherMonsterNegation(session.duel,attacker.monster.uid,lookup))sourceUids.push(attacker.monster.uid);
  const result:BattleNegation={battleId:input.battleId,destroyerUid:input.destroyerUid,destroyedUid:input.destroyedUid,
   sourceUids:[...new Set(sourceUids)],status:sourceUids.length?'effect-negated':'not-negated',replayed:false};
  session.battleNegations[input.battleId]=result;return {...result};
 }
 function isDestroyedMonsterEffectNegated(session:FiendEffectNegationSession,uid:string):boolean{
  assertSession(session);assertId(uid,'UID do monstro');
  return Object.values(session.battleNegations).some(row=>row.destroyedUid===uid&&row.status==='effect-negated');
 }
 return {createSession,activeSources,monsterEffectActivationAllowed,monsterEffectNegated,activateSkillDrain,resolveSkillDrain,
  activateDarkBalterSpellNegation,resolveDarkBalterSpellNegation,recordBattleDestruction,isDestroyedMonsterEffectNegated};
}
