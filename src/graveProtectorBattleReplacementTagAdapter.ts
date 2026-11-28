import {createHash} from 'node:crypto';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {monsterEffectsNegated} from './continuousEffects';
import {ownedPrivateZone} from './teamRotation';
import {shuffleDuel,type DuelRandom} from './duelRandom';
import {removeToken} from './tokens';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {DuelState,Monster,CardRef} from './duelEngine';

export const GRAVE_PROTECTOR_ID='11448373';
export const GRAVE_PROTECTOR_KONAMI_CID=6039;
export type GraveProtectorDefinition={id:string;name:string;kind:'monster';effect:'grave-protector';level:number};
export type GraveProtectorLookup=(id:string)=>GraveProtectorDefinition|undefined;
export type GraveProtectorNegationCheck=(duel:DuelState,uid:string)=>boolean;
type Team=0|1;
type Seat=0|1|2|3;
type CardInfo={kind?:string;name?:string;fusion?:unknown};
type MonsterOnField={team:Team;index:number;monster:Monster};
type ActiveProtector={team:Team;monster:Monster};
const definition:GraveProtectorDefinition={id:GRAVE_PROTECTOR_ID,name:'Grave Protector',kind:'monster',effect:'grave-protector',level:4};
export function defaultGraveProtectorLookup(id:string):GraveProtectorDefinition|undefined{return id===GRAVE_PROTECTOR_ID?definition:undefined;}
function assertId(value:string,label:string):void{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function physicalSeat(uid:string):Seat{
 const match=/^m([0-3]):/.exec(uid);if(!match)throw new Error('UID físico 2v2 inválido.');
 return Number(match[1]) as Seat;
}
function findMonster(duel:TagDuel,uid:string):MonsterOnField|undefined{
 let found:MonsterOnField|undefined;
 for(const team of [0,1] as const){const index=duel.core.players[team].monsters.findIndex(monster=>monster.uid===uid);if(index>=0){if(found)throw new Error('UID duplicado no campo.');found={team,index,monster:duel.core.players[team].monsters[index]};}}
 return found;
}
function activeProtectors(session:GraveProtectorSession):{active:ActiveProtector[];faceUp:ActiveProtector[]}{
 const faceUp:ActiveProtector[]=[],active:ActiveProtector[]=[];
 for(const team of [0,1] as const)for(const monster of session.duel.core.players[team].monsters){
  if(monster.faceUp&&session.lookup(monster.id)?.effect==='grave-protector'){
   const entry={team,monster};faceUp.push(entry);
   if(!session.isNegated(session.duel.core,monster.uid))active.push(entry);
  }
 }
 return {active,faceUp};
}
function assertBattleWindow(duel:TagDuel,event:GraveProtectorBattleEvent):void{
 if(event.turn!==duel.core.turn||event.phase!=='battle'||duel.core.phase!=='battle'||event.activeSeat%2!==event.currentTeam||duel.cursor!==event.activeSeat||duel.active[event.currentTeam]!==event.activeSeat||duel.core.current!==event.currentTeam)throw new Error('Substituição fora da janela de batalha/assento ativo.');
}
function assertRules(duel:TagDuel):void{
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
 const after=inventorySnapshot(duel);if(after.size!==before.size||[...before].some(([uid,id])=>after.get(uid)!==id))throw new Error('A substituição alterou ou concedeu inventário.');
}
function cardRef(monster:Monster):CardRef{return {uid:monster.uid,id:monster.id,...(monster.entityKind?{entityKind:monster.entityKind}:{})};}
function removeFromField(duel:TagDuel,target:MonsterOnField):void{
 const current=duel.core.players[target.team].monsters[target.index];
 if(!current||current.uid!==target.monster.uid)throw new Error('Monstro destruído mudou antes da substituição.');
 duel.core.players[target.team].monsters.splice(target.index,1);
}
function assertSession(session:GraveProtectorSession):void{
 if(!session||typeof session!=='object'||!session.duel||typeof session.lookup!=='function'||typeof session.isNegated!=='function'||!session.receipts)throw new Error('Sessão Grave Protector inválida.');
 assertRules(session.duel);
}
export type GraveProtectorSession={
 duel:TagDuel;lookup:GraveProtectorLookup;isNegated:GraveProtectorNegationCheck;
 receipts:Record<string,{fingerprint:string;result:GraveProtectorResult}>
};
export function createGraveProtectorSession(input:TagDuel,lookup:GraveProtectorLookup=defaultGraveProtectorLookup,isNegated:GraveProtectorNegationCheck=monsterEffectsNegated):GraveProtectorSession{
 assertRules(input);
 const session:GraveProtectorSession={duel:structuredClone(input),lookup,isNegated,receipts:{}};
 assertSession(session);return session;
}
export type GraveProtectorBattleEvent={
 eventId:string;turn:number;phase:'battle';activeSeat:Seat;currentTeam:Team;
 fieldTeam:Team;destroyedUid:string;destroyedByBattle:boolean
};
export type GraveProtectorResult={
 eventId:string;destroyedUid:string;sourceUid?:string;ownerSeat?:Seat;
 destination:'none'|'owner-main-deck'|'owner-extra-deck'|'vanished-token';
 status:'shuffled-to-owner-main-deck'|'returned-to-owner-extra-deck'|'token-vanishes'|'no-active-protector'|'source-negated'|'target-not-on-field'|'not-battle-destruction'|'duplicate';
 replayed:boolean;originalStatus?:GraveProtectorResult['status']
};
/**
 * Continuous replacement, called before the normal battle-destruction-to-GY step.
 * It never exposes card identity or shuffled Deck order to the caller.
 */
export function applyGraveProtectorReplacement(session:GraveProtectorSession,event:GraveProtectorBattleEvent):GraveProtectorResult{
 assertSession(session);assertId(event.eventId,'Evento');assertId(event.destroyedUid,'Monstro destruído');
 const eventFingerprint=fingerprint(event),cached=session.receipts[event.eventId];
 if(cached){
  if(cached.fingerprint!==eventFingerprint)throw new Error('ID de evento reutilizado para outra destruição.');
  return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 }
 assertBattleWindow(session.duel,event);
 const before=inventorySnapshot(session.duel);
 let result:GraveProtectorResult={eventId:event.eventId,destroyedUid:event.destroyedUid,destination:'none',status:'not-battle-destruction',replayed:false};
 if(event.destroyedByBattle){
  const target=findMonster(session.duel,event.destroyedUid);
  if(!target||target.team!==event.fieldTeam)result={...result,status:'target-not-on-field'};
  else{
   const sources=activeProtectors(session),source=sources.active[0]??sources.faceUp[0];
   if(!source)result={...result,status:'no-active-protector'};
   else if(!sources.active.length)result={...result,sourceUid:source.monster.uid,status:'source-negated'};
   else if(target.monster.entityKind==='token'){
    if(!removeToken(session.duel.core,target.monster.uid,'battle'))throw new Error('Token destruído não foi encontrado no ledger.');
    synchronizeCardLifetimes(session.duel.core);
    result={...result,sourceUid:source.monster.uid,destination:'vanished-token',status:'token-vanishes'};
   }else{
    const ref=cardRef(target.monster),ownerSeat=physicalSeat(ref.uid),ownerTeam=(ownerSeat%2) as Team;
    const info=getDuelCard(ref.id) as CardInfo|undefined;
    if(!info||info.kind!=='monster')throw new Error('Carta destruída não é um monstro habilitado.');
    if(info.fusion){
     const extra=ownedPrivateZone(session.duel.core,ref,ownerTeam,'extra'),nextExtra=[...extra,ref];
     removeFromField(session.duel,target);extra.splice(0,extra.length,...nextExtra);synchronizeCardLifetimes(session.duel.core);
     result={...result,sourceUid:source.monster.uid,ownerSeat,destination:'owner-extra-deck',status:'returned-to-owner-extra-deck'};
    }else{
     const deck=ownedPrivateZone(session.duel.core,ref,ownerTeam,'deck'),nextDeck=[...deck,ref];
     const randomState:{random?:DuelRandom}={random:session.duel.core.random?structuredClone(session.duel.core.random):undefined};
     shuffleDuel(nextDeck,randomState);
     removeFromField(session.duel,target);deck.splice(0,deck.length,...nextDeck);
     if(randomState.random)session.duel.core.random=randomState.random;
     synchronizeCardLifetimes(session.duel.core);
     result={...result,sourceUid:source.monster.uid,ownerSeat,destination:'owner-main-deck',status:'shuffled-to-owner-main-deck'};
    }
   }
  }
 }
 session.receipts[event.eventId]={fingerprint:eventFingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}
