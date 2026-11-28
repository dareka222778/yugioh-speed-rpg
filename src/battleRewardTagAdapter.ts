import {createHash} from 'node:crypto';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,type TargetBinding,synchronizeCardLifetimes} from './cardLifetime';
import {monsterEffectsNegated} from './continuousEffects';
import {ownedPrivateZone} from './teamRotation';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {DuelState,Monster,CardRef} from './duelEngine';

export const AIRKNIGHT_PARSHATH_ID='18036057';
export const AIRKNIGHT_PARSHATH_KONAMI_CID=5023;
export const ASWAN_APPARITION_ID='88236094';
export const ASWAN_APPARITION_KONAMI_CID=6026;
export const ABSORBING_KID_FROM_THE_SKY_ID='49771608';
export const ABSORBING_KID_FROM_THE_SKY_KONAMI_CID=6034;

export type BattleRewardEffect='airknight-parshath'|'aswan-apparition'|'absorbing-kid-from-the-sky';
export type BattleRewardCardDefinition={id:string;name:string;kind:'monster';effect:BattleRewardEffect;level?:number};
export type BattleRewardLookup=(id:string)=>BattleRewardCardDefinition|undefined;
export type BattleRewardNegationCheck=(duel:DuelState,uid:string)=>boolean;
type Team=0|1;
type Seat=0|1|2|3;
type CardInfo={kind?:string;name?:string;level?:number;fusion?:unknown};
type MonsterOnField={team:Team;monster:Monster};
type GraveCard={index:number;card:CardRef};

