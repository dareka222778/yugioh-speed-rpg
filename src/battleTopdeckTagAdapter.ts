import {createHash} from 'node:crypto';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,type TargetBinding,synchronizeCardLifetimes} from './cardLifetime';
import {monsterEffectsNegated} from './continuousEffects';
import {ownedPrivateZone} from './teamRotation';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {DuelState,Monster,CardRef} from './duelEngine';

export const WINGED_SAGE_FALCOS_ID='87523462';
export const WINGED_SAGE_FALCOS_KONAMI_CID=5522;
export const MYSTICAL_KNIGHT_OF_JACKAL_ID='98745000';
export const MYSTICAL_KNIGHT_OF_JACKAL_KONAMI_CID=5519;
export const HELPING_ROBO_FOR_COMBAT_ID='47025270';
export const HELPING_ROBO_FOR_COMBAT_KONAMI_CID=5596;

export type BattleTopdeckEffect='winged-sage-falcos'|'mystical-knight-of-jackal'|'helping-robo-for-combat';
export type BattleTopdeckCardDefinition={id:string;name:string;kind:'monster';effect:BattleTopdeckEffect;level?:number};
export type BattleTopdeckLookup=(id:string)=>BattleTopdeckCardDefinition|undefined;
export type BattleTopdeckNegationCheck=(duel:DuelState,uid:string)=>boolean;
type Team=0|1;
type Seat=0|1|2|3;
type CardInfo={kind?:string;name?:string;level?:number;fusion?:unknown};
type MonsterOnField={team:Team;monster:Monster};
type GraveCard={index:number;card:CardRef};

