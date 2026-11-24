import type {TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';

export const SEVEN_COMPLETED_ID='86198326';
export type SevenCompletedLedger=Readonly<{version:1;processedEventIds:readonly string[]}>;
export type SevenCompletedEvent=Readonly<{eventId:string;controllerMemberId:string;sourceUid:string;targetUid:string;stat:'atk'|'def'}>;
export type SevenCompletedPlan=Readonly<{
 eventId:string;
 controllerMemberId:string;
 sourceUid:string;
 targetUid:string;
 targetTeam:0|1;
 stat:'atk'|'def';
 amount:700;
 visibility:'public';
}>;
export type SevenCompletedResolution=Readonly<{status:'equipped'|'duplicate';ledger:SevenCompletedLedger;plan:SevenCompletedPlan|null}>;

function assertLedger(ledger:SevenCompletedLedger):void{
 if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedEventIds)||ledger.processedEventIds.some(id=>typeof id!=='string'||!id.trim())||new Set(ledger.processedEventIds).size!==ledger.processedEventIds.length)throw new Error('Ledger de 7 Completed inválido.');
}
function assertEvent(event:SevenCompletedEvent):void{
 if(!event||typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.controllerMemberId!=='string'||!event.controllerMemberId.trim()||typeof event.sourceUid!=='string'||!event.sourceUid.trim()||typeof event.targetUid!=='string'||!event.targetUid.trim()||!['atk','def'].includes(event.stat))throw new Error('Evento de 7 Completed inválido.');
}
function assertClassicTag(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||!Array.isArray(state.active)||state.active.length!==2||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation)throw new Error('7 Completed exige um duelo 2v2 clássico válido.');
 if(new Set(state.members.map(member=>member.id)).size!==4||state.members.some((member,index)=>!member.id||member.team!==index%2)||state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||state.active[0]===state.active[1])throw new Error('Assentos de 7 Completed inválidos.');
 if(state.core.teamRotation.cursor!==state.cursor||state.core.teamRotation.active[0]!==state.active[0]||state.core.teamRotation.active[1]!==state.active[1]||state.core.players.some((player,team)=>player.id!==`tag-team-${team}`))throw new Error('Rotação de equipes inconsistente para 7 Completed.');
}
export function createSevenCompletedLedger():SevenCompletedLedger{return {version:1,processedEventIds:[]};}

/** Produces the chosen +700 ATK or DEF Equip modifier without mutating the duel.
 * Equip Spells may target a face-up Machine monster on either shared team field.
 */
export function resolveSevenCompleted(
 state:TagDuel,
 ledger:SevenCompletedLedger,
 event:SevenCompletedEvent
):SevenCompletedResolution{
 assertLedger(ledger);assertEvent(event);
 if(ledger.processedEventIds.includes(event.eventId))return {status:'duplicate',ledger,plan:null};
 assertClassicTag(state);
 const seat=state.members.findIndex(member=>member.id===event.controllerMemberId);
 if(seat<0)throw new Error('Participante de 7 Completed não encontrado.');
 const team=state.members[seat].team;
 if(state.core.current!==team||state.cursor!==seat||state.active[team]!==seat)throw new Error('7 Completed só pode ser resolvida pelo participante ativo.');
 const sourcePlayer=state.core.players[team];
 const sourceMatches=sourcePlayer.backrow.filter(card=>card.uid===event.sourceUid);
 if(sourceMatches.length!==1||sourceMatches[0].id!==SEVEN_COMPLETED_ID||sourceMatches[0].faceUp!==true||sourceMatches[0].equippedTo)throw new Error('7 Completed exige a instância física face-up ainda não equipada.');
 const targets=state.core.players.flatMap((player,targetTeam)=>player.monsters.filter(monster=>monster.uid===event.targetUid).map(monster=>({monster,targetTeam})));
 if(targets.length!==1)throw new Error('Alvo de 7 Completed ausente ou ambíguo; não é permitido redirecionar.');
 const {monster,targetTeam}=targets[0];
 if(!monster.faceUp)throw new Error('7 Completed só pode equipar um monstro com a face para cima.');
 const info=getDuelCard(monster.id);
 if(!info||info.kind!=='monster'||info.race!=='Machine')throw new Error('7 Completed só pode equipar um monstro Máquina.');
 const next:SevenCompletedLedger={version:1,processedEventIds:[...ledger.processedEventIds,event.eventId]};
 return {status:'equipped',ledger:next,plan:{eventId:event.eventId,controllerMemberId:event.controllerMemberId,sourceUid:event.sourceUid,targetUid:event.targetUid,targetTeam:targetTeam as 0|1,stat:event.stat,amount:700,visibility:'public'}};
}
