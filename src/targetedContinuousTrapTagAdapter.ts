import type {Backrow,Monster,DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';
import {cardActivationAllowed,canAffectMonster,continuousTrapActivationsBlocked,continuousTrapsNegated} from './continuousEffects';

export const NIGHTMARE_WHEEL_ID='54704216';
export const NIGHTMARE_WHEEL_KONAMI_CID=5298;
export const SHADOW_SPELL_ID='29267084';
export const SHADOW_SPELL_KONAMI_CID=4675;

export type TargetedTrapTeam=0|1;
export type TargetedTrapSeat=0|1|2|3;
export type TargetedTrapEffect='nightmare-wheel'|'shadow-spell';
export type TargetedTrapLookup=(id:string)=>{kind:'trap';effect:TargetedTrapEffect}|undefined;
export type TargetedTrapActivation={
 activationId:string;sourceUid:string;targetUid:string;sourceTeam:TargetedTrapTeam;sourceSeat:TargetedTrapSeat;
 actorSeat:TargetedTrapSeat;targetTeam:TargetedTrapTeam;effect:TargetedTrapEffect;
 sourceBinding:TargetBinding;targetBinding:TargetBinding;turn:number;
};
export type TargetedTrapResolution={
 activationId:string;sourceUid:string;targetUid:string;
 status:'active'|'activation-negated'|'effect-negated'|'target-unaffected'|'source-left-field'|'target-left-field';
 replayed:boolean;
};
export type TargetedTrapActiveEffect={
 activationId:string;sourceUid:string;targetUid:string;effect:TargetedTrapEffect;
 sourceTeam:TargetedTrapTeam;sourceSeat:TargetedTrapSeat;targetTeam:TargetedTrapTeam;
};
export type TargetedTrapStandbyEntry={
 sourceUid:string;targetUid:string;damagedTeam:TargetedTrapTeam;damage:number;lpAfter:number;
};
export type TargetedTrapStandbyReceipt={
 eventId:string;turn:number;controllerTeam:TargetedTrapTeam;status:'applied'|'no-trigger'|'duel-ended';
 damageTotal:number;entries:TargetedTrapStandbyEntry[];replayed:boolean;
};
export type TargetedContinuousTrapSession={
 duel:TagDuel;
 activations:Record<string,TargetedTrapActivation>;
 resolutions:Record<string,TargetedTrapResolution>;
 standbyReceipts:Record<string,TargetedTrapStandbyReceipt>;
};

const isTeam=(v:unknown):v is TargetedTrapTeam=>v===0||v===1;
const isSeat=(v:unknown):v is TargetedTrapSeat=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3;
function assertId(v:unknown,label:string,max=128):asserts v is string{
 if(typeof v!=='string'||!v.trim()||v.length>max||!/^[a-zA-Z0-9:_-]+$/.test(v))throw new Error(label+' inválido.');
}
function teamForSeat(seat:TargetedTrapSeat):TargetedTrapTeam{return (seat%2) as TargetedTrapTeam;}
function physicalSeat(uid:string):TargetedTrapSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as TargetedTrapSeat:null;
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
export function assertTargetedContinuousTrapRules(duel:TagDuel):void{
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
function findMonster(duel:TagDuel,uid:string):{team:TargetedTrapTeam;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(m=>m.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function findBackrow(duel:TagDuel,uid:string):{team:TargetedTrapTeam;card:Backrow}|undefined{
 for(const team of [0,1] as const){const card=duel.core.players[team].backrow.find(c=>c.uid===uid);if(card)return {team,card};}
 return undefined;
}
function assertActiveSeat(duel:TagDuel,team:TargetedTrapTeam,seat:TargetedTrapSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.cursor!==seat||duel.active[team]!==seat||teamForSeat(seat)!==team){
  throw new Error('A ação pertence ao assento ativo da equipe controladora.');
 }
}
function assertResponseWindow(duel:TagDuel,team:TargetedTrapTeam):void{
 const core=duel.core;
 if(!['main','battle','response'].includes(core.phase)||core.turnEnding||core.damageStep||
  core.priority!==team||core.phase==='finished')throw new Error('A Armadilha exige uma janela de resposta válida fora da Etapa de Dano.');
}
function finishByDamage(core:DuelState,losingTeam:TargetedTrapTeam):void{
 core.phase='finished';core.winner=core.players[1-losingTeam].id;core.reason='pontos de vida';
 core.pending={kind:'none'};core.chain=[];core.choice=undefined;core.handFlow=undefined;
 core.triggerBuild=undefined;core.graveTriggers=[];core.summonTriggers=[];core.battleFlip=undefined;
}
function moveTrapToOwnerGrave(duel:TagDuel,uid:string):boolean{
 const location=findBackrow(duel,uid),ownerSeat=physicalSeat(uid);
 if(!location||ownerSeat===null)return false;
 duel.core.players[location.team].backrow=locationTeamBackrow(duel,location.team,uid);
 duel.core.players[ownerSeat%2].grave.push({uid:location.card.uid,id:location.card.id});
 synchronizeCardLifetimes(duel.core);return true;
}
function locationTeamBackrow(duel:TagDuel,team:TargetedTrapTeam,uid:string):Backrow[]{
 return duel.core.players[team].backrow.filter(card=>card.uid!==uid);
}
function assertSession(session:TargetedContinuousTrapSession):void{
 if(!session||!session.duel||!session.activations||!session.resolutions||!session.standbyReceipts)throw new Error('Sessão M684 inválida.');
 assertTargetedContinuousTrapRules(session.duel);
 for(const [id,activation] of Object.entries(session.activations)){
  if(!activation||activation.activationId!==id||!isSeat(activation.actorSeat)||!isSeat(activation.sourceSeat)||
   !isTeam(activation.sourceTeam)||!isTeam(activation.targetTeam)||!Number.isSafeInteger(activation.turn)||
   !['nightmare-wheel','shadow-spell'].includes(activation.effect))throw new Error('Ativação de Armadilha inválida.');
 }
}
export const defaultTargetedTrapLookup:TargetedTrapLookup=(id)=>{
 if(id===NIGHTMARE_WHEEL_ID)return {kind:'trap',effect:'nightmare-wheel'};
 if(id===SHADOW_SPELL_ID)return {kind:'trap',effect:'shadow-spell'};
 return undefined;
};

/**
 * Isolated policy adapter. The core engine currently represents Standby as an
 * explicit callback boundary rather than a distinct DuelState.phase; callers
 * must invoke resolveStandbyPhase from that trusted boundary.
 */
export function createTargetedContinuousTrapAdapter(lookup:TargetedTrapLookup=defaultTargetedTrapLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):TargetedContinuousTrapSession{
  assertTargetedContinuousTrapRules(duel);
  return {duel:structuredClone(duel),activations:{},resolutions:{},standbyReceipts:{}};
 }
 function activate(session:TargetedContinuousTrapSession,input:{activationId:string;sourceUid:string;targetUid:string;actorSeat:TargetedTrapSeat}):TargetedTrapActivation{
  assertSession(session);assertId(input?.activationId,'ID de ativação');assertId(input?.sourceUid,'UID da Armadilha');assertId(input?.targetUid,'UID do alvo');
  const previous=session.activations[input.activationId];
  if(previous){
   if(previous.sourceUid!==input.sourceUid||previous.targetUid!==input.targetUid||previous.actorSeat!==input.actorSeat)throw new Error('ID de ativação reutilizado com fatos diferentes.');
   return {...previous};
  }
  const location=findBackrow(session.duel,input.sourceUid),ownerSeat=physicalSeat(input.sourceUid);
  if(!location||location.card.faceUp||location.card.setTurn>=session.duel.core.turn||ownerSeat===null||
   getDuelCard(location.card.id)?.kind!=='trap')throw new Error('A Armadilha deve estar Baixada desde um turno anterior.');
  const effect=lookup(location.card.id)?.effect;
  if(!effect)throw new Error('A carta física não possui política M684.');
  const target=findMonster(session.duel,input.targetUid);
  if(!target||target.team===location.team)throw new Error('Escolha um monstro da equipe adversária.');
  if(effect==='shadow-spell'&&!target.monster.faceUp)throw new Error('Shadow Spell exige um monstro adversário com a face para cima.');
  assertActiveSeat(session.duel,location.team,input.actorSeat);assertResponseWindow(session.duel,location.team);
  if(continuousTrapActivationsBlocked(session.duel.core)||!cardActivationAllowed(session.duel.core,location.team,'trap')){
   throw new Error('A ativação de Armadilhas está bloqueada.');
  }
  if(!canAffectMonster(session.duel.core,input.targetUid,'trap'))throw new Error('O monstro alvo não pode ser afetado por Armadilhas.');
  const before=inventorySnapshot(session.duel),working=structuredClone(session.duel),workingLocation=findBackrow(working,input.sourceUid)!;
  const sourceBinding=bindTarget(working.core,input.sourceUid),targetBinding=bindTarget(working.core,input.targetUid);
  if(!sourceBinding||sourceBinding.zone!=='backrow'||!targetBinding||targetBinding.zone!=='monsters')throw new Error('Vínculo físico da Armadilha/alvo inválido.');
  workingLocation.card.faceUp=true;workingLocation.card.resolved=false;
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(before,working);
  const receipt:TargetedTrapActivation={activationId:input.activationId,sourceUid:input.sourceUid,targetUid:input.targetUid,
   sourceTeam:location.team,sourceSeat:ownerSeat,actorSeat:input.actorSeat,targetTeam:target.team,effect,
   sourceBinding,targetBinding,turn:working.core.turn};
  session.duel=working;session.activations[input.activationId]=structuredClone(receipt);return {...receipt};
 }
 function resolve(session:TargetedContinuousTrapSession,activationId:string,options:{activationNegated?:boolean;effectNegated?:boolean}={}):TargetedTrapResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.resolutions[activationId];if(previous)return {...previous,replayed:true};
  const activation=session.activations[activationId];if(!activation)throw new Error('Ativação M684 não encontrada.');
  const before=inventorySnapshot(session.duel),working=structuredClone(session.duel);
  const location=findBackrow(working,activation.sourceUid),target=findMonster(working,activation.targetUid);
  let status:TargetedTrapResolution['status'];
  if(!location||!location.card.faceUp||!targetBindingValid(working.core,activation.sourceBinding))status='source-left-field';
  else if(!target||!targetBindingValid(working.core,activation.targetBinding)){
   moveTrapToOwnerGrave(working,activation.sourceUid);status='target-left-field';
  }else if(options.activationNegated){
   moveTrapToOwnerGrave(working,activation.sourceUid);status='activation-negated';
  }else if(options.effectNegated){
   location.card.resolved=false;status='effect-negated';
  }else if(continuousTrapsNegated(working.core)){
   // A continuous negator suppresses the Trap while present; its effect resumes if the negator leaves.
   location.card.resolved=true;status='active';
  }else if(!canAffectMonster(working.core,activation.targetUid,'trap')){
   location.card.resolved=false;status='target-unaffected';
  }else{
   location.card.resolved=true;status='active';
  }
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(before,working);
  session.duel=working;
  const result:TargetedTrapResolution={activationId,sourceUid:activation.sourceUid,targetUid:activation.targetUid,status,replayed:false};
  session.resolutions[activationId]=result;return {...result};
 }
 function reconcileTargets(session:TargetedContinuousTrapSession):number{
  assertSession(session);const before=inventorySnapshot(session.duel);let removed=0;
  // Continuous Trap text, including its target-leaves destruction clause, is suppressed by Royal Decree-like effects.
  if(continuousTrapsNegated(session.duel.core))return 0;
  for(const [id,activation] of Object.entries(session.activations)){
   if(session.resolutions[id]?.status!=='active')continue;
   const location=findBackrow(session.duel,activation.sourceUid);
   if(!location||!location.card.faceUp||!targetBindingValid(session.duel.core,activation.sourceBinding)){
    session.resolutions[id]={activationId:id,sourceUid:activation.sourceUid,targetUid:activation.targetUid,status:'source-left-field',replayed:false};continue;
   }
   const target=findMonster(session.duel,activation.targetUid);
   if(!target||!targetBindingValid(session.duel.core,activation.targetBinding)){
    moveTrapToOwnerGrave(session.duel,activation.sourceUid);removed++;
    session.resolutions[id]={activationId:id,sourceUid:activation.sourceUid,targetUid:activation.targetUid,status:'target-left-field',replayed:false};
   }
  }
  assertTagDuel(session.duel);assertSameInventory(before,session.duel);return removed;
 }
 function activeEffects(session:TargetedContinuousTrapSession):TargetedTrapActiveEffect[]{
  assertSession(session);reconcileTargets(session);
  if(continuousTrapsNegated(session.duel.core))return [];
  const active:TargetedTrapActiveEffect[]=[];
  for(const [id,activation] of Object.entries(session.activations)){
   if(session.resolutions[id]?.status!=='active')continue;
   const location=findBackrow(session.duel,activation.sourceUid),target=findMonster(session.duel,activation.targetUid);
   if(!location||!target||!location.card.faceUp||location.card.resolved!==true||
    !targetBindingValid(session.duel.core,activation.targetBinding)||!canAffectMonster(session.duel.core,activation.targetUid,'trap'))continue;
   active.push({activationId:id,sourceUid:activation.sourceUid,targetUid:activation.targetUid,effect:activation.effect,
    sourceTeam:location.team,sourceSeat:activation.sourceSeat,targetTeam:target.team});
  }
  return active;
 }
 function isAttackBlocked(session:TargetedContinuousTrapSession,targetUid:string):boolean{
  assertId(targetUid,'UID do monstro');return activeEffects(session).some(effect=>effect.targetUid===targetUid);
 }
 function canChangeBattlePosition(session:TargetedContinuousTrapSession,targetUid:string):boolean{
  return !isAttackBlocked(session,targetUid);
 }
 function atkModifier(session:TargetedContinuousTrapSession,targetUid:string):number{
  assertId(targetUid,'UID do monstro');return activeEffects(session).filter(effect=>effect.targetUid===targetUid&&effect.effect==='shadow-spell').length*-700;
 }
 function resolveStandbyPhase(session:TargetedContinuousTrapSession,input:{eventId:string;turn:number;controllerTeam:TargetedTrapTeam;phase:'standby'}):TargetedTrapStandbyReceipt{
  assertSession(session);assertId(input?.eventId,'ID da janela de Espera');
  if(!Number.isSafeInteger(input.turn)||!isTeam(input.controllerTeam)||input.phase!=='standby'||
   input.turn!==session.duel.core.turn||session.duel.core.current!==input.controllerTeam||
   session.duel.core.phase!=='main'||session.duel.core.priority!==input.controllerTeam||
   session.duel.cursor!==session.duel.active[input.controllerTeam]||session.duel.core.turnEnding||session.duel.core.damageStep){
   throw new Error('A janela de Standby deve vir do início do turno da equipe ativa.');
  }
  const previous=session.standbyReceipts[input.eventId];
  if(previous){
   if(previous.turn!==input.turn||previous.controllerTeam!==input.controllerTeam)throw new Error('ID de Standby reutilizado com fatos diferentes.');
   return {...previous,entries:previous.entries.map(entry=>({...entry})),replayed:true};
  }
  reconcileTargets(session);
  const effects=activeEffects(session),before=inventorySnapshot(session.duel),working=structuredClone(session.duel);
  const entries:TargetedTrapStandbyEntry[]=[];
  for(const effect of effects){
   if(effect.effect!=='nightmare-wheel'||effect.sourceTeam!==input.controllerTeam)continue;
   const location=findBackrow(working,effect.sourceUid),target=findMonster(working,effect.targetUid);
   const activation=session.activations[effect.activationId];
   if(!location||!target||!activation||!targetBindingValid(working.core,activation.targetBinding)){
    if(location)moveTrapToOwnerGrave(working,effect.sourceUid);
    const resolution=session.resolutions[effect.activationId];
    if(resolution)session.resolutions[effect.activationId]={...resolution,status:'target-left-field',replayed:false};
    continue;
   }
   const damagedTeam=(1-input.controllerTeam) as TargetedTrapTeam;
   const player=working.core.players[damagedTeam],lpAfter=Math.max(0,player.lp-500),damage=player.lp-lpAfter;
   player.lp=lpAfter;
   entries.push({sourceUid:effect.sourceUid,targetUid:effect.targetUid,damagedTeam,damage,lpAfter});
   if(lpAfter===0){finishByDamage(working.core,damagedTeam);break;}
  }
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(before,working);
  session.duel=working;
  const damageTotal=entries.reduce((sum,entry)=>sum+entry.damage,0);
  const result:TargetedTrapStandbyReceipt={eventId:input.eventId,turn:input.turn,controllerTeam:input.controllerTeam,
   status:working.core.phase==='finished'?'duel-ended':entries.length?'applied':'no-trigger',damageTotal,entries,replayed:false};
  session.standbyReceipts[input.eventId]=structuredClone(result);return result;
 }
 return {createSession,activate,resolve,reconcileTargets,activeEffects,isAttackBlocked,canChangeBattlePosition,atkModifier,resolveStandbyPhase};
}