const definitions:Readonly<Record<string,BattleRewardCardDefinition>>={
 [AIRKNIGHT_PARSHATH_ID]:{id:AIRKNIGHT_PARSHATH_ID,name:'Airknight Parshath',kind:'monster',effect:'airknight-parshath',level:5},
 [ASWAN_APPARITION_ID]:{id:ASWAN_APPARITION_ID,name:'Aswan Apparition',kind:'monster',effect:'aswan-apparition',level:3},
 [ABSORBING_KID_FROM_THE_SKY_ID]:{id:ABSORBING_KID_FROM_THE_SKY_ID,name:'Absorbing Kid from the Sky',kind:'monster',effect:'absorbing-kid-from-the-sky',level:4}
};
export function defaultBattleRewardLookup(id:string):BattleRewardCardDefinition|undefined{return definitions[id];}
function assertId(value:string,label:string):void{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function physicalSeat(uid:string):Seat{
 const match=/^m([0-3]):/.exec(uid);if(!match)throw new Error('UID físico 2v2 inválido.');
 return Number(match[1]) as Seat;
}
function cardInfo(id:string,lookup:BattleRewardLookup):CardInfo|undefined{return lookup(id)??getDuelCard(id) as CardInfo|undefined;}
function effectOf(id:string,lookup:BattleRewardLookup):BattleRewardEffect|undefined{return lookup(id)?.effect;}
function findMonster(duel:TagDuel,uid:string):MonsterOnField|undefined{
 let found:MonsterOnField|undefined;
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(value=>value.uid===uid);if(monster){if(found)throw new Error('UID duplicado no campo.');found={team,monster};}}
 return found;
}
function findGraveCard(duel:TagDuel,team:Team,uid:string):GraveCard|undefined{
 const index=duel.core.players[team].grave.findIndex(card=>card.uid===uid);
 return index<0?undefined:{index,card:duel.core.players[team].grave[index]};
}
function assertBattleRewardRules(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('A adaptação exige TagDuel clássico.');
 assertTagDuel(duel);
 const rules=rulesFor(duel.core);
 if(rules.id!==RULES_PROFILE.id||rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.extraDeckMax!==5||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.handLimit!==6||rules.handCheck!=='end')throw new Error('Perfil clássico do proprietário divergente.');
 for(const player of duel.core.players)if(player.monsters.length>3||player.backrow.length>3)throw new Error('Limite de zonas 3+3 excedido.');
 const extraUids=new Set<string>();
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const match=/^m([0-3]):/.exec(ref.uid);if(!match)throw new Error('Proprietário físico ausente.');
  const seat=Number(match[1]),info=getDuelCard(ref.id) as CardInfo|undefined;if(!info)throw new Error('Carta fora do catálogo habilitado.');
  if(extraUids.has(ref.uid)||info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){if(main[seat]<20||main[seat]>30)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');if(extra[seat]>5)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');}
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(value=>value.entityKind!=='token')){if(result.has(card.uid))throw new Error('UID físico duplicado.');result.set(card.uid,card.id);}
 return result;
}
function assertInventoryUnchanged(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);if(after.size!==before.size||[...before].some(([uid,id])=>after.get(uid)!==id))throw new Error('A adaptação alterou ou concedeu inventário.');
}
function assertActiveBattleSeat(duel:TagDuel,team:Team,activeSeat:Seat,turn:number):void{
 if(turn!==duel.core.turn||duel.core.phase!=='battle'||activeSeat%2!==team||duel.cursor!==activeSeat||duel.active[team]!==activeSeat||duel.core.current!==team)throw new Error('Evento de batalha fora do assento/turno ativo.');
}
function assertDamageEvent(duel:TagDuel,event:BattleDamageEvent):{team:Team;attacker:MonsterOnField;defender:MonsterOnField}{
 assertId(event.eventId,'Evento');assertId(event.attackerUid,'Atacante');assertId(event.defenderUid,'Defensor');
 if(event.damageKind!=='battle'||!Number.isSafeInteger(event.amount)||event.amount<=0||(event.damageToTeam!==0&&event.damageToTeam!==1))throw new Error('Somente dano de batalha positivo pode disparar esta recompensa.');
 const attacker=findMonster(duel,event.attackerUid),defender=findMonster(duel,event.defenderUid);
 if(!attacker||!defender||attacker.team===defender.team||defender.team!==event.damageToTeam||!attacker.monster.faceUp||attacker.monster.position!=='atk')throw new Error('O evento não representa dano ao adversário por um atacante válido.');
 assertActiveBattleSeat(duel,attacker.team,event.activeSeat,event.turn);
 return {team:attacker.team,attacker,defender};
}
function assertSession(session:BattleRewardSession):void{
 if(!session||typeof session!=='object'||!session.duel||typeof session.lookup!=='function'||typeof session.isNegated!=='function'||!session.pendingAirknight||!session.airknightReceipts||!session.pendingAswan||!session.aswanReceipts||!session.pendingAbsorbing||!session.absorbingReceipts)throw new Error('Sessão de recompensa de batalha inválida.');
 assertBattleRewardRules(session.duel);
}
export type BattleRewardSession={
 duel:TagDuel;lookup:BattleRewardLookup;isNegated:BattleRewardNegationCheck;
 pendingAirknight:Record<string,AirknightDrawPlan>;airknightReceipts:Record<string,{fingerprint:string;result:AirknightDrawResult}>;
 pendingAswan:Record<string,AswanRecoveryPlan>;aswanReceipts:Record<string,{fingerprint:string;result:AswanRecoveryResult}>;
 pendingAbsorbing:Record<string,AbsorbingKidPlan>;absorbingReceipts:Record<string,{fingerprint:string;result:AbsorbingKidResult}>
};
export function createBattleRewardSession(input:TagDuel,lookup:BattleRewardLookup=defaultBattleRewardLookup,isNegated:BattleRewardNegationCheck=monsterEffectsNegated):BattleRewardSession{
 assertBattleRewardRules(input);
 const session:BattleRewardSession={duel:structuredClone(input),lookup,isNegated,pendingAirknight:{},airknightReceipts:{},pendingAswan:{},aswanReceipts:{},pendingAbsorbing:{},absorbingReceipts:{}};
 assertSession(session);return session;
}

