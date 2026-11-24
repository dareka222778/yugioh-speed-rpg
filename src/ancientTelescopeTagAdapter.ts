import type {TagDuel} from './tagDuel';

export const ANCIENT_TELESCOPE_ID='17092736';
export type TelescopeLedger=Readonly<{version:1;processedEventIds:readonly string[]}>;
export type TelescopeEvent=Readonly<{eventId:string;controllerMemberId:string;sourceUid:string}>;
export type TelescopeReveal=Readonly<{
  eventId:string;
  visibleToMemberId:string;
  targetTeam:0|1;
  targetMemberId:string;
  visibility:'controller-private';
  cards:readonly Readonly<{id:string;uid:string}>[];
  orderPreserved:true;
}>;
export type TelescopeResolution=Readonly<{
  status:'revealed'|'empty-deck'|'duplicate';
  ledger:TelescopeLedger;
  reveal:TelescopeReveal|null;
}>;

function assertLedger(ledger:TelescopeLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedEventIds)||ledger.processedEventIds.some(id=>typeof id!=='string'||!id.trim())||new Set(ledger.processedEventIds).size!==ledger.processedEventIds.length){
    throw new Error('Ledger de Ancient Telescope inválido.');
  }
}
function assertEvent(event:TelescopeEvent):void{
  if(!event||typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.controllerMemberId!=='string'||!event.controllerMemberId.trim()||typeof event.sourceUid!=='string'||!event.sourceUid.trim()){
    throw new Error('Evento de Ancient Telescope inválido.');
  }
}
function assertClassicTag(state:TagDuel):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||!Array.isArray(state.active)||state.active.length!==2||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation){
    throw new Error('Ancient Telescope exige um duelo 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||state.members.some((member,index)=>!member.id||member.team!==index%2)||state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||state.active[0]===state.active[1]){
    throw new Error('Assentos de Ancient Telescope inválidos.');
  }
  if(state.core.teamRotation.cursor!==state.cursor||state.core.teamRotation.active[0]!==state.active[0]||state.core.teamRotation.active[1]!==state.active[1]||state.core.players.some((player,team)=>player.id!==`tag-team-${team}`)){
    throw new Error('Rotação de equipes inconsistente para Ancient Telescope.');
  }
}
export function createTelescopeLedger():TelescopeLedger{return {version:1,processedEventIds:[]};}

/**
 * Reveals the top five cards of the currently active opposing seat's private
 * Deck to the activating physical member only. Index zero is the top of the
 * Deck in the shared duel engine. The adapter never moves or mutates cards.
 */
export function resolveAncientTelescope(
  state:TagDuel,
  ledger:TelescopeLedger,
  event:TelescopeEvent
):TelescopeResolution{
  assertLedger(ledger);assertEvent(event);
  // Idempotent receipt lookup precedes state checks: replay remains a no-op
  // even if team rotation or the opponent's Deck has advanced since resolution.
  if(ledger.processedEventIds.includes(event.eventId))return {status:'duplicate',ledger,reveal:null};
  assertClassicTag(state);
  const controllerSeat=state.members.findIndex(member=>member.id===event.controllerMemberId);
  if(controllerSeat<0)throw new Error('Participante de Ancient Telescope não encontrado.');
  const controllerTeam=state.members[controllerSeat].team;
  if(state.core.current!==controllerTeam||state.cursor!==controllerSeat||state.active[controllerTeam]!==controllerSeat){
    throw new Error('Ancient Telescope só pode ser resolvido pelo participante ativo.');
  }
  const sourcePlayer=state.core.players[controllerTeam];
  const sourceMatches=[...sourcePlayer.backrow,...sourcePlayer.grave].filter(card=>card.uid===event.sourceUid);
  if(sourceMatches.length!==1||sourceMatches[0].id!==ANCIENT_TELESCOPE_ID){
    throw new Error('Ancient Telescope exige a instância física ativada na retaguarda ou no Cemitério.');
  }
  const targetTeam=(1-controllerTeam) as 0|1;
  const targetSeat=state.active[targetTeam];
  const targetMember=state.members[targetSeat];
  if(!targetMember||targetMember.team!==targetTeam)throw new Error('Participante adversário ativo inválido.');
  const deck=state.core.players[targetTeam].deck;
  if(!Array.isArray(deck)||deck.some(card=>typeof card.uid!=='string'||!card.uid||typeof card.id!=='string'||!card.id)||new Set(deck.map(card=>card.uid)).size!==deck.length){
    throw new Error('Deck adversário inválido ou com UID físico duplicado.');
  }
  const cards=deck.slice(0,5).map(card=>({id:card.id,uid:card.uid}));
  const next:TelescopeLedger={version:1,processedEventIds:[...ledger.processedEventIds,event.eventId]};
  return {
    status:cards.length?'revealed':'empty-deck',
    ledger:next,
    reveal:{
      eventId:event.eventId,
      visibleToMemberId:event.controllerMemberId,
      targetTeam,
      targetMemberId:targetMember.id,
      visibility:'controller-private',
      cards,
      orderPreserved:true
    }
  };
}