const definitions:Readonly<Record<string,BattleTopdeckCardDefinition>>={
 [WINGED_SAGE_FALCOS_ID]:{id:WINGED_SAGE_FALCOS_ID,name:'Winged Sage Falcos',kind:'monster',effect:'winged-sage-falcos',level:4},
 [MYSTICAL_KNIGHT_OF_JACKAL_ID]:{id:MYSTICAL_KNIGHT_OF_JACKAL_ID,name:'Mystical Knight of Jackal',kind:'monster',effect:'mystical-knight-of-jackal',level:7},
 [HELPING_ROBO_FOR_COMBAT_ID]:{id:HELPING_ROBO_FOR_COMBAT_ID,name:'Helping Robo for Combat',kind:'monster',effect:'helping-robo-for-combat',level:4}
};
export function defaultBattleTopdeckLookup(id:string):BattleTopdeckCardDefinition|undefined{return definitions[id];}
function assertId(value:string,label:string):void{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function physicalSeat(uid:string):Seat{
 const match=/^m([0-3]):/.exec(uid);if(!match)throw new Error('UID físico 2v2 inválido.');
 return Number(match[1]) as Seat;
}
function effectOf(id:string,lookup:BattleTopdeckLookup):BattleTopdeckEffect|undefined{return lookup(id)?.effect;}
function findMonster(duel:TagDuel,uid:string):MonsterOnField|undefined{
 let found:MonsterOnField|undefined;
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(value=>value.uid===uid);if(monster){if(found)throw new Error('UID duplicado no campo.');found={team,monster};}}
 return found;
}
function findGraveCard(duel:TagDuel,team:Team,uid:string):GraveCard|undefined{
 const index=duel.core.players[team].grave.findIndex(card=>card.uid===uid);
 return index<0?undefined:{index,card:duel.core.players[team].grave[index]};
}
function assertBattleTopdeckRules(duel:TagDuel):void{
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
function assertBattleWindow(duel:TagDuel,team:Team,activeSeat:Seat,turn:number):void{
 if(turn!==duel.core.turn||duel.core.phase!=='battle'||activeSeat%2!==team||duel.cursor!==activeSeat||duel.active[team]!==activeSeat||duel.core.current!==team)throw new Error('Evento de batalha fora do assento/turno ativo.');
}
function assertDestructionEvent(duel:TagDuel,event:BattleDestructionEvent):Team{
 assertId(event.eventId,'Evento');assertId(event.attackerUid,'Atacante');assertId(event.defenderUid,'Defensor');assertId(event.destroyedUid,'Destruído');
 if(!event.destroyedByBattle||event.destroyedUid!==event.defenderUid)throw new Error('O evento precisa representar destruição do defensor por batalha.');
 const team=(event.activeSeat%2) as Team;
 assertBattleWindow(duel,team,event.activeSeat,event.turn);
 if(event.attackerUid===event.defenderUid)throw new Error('Atacante e defensor não podem ser o mesmo UID.');
 return team;
}
function assertSession(session:BattleTopdeckSession):void{
 if(!session||typeof session!=='object'||!session.duel||typeof session.lookup!=='function'||typeof session.isNegated!=='function'||!session.pendingTopdeck||!session.topdeckReceipts||!session.pendingRobo||!session.roboDrawReceipts||!session.pendingRoboChoice||!session.roboReturnReceipts)throw new Error('Sessão de efeitos pós-batalha inválida.');
 assertBattleTopdeckRules(session.duel);
}
export type BattleTopdeckSession={
 duel:TagDuel;lookup:BattleTopdeckLookup;isNegated:BattleTopdeckNegationCheck;
 pendingTopdeck:Record<string,BattleTopdeckPlan>;topdeckReceipts:Record<string,{fingerprint:string;result:BattleTopdeckResult}>;
 pendingRobo:Record<string,HelpingRoboPlan>;roboDrawReceipts:Record<string,{fingerprint:string;result:HelpingRoboDrawResult}>;
 pendingRoboChoice:Record<string,HelpingRoboChoice>;roboReturnReceipts:Record<string,{fingerprint:string;result:HelpingRoboReturnResult}>
};
export function createBattleTopdeckSession(input:TagDuel,lookup:BattleTopdeckLookup=defaultBattleTopdeckLookup,isNegated:BattleTopdeckNegationCheck=monsterEffectsNegated):BattleTopdeckSession{
 assertBattleTopdeckRules(input);
 const session:BattleTopdeckSession={duel:structuredClone(input),lookup,isNegated,pendingTopdeck:{},topdeckReceipts:{},pendingRobo:{},roboDrawReceipts:{},pendingRoboChoice:{},roboReturnReceipts:{}};
 assertSession(session);return session;
}

export type BattleDestructionEvent={
 eventId:string;turn:number;activeSeat:Seat;attackerUid:string;defenderUid:string;destroyedUid:string;
 destroyedByBattle:boolean;destroyedToGrave:boolean;
 destroyedFaceUpAtBattleStart:boolean;destroyedPositionAtBattleStart:'atk'|'def'
};
export type BattleTopdeckPlan={
 eventId:string;sourceUid:string;destroyedUid:string;effect:'winged-sage-falcos'|'mystical-knight-of-jackal';
 team:Team;opponentTeam:Team;activeSeat:Seat;ownerSeat:Seat;turn:number;
 sourceBinding:TargetBinding;targetBinding:TargetBinding;fingerprint:string
};
export type BattleTopdeckResult={
 eventId:string;sourceUid:string;destroyedUid:string;status:'returned-to-owner-deck-top'|'target-lost'|'source-negated'|'active-seat-changed'|'duplicate';
 ownerSeat:Seat;replayed:boolean;originalStatus?:BattleTopdeckResult['status']
};
/** Both cards return the battle-destroyed monster to its physical owner's Deck top. */
export function prepareBattleTopdeck(session:BattleTopdeckSession,event:BattleDestructionEvent,sourceUid:string):BattleTopdeckPlan{
 assertSession(session);const team=assertDestructionEvent(session.duel,event);assertId(sourceUid,'Fonte');
 if(sourceUid!==event.attackerUid)throw new Error('A fonte precisa ser o atacante que destruiu o monstro.');
 const source=findMonster(session.duel,sourceUid),effect=source&&effectOf(source.monster.id,session.lookup);
 if(!source||source.team!==team||!source.monster.faceUp||source.monster.position!=='atk'||(effect!=='winged-sage-falcos'&&effect!=='mystical-knight-of-jackal')||session.isNegated(session.duel.core,sourceUid))throw new Error('A fonte não é um atacante elegível ou está negada.');
 if(!event.destroyedToGrave)throw new Error('O monstro destruído precisa ter sido enviado ao Cemitério.');
 if(effect==='winged-sage-falcos'&&(!event.destroyedFaceUpAtBattleStart||event.destroyedPositionAtBattleStart!=='atk'))throw new Error('Falcos exige que o alvo estivesse face-up em Posição de Ataque.');
 const opponentTeam=(1-team) as Team,target=findGraveCard(session.duel,opponentTeam,event.destroyedUid),info=target&&getDuelCard(target.card.id) as CardInfo|undefined;
 if(!target||info?.kind!=='monster'||physicalSeat(target.card.uid)%2===team)throw new Error('O monstro destruído precisa estar no Cemitério da equipe adversária.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid),targetBinding=bindTarget(session.duel.core,event.destroyedUid);
 if(!sourceBinding||!targetBinding)throw new Error('Vínculo físico da fonte/alvo ausente.');
 if(session.pendingTopdeck[event.eventId]||session.topdeckReceipts[event.eventId])throw new Error('Evento de retorno ao topo duplicado.');
 const ownerSeat=physicalSeat(target.card.uid),payload={eventId:event.eventId,sourceUid,destroyedUid:event.destroyedUid,effect,team,opponentTeam,activeSeat:event.activeSeat,ownerSeat,turn:event.turn,sourceBinding,targetBinding};
 const plan:BattleTopdeckPlan={eventId:event.eventId,sourceUid,destroyedUid:event.destroyedUid,effect,team,opponentTeam,activeSeat:event.activeSeat,ownerSeat,turn:event.turn,sourceBinding,targetBinding,fingerprint:fingerprint(payload)};
 session.pendingTopdeck[event.eventId]=plan;assertSession(session);return structuredClone(plan);
}
export function resolveBattleTopdeck(session:BattleTopdeckSession,eventId:string):BattleTopdeckResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.topdeckReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingTopdeck[eventId];if(!plan)throw new Error('Retorno ao topo do Deck não preparado.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid);
 let status:BattleTopdeckResult['status']='returned-to-owner-deck-top';
 if(session.duel.core.turn!==plan.turn||session.duel.core.phase!=='battle'||session.duel.cursor!==plan.activeSeat||session.duel.active[plan.team]!==plan.activeSeat||session.duel.core.current!==plan.team)status='active-seat-changed';
 else if(source&&session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else{
  const target=findGraveCard(session.duel,plan.opponentTeam,plan.destroyedUid);
  if(!target||!targetBindingValid(session.duel.core,plan.targetBinding))status='target-lost';
  else{
   const [card]=session.duel.core.players[plan.opponentTeam].grave.splice(target.index,1);
   ownedPrivateZone(session.duel.core,card,plan.opponentTeam,'deck').unshift(card);
   synchronizeCardLifetimes(session.duel.core);
  }
 }
 delete session.pendingTopdeck[eventId];
 const result:BattleTopdeckResult={eventId,sourceUid:plan.sourceUid,destroyedUid:plan.destroyedUid,status,ownerSeat:plan.ownerSeat,replayed:false};
 session.topdeckReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}

export type HelpingRoboPlan={
 eventId:string;sourceUid:string;team:Team;activeSeat:Seat;turn:number;sourceBinding:TargetBinding;fingerprint:string
};
export type HelpingRoboDrawResult={
 eventId:string;sourceUid:string;status:'awaiting-hand-selection'|'deck-empty'|'source-negated'|'active-seat-changed'|'duplicate';
 activeSeat:Seat;drawnUid?:string;replayed:boolean;originalStatus?:HelpingRoboDrawResult['status']
};
export type HelpingRoboChoice={eventId:string;sourceUid:string;team:Team;activeSeat:Seat;turn:number;drawnUid:string;fingerprint:string};
export type HelpingRoboReturnResult={
 eventId:string;sourceUid:string;returnedUid:string;status:'returned-to-deck-bottom'|'choice-window-lost'|'duplicate';
 activeSeat:Seat;replayed:boolean;originalStatus?:HelpingRoboReturnResult['status']
};
/** The event does not require the destroyed monster to remain in the GY. */
export function prepareHelpingRoboForCombat(session:BattleTopdeckSession,event:BattleDestructionEvent,sourceUid:string):HelpingRoboPlan{
 assertSession(session);const team=assertDestructionEvent(session.duel,event);assertId(sourceUid,'Helping Robo');
 if(sourceUid!==event.attackerUid)throw new Error('Helping Robo precisa ser o atacante que destruiu o monstro.');
 const source=findMonster(session.duel,sourceUid);
 if(!source||source.team!==team||!source.monster.faceUp||source.monster.position!=='atk'||effectOf(source.monster.id,session.lookup)!=='helping-robo-for-combat'||session.isNegated(session.duel.core,sourceUid))throw new Error('Helping Robo não está ativo como atacante.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid);if(!sourceBinding)throw new Error('Vínculo físico de Helping Robo ausente.');
 if(session.pendingRobo[event.eventId]||session.roboDrawReceipts[event.eventId])throw new Error('Evento Helping Robo duplicado.');
 const payload={eventId:event.eventId,sourceUid,team,activeSeat:event.activeSeat,turn:event.turn,sourceBinding};
 const plan:HelpingRoboPlan={eventId:event.eventId,sourceUid,team,activeSeat:event.activeSeat,turn:event.turn,sourceBinding,fingerprint:fingerprint(payload)};
 session.pendingRobo[event.eventId]=plan;assertSession(session);return structuredClone(plan);
}
/** Draws to the active physical seat; no immediate hand-limit discard is applied. */
export function resolveHelpingRoboDraw(session:BattleTopdeckSession,eventId:string):HelpingRoboDrawResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.roboDrawReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingRobo[eventId];if(!plan)throw new Error('Compra de Helping Robo não preparada.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid);
 let status:HelpingRoboDrawResult['status']='awaiting-hand-selection',drawnUid:string|undefined;
 if(session.duel.core.turn!==plan.turn||session.duel.core.phase!=='battle'||session.duel.cursor!==plan.activeSeat||session.duel.active[plan.team]!==plan.activeSeat||session.duel.core.current!==plan.team)status='active-seat-changed';
 else if(source&&session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else{
  const active=session.duel.core.players[plan.team],card=active.deck[0];
  if(!card)status='deck-empty';
  else{
   if(physicalSeat(card.uid)!==plan.activeSeat)throw new Error('A compra tentaria expor o Deck privado de outro assento.');
   const drawn=active.deck.shift()!;active.hand.push(drawn);drawnUid=drawn.uid;synchronizeCardLifetimes(session.duel.core);
   const choicePayload={eventId,sourceUid:plan.sourceUid,team:plan.team,activeSeat:plan.activeSeat,turn:plan.turn,drawnUid};
   session.pendingRoboChoice[eventId]={eventId,sourceUid:plan.sourceUid,team:plan.team,activeSeat:plan.activeSeat,turn:plan.turn,drawnUid,fingerprint:fingerprint(choicePayload)};
  }
 }
 delete session.pendingRobo[eventId];
 const result:HelpingRoboDrawResult={eventId,sourceUid:plan.sourceUid,status,activeSeat:plan.activeSeat,...drawnUid?{drawnUid}:{},replayed:false};
 session.roboDrawReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}
/** Returns the chosen card from the active seat's private hand to that same Deck's bottom. */
export function completeHelpingRoboForCombat(session:BattleTopdeckSession,eventId:string,returnUid:string):HelpingRoboReturnResult{
 assertSession(session);assertId(eventId,'Evento');assertId(returnUid,'Carta escolhida');
 const cached=session.roboReturnReceipts[eventId];if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const choice=session.pendingRoboChoice[eventId];if(!choice)throw new Error('A seleção de retorno de Helping Robo não está aberta.');
 const before=inventorySnapshot(session.duel);
 let status:HelpingRoboReturnResult['status']='returned-to-deck-bottom';
 const holder=session.duel.core.players[choice.team],index=holder.hand.findIndex(card=>card.uid===returnUid);
 if(session.duel.core.turn!==choice.turn||session.duel.core.phase!=='battle'||session.duel.cursor!==choice.activeSeat||session.duel.active[choice.team]!==choice.activeSeat||session.duel.core.current!==choice.team)status='choice-window-lost';
 else if(index<0||physicalSeat(returnUid)!==choice.activeSeat)throw new Error('A carta escolhida precisa estar na mão privada do assento ativo.');
 else{
  const [card]=holder.hand.splice(index,1);
  ownedPrivateZone(session.duel.core,card,choice.team,'deck').push(card);
  synchronizeCardLifetimes(session.duel.core);
 }
 delete session.pendingRoboChoice[eventId];
 const result:HelpingRoboReturnResult={eventId,sourceUid:choice.sourceUid,returnedUid:returnUid,status,activeSeat:choice.activeSeat,replayed:false};
 session.roboReturnReceipts[eventId]={fingerprint:fingerprint({choice:choice.fingerprint,returnUid,status}),result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}