export type BattleDamageEvent={eventId:string;turn:number;activeSeat:Seat;attackerUid:string;defenderUid:string;damageToTeam:Team;damageKind:'battle'|'effect';amount:number};
export type AirknightDrawPlan={eventId:string;sourceUid:string;team:Team;activeSeat:Seat;turn:number;sourceBinding:TargetBinding;fingerprint:string};
export type AirknightDrawResult={eventId:string;sourceUid:string;status:'drawn'|'deck-empty'|'source-lost'|'source-control-changed'|'source-inactive'|'source-negated'|'active-seat-changed'|'duplicate';activeSeat:Seat;drawnUid?:string;replayed:boolean;originalStatus?:AirknightDrawResult['status']};
/** Airknight's piercing modifier applies only when it attacks a Defense Position monster. */
export function airknightParshathInflictsPiercing(duel:TagDuel,attackerUid:string,defenderUid:string,lookup:BattleRewardLookup=defaultBattleRewardLookup,isNegated:BattleRewardNegationCheck=monsterEffectsNegated):boolean{
 assertBattleRewardRules(duel);
 const attacker=findMonster(duel,attackerUid),defender=findMonster(duel,defenderUid);
 return !!attacker&&!!defender&&attacker.team!==defender.team&&attacker.monster.faceUp&&attacker.monster.position==='atk'&&defender.monster.position==='def'&&effectOf(attacker.monster.id,lookup)==='airknight-parshath'&&!isNegated(duel.core,attackerUid);
}
export function prepareAirknightParshathDraw(session:BattleRewardSession,event:BattleDamageEvent,sourceUid:string):AirknightDrawPlan{
 assertSession(session);const {team,attacker}=assertDamageEvent(session.duel,event);assertId(sourceUid,'Airknight');
 if(sourceUid!==event.attackerUid||attacker.monster.uid!==sourceUid||!attacker.monster.faceUp||effectOf(attacker.monster.id,session.lookup)!=='airknight-parshath'||session.isNegated(session.duel.core,sourceUid))throw new Error('Airknight Parshath não causou dano de batalha ativo.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid);if(!sourceBinding)throw new Error('Vínculo físico de Airknight ausente.');
 if(session.pendingAirknight[event.eventId]||session.airknightReceipts[event.eventId])throw new Error('Evento de compra de Airknight duplicado.');
 const payload={eventId:event.eventId,sourceUid,team,activeSeat:event.activeSeat,turn:event.turn,amount:event.amount,sourceBinding};
 const plan:AirknightDrawPlan={eventId:event.eventId,sourceUid,team,activeSeat:event.activeSeat,turn:event.turn,sourceBinding,fingerprint:fingerprint(payload)};
 session.pendingAirknight[event.eventId]=plan;assertSession(session);return structuredClone(plan);
}
/** Draws to the active physical seat's private hand; overflow is handled at End Phase. */
export function resolveAirknightParshathDraw(session:BattleRewardSession,eventId:string):AirknightDrawResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.airknightReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingAirknight[eventId];if(!plan)throw new Error('Compra de Airknight não preparada.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid);
 let status:AirknightDrawResult['status']='drawn',drawnUid:string|undefined;
 if(!source||!targetBindingValid(session.duel.core,plan.sourceBinding))status='source-lost';
 else if(source.team!==plan.team)status='source-control-changed';
 else if(!source.monster.faceUp)status='source-inactive';
 else if(session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else if(session.duel.cursor!==plan.activeSeat||session.duel.active[plan.team]!==plan.activeSeat||session.duel.core.current!==plan.team||session.duel.core.turn!==plan.turn||session.duel.core.phase!=='battle')status='active-seat-changed';
 else{
  const active=session.duel.core.players[plan.team],card=active.deck[0];
  if(!card)status='deck-empty';
  else{
   if(physicalSeat(card.uid)!==plan.activeSeat)throw new Error('A compra tentaria expor o Deck privado de outro assento.');
   const drawn=active.deck.shift()!;active.hand.push(drawn);drawnUid=drawn.uid;synchronizeCardLifetimes(session.duel.core);
  }
 }
 delete session.pendingAirknight[eventId];
 const result:AirknightDrawResult={eventId,sourceUid:plan.sourceUid,status,activeSeat:plan.activeSeat,...drawnUid?{drawnUid}:{},replayed:false};
 session.airknightReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}

export type AswanRecoveryPlan={eventId:string;sourceUid:string;targetTrapUid:string;team:Team;activeSeat:Seat;ownerSeat:Seat;turn:number;sourceBinding:TargetBinding;targetBinding:TargetBinding;fingerprint:string};
export type AswanRecoveryResult={eventId:string;sourceUid:string;targetTrapUid:string;status:'returned-to-deck-top'|'source-lost'|'source-control-changed'|'source-inactive'|'source-negated'|'target-lost'|'active-seat-changed'|'duplicate';ownerSeat:Seat;replayed:boolean;originalStatus?:AswanRecoveryResult['status']};
/** The selected Trap returns to the top of its original physical owner's Deck, without shuffling. */
export function prepareAswanApparitionRecovery(session:BattleRewardSession,event:BattleDamageEvent,sourceUid:string,targetTrapUid:string):AswanRecoveryPlan{
 assertSession(session);const {team,attacker}=assertDamageEvent(session.duel,event);assertId(sourceUid,'Aswan');assertId(targetTrapUid,'Armadilha');
 if(sourceUid!==event.attackerUid||!attacker.monster.faceUp||effectOf(attacker.monster.id,session.lookup)!=='aswan-apparition'||session.isNegated(session.duel.core,sourceUid))throw new Error('Aswan Apparition não causou dano de batalha ativo.');
 const target=findGraveCard(session.duel,team,targetTrapUid),info=target&&getDuelCard(target.card.id) as CardInfo|undefined;
 if(!target||info?.kind!=='trap'||physicalSeat(target.card.uid)%2!==team)throw new Error('Aswan exige uma Armadilha no Cemitério da própria equipe.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid),targetBinding=bindTarget(session.duel.core,targetTrapUid);
 if(!sourceBinding||!targetBinding)throw new Error('Vínculo físico de Aswan/Armadilha ausente.');
 if(session.pendingAswan[event.eventId]||session.aswanReceipts[event.eventId])throw new Error('Evento de recuperação Aswan duplicado.');
 const ownerSeat=physicalSeat(targetTrapUid),payload={eventId:event.eventId,sourceUid,targetTrapUid,team,activeSeat:event.activeSeat,ownerSeat,turn:event.turn,amount:event.amount,sourceBinding,targetBinding};
 const plan:AswanRecoveryPlan={eventId:event.eventId,sourceUid,targetTrapUid,team,activeSeat:event.activeSeat,ownerSeat,turn:event.turn,sourceBinding,targetBinding,fingerprint:fingerprint(payload)};
 session.pendingAswan[event.eventId]=plan;assertSession(session);return structuredClone(plan);
}
export function resolveAswanApparitionRecovery(session:BattleRewardSession,eventId:string):AswanRecoveryResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.aswanReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingAswan[eventId];if(!plan)throw new Error('Recuperação de Aswan não preparada.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid);
 let status:AswanRecoveryResult['status']='returned-to-deck-top';
 if(!source||!targetBindingValid(session.duel.core,plan.sourceBinding))status='source-lost';
 else if(source.team!==plan.team)status='source-control-changed';
 else if(!source.monster.faceUp)status='source-inactive';
 else if(session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else if(session.duel.cursor!==plan.activeSeat||session.duel.active[plan.team]!==plan.activeSeat||session.duel.core.current!==plan.team||session.duel.core.turn!==plan.turn||session.duel.core.phase!=='battle')status='active-seat-changed';
 else{
  const target=findGraveCard(session.duel,plan.team,plan.targetTrapUid);
  if(!target||!targetBindingValid(session.duel.core,plan.targetBinding))status='target-lost';
  else{
   const [card]=session.duel.core.players[plan.team].grave.splice(target.index,1);
   ownedPrivateZone(session.duel.core,card,plan.team,'deck').unshift(card);
   synchronizeCardLifetimes(session.duel.core);
  }
 }
 delete session.pendingAswan[eventId];
 const result:AswanRecoveryResult={eventId,sourceUid:plan.sourceUid,targetTrapUid:plan.targetTrapUid,status,ownerSeat:plan.ownerSeat,replayed:false};
 session.aswanReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}

export type BattleDestructionEvent={eventId:string;turn:number;activeSeat:Seat;attackerUid:string;defenderUid:string;destroyedUid:string;destroyedByBattle:boolean;destroyedToGrave:boolean};
export type AbsorbingKidPlan={eventId:string;sourceUid:string;destroyedUid:string;team:Team;activeSeat:Seat;turn:number;level:number;lpGain:number;lpBefore:number;sourceBinding:TargetBinding;targetBinding:TargetBinding;fingerprint:string};
export type AbsorbingKidResult={eventId:string;sourceUid:string;destroyedUid:string;status:'gained-life-points'|'source-lost'|'source-control-changed'|'source-inactive'|'source-negated'|'target-lost'|'active-seat-changed'|'duplicate';lpGain:number;team:Team;newLP?:number;replayed:boolean;originalStatus?:AbsorbingKidResult['status']};
/** The conservative adapter requires the Kid to remain face-up through its trigger resolution. */
export function prepareAbsorbingKidGain(session:BattleRewardSession,event:BattleDestructionEvent,sourceUid:string):AbsorbingKidPlan{
 assertSession(session);assertId(event.eventId,'Evento');assertId(sourceUid,'Absorbing Kid');assertId(event.attackerUid,'Atacante');assertId(event.defenderUid,'Defensor');assertId(event.destroyedUid,'Destruído');
 if(event.turn!==session.duel.core.turn||session.duel.core.phase!=='battle'||event.activeSeat%2!==session.duel.core.current||session.duel.cursor!==event.activeSeat||session.duel.active[event.activeSeat%2]!==event.activeSeat||sourceUid!==event.attackerUid||event.destroyedUid!==event.defenderUid||!event.destroyedByBattle||!event.destroyedToGrave)throw new Error('Evento de destruição de batalha inválido.');
 const source=findMonster(session.duel,sourceUid),team=(event.activeSeat%2) as Team;
 if(!source||source.team!==team||!source.monster.faceUp||source.monster.position!=='atk'||effectOf(source.monster.id,session.lookup)!=='absorbing-kid-from-the-sky'||session.isNegated(session.duel.core,sourceUid))throw new Error('Absorbing Kid não está ativo como atacante.');
 const target=findGraveCard(session.duel,(1-team) as Team,event.destroyedUid),info=target&&getDuelCard(target.card.id) as CardInfo|undefined;
 if(!target||info?.kind!=='monster'||!Number.isSafeInteger(info.level)||!info.level||info.level<1||physicalSeat(target.card.uid)%2===team)throw new Error('O monstro destruído precisa estar no Cemitério adversário e ter Nível.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid),targetBinding=bindTarget(session.duel.core,event.destroyedUid);
 if(!sourceBinding||!targetBinding)throw new Error('Vínculo físico do evento de batalha ausente.');
 if(session.pendingAbsorbing[event.eventId]||session.absorbingReceipts[event.eventId])throw new Error('Evento Absorbing Kid duplicado.');
 const lpGain=info.level*300,payload={eventId:event.eventId,sourceUid,destroyedUid:event.destroyedUid,team,activeSeat:event.activeSeat,turn:event.turn,level:info.level,lpGain,sourceBinding,targetBinding};
 const plan:AbsorbingKidPlan={eventId:event.eventId,sourceUid,destroyedUid:event.destroyedUid,team,activeSeat:event.activeSeat,turn:event.turn,level:info.level,lpGain,lpBefore:session.duel.core.players[team].lp,sourceBinding,targetBinding,fingerprint:fingerprint(payload)};
 session.pendingAbsorbing[event.eventId]=plan;assertSession(session);return structuredClone(plan);
}
export function resolveAbsorbingKidGain(session:BattleRewardSession,eventId:string):AbsorbingKidResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.absorbingReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingAbsorbing[eventId];if(!plan)throw new Error('Ganho de LP de Absorbing Kid não preparado.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid),target=findGraveCard(session.duel,(1-plan.team) as Team,plan.destroyedUid);
 let status:AbsorbingKidResult['status']='gained-life-points',newLP:number|undefined;
 if(!source||!targetBindingValid(session.duel.core,plan.sourceBinding))status='source-lost';
 else if(source.team!==plan.team)status='source-control-changed';
 else if(!source.monster.faceUp)status='source-inactive';
 else if(session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else if(session.duel.core.turn!==plan.turn||session.duel.core.phase!=='battle'||session.duel.cursor!==plan.activeSeat||session.duel.active[plan.team]!==plan.activeSeat||session.duel.core.current!==plan.team)status='active-seat-changed';
 else if(!target||!targetBindingValid(session.duel.core,plan.targetBinding))status='target-lost';
 else if(session.duel.core.players[plan.team].lp!==plan.lpBefore)throw new Error('O ganho de LP deve ser aplicado uma única vez após a destruição.');
 else{session.duel.core.players[plan.team].lp+=plan.lpGain;newLP=session.duel.core.players[plan.team].lp;}
 delete session.pendingAbsorbing[eventId];
 const result:AbsorbingKidResult={eventId,sourceUid:plan.sourceUid,destroyedUid:plan.destroyedUid,status,lpGain:status==='gained-life-points'?plan.lpGain:0,team:plan.team,...newLP!==undefined?{newLP}:{},replayed:false};
 session.absorbingReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}
