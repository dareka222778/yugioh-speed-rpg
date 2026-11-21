import {getDuelCard} from './effectRegistry';
import type {Card} from './cardCatalog';
import {
  routeAmazonessSwordsWomanBattleDamage,
  applyAtomicFireflyBattleRetaliation,
  resolveAirknightParshathDraw,
  aswanApparitionRecoveryOptions,
  chooseAswanApparitionRecovery,
  type TeamDamage,
  type SharedGraveyardCard,
} from './battleDamageFamily';
import type {TagDuel} from './tagDuel';

export const AMAZONESS_SWORDS_WOMAN_ID='94004268';
export const AIRKNIGHT_PARSHATH_ID='18036057';
export const ASWAN_APPARITION_ID='88236094';
export const ATOMIC_FIREFLY_ID='87340664';
export type BattleDamageTagTeam=0|1;
export type BattleDamageTagSeat=0|1|2|3;
type TagPlayer=TagDuel['core']['players'][number];
type TagMonster=TagPlayer['monsters'][number];
type TagGraveRef=TagPlayer['grave'][number];

export type BattleDamageTagSnapshot=Readonly<{
  eventId:string;
  turn:number;
  team:BattleDamageTagTeam;
  activeSeat:BattleDamageTagSeat;
  sourceUid:string;
  sourcePhysicalOwnerSeat:BattleDamageTagSeat;
  cardId:string;
  attackerUid:string;
  defenderUid:string|null;
  sourceFaceUpAtBattleStart:true;
}>;

export type BattleDamageTagGraveCard=SharedGraveyardCard & Readonly<{
  physicalOwnerSeat:BattleDamageTagSeat;
}>;

export type BattleDamageTagAswanResult=
  | Readonly<{resolved:false;reason:'not-tag-classic'|'invalid-trigger'|'stale-trigger'|'duplicate-event'|'no-target'|'invalid-state'}>
  | Readonly<{resolved:true;noOp:true;nextGame:TagDuel;deckTopSeat:BattleDamageTagSeat;processedEventIds:readonly string[]}>
  | Readonly<{resolved:true;noOp:false;card:BattleDamageTagGraveCard;deckTopSeat:BattleDamageTagSeat;nextGame:TagDuel;processedEventIds:readonly string[]}>;

const isTeam=(value:unknown):value is BattleDamageTagTeam=>value===0||value===1;
const isSeat=(value:unknown):value is BattleDamageTagSeat=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
const cardIds=new Set([AMAZONESS_SWORDS_WOMAN_ID,AIRKNIGHT_PARSHATH_ID,ASWAN_APPARITION_ID,ATOMIC_FIREFLY_ID]);
export function physicalSeatFromBattleDamageUid(uid:string):BattleDamageTagSeat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as BattleDamageTagSeat:null;
}
function phaseAllowsBattleResolution(game:TagDuel):boolean{
  return !!game&&!!game.core&&(game.core.phase==='battle'||game.core.phase==='response');
}
function sourceMonster(game:TagDuel,team:BattleDamageTagTeam,uid:string,cardId?:string):TagMonster|null{
  const player=game.core.players[team];
  if(!player||!Array.isArray(player.monsters)||player.monsters.length>3)return null;
  const source=player.monsters.find(card=>card&&card.uid===uid);
  if(!source||source.faceUp!==true||typeof source.id!=='string'||!cardIds.has(source.id)||
    (cardId!==undefined&&source.id!==cardId))return null;
  return source;
}
export function captureTagBattleDamageSnapshot(
  game:TagDuel,eventId:string,team:BattleDamageTagTeam,sourceUid:string,
  attackerUid:string,defenderUid:string|null
):BattleDamageTagSnapshot|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !phaseAllowsBattleResolution(game)||!isTeam(team)||typeof eventId!=='string'||
    !eventId.trim()||eventId.length>128||typeof sourceUid!=='string'||!sourceUid||
    typeof attackerUid!=='string'||!attackerUid||
    (defenderUid!==null&&(typeof defenderUid!=='string'||!defenderUid))||
    !Number.isSafeInteger(game.core.turn)||game.core.turn<1)return null;
  const activeSeat=game.active[team];
  if(!isSeat(activeSeat)||activeSeat%2!==team)return null;
  const source=sourceMonster(game,team,sourceUid);
  if(!source||sourceUid!==attackerUid&&sourceUid!==defenderUid)return null;
  const sourcePhysicalOwnerSeat=physicalSeatFromBattleDamageUid(source.uid);
  if(sourcePhysicalOwnerSeat===null)return null;
  return {eventId,turn:game.core.turn,team,activeSeat,sourceUid,
    sourcePhysicalOwnerSeat,cardId:source.id,attackerUid,defenderUid,
    sourceFaceUpAtBattleStart:true};
}
function currentSnapshot(game:TagDuel,snapshot:BattleDamageTagSnapshot):boolean{
  if(!snapshot||typeof snapshot!=='object'||typeof snapshot.eventId!=='string'||
    !snapshot.eventId.trim()||snapshot.eventId.length>128||
    !isTeam(snapshot.team)||!isSeat(snapshot.activeSeat)||
    !isSeat(snapshot.sourcePhysicalOwnerSeat)||typeof snapshot.sourceUid!=='string'||
    !snapshot.sourceUid||physicalSeatFromBattleDamageUid(snapshot.sourceUid)!==snapshot.sourcePhysicalOwnerSeat||
    typeof snapshot.attackerUid!=='string'||!snapshot.attackerUid||
    (snapshot.defenderUid!==null&&(typeof snapshot.defenderUid!=='string'||!snapshot.defenderUid))||
    !cardIds.has(snapshot.cardId)||snapshot.sourceFaceUpAtBattleStart!==true||
    !Number.isSafeInteger(snapshot.turn)||snapshot.turn<1)return false;
  return !!game&&game.mode==='tag-classic'&&!!game.core&&Array.isArray(game.core.players)&&
    game.core.players.length===2&&Array.isArray(game.active)&&game.active.length===2&&
    phaseAllowsBattleResolution(game)&&game.core.turn===snapshot.turn&&
    game.active[snapshot.team]===snapshot.activeSeat&&snapshot.activeSeat%2===snapshot.team;
}
function validLedger(ids:readonly string[]):boolean{
  return Array.isArray(ids)&&ids.length<=10000&&ids.every(id=>typeof id==='string'&&!!id&&id.length<=128)&&new Set(ids).size===ids.length;
}

export function resolveTagAmazonessSwordsWomanDamage(
  game:TagDuel,snapshot:BattleDamageTagSnapshot,battleDamageByTeam:TeamDamage,
  processedEventIds:readonly string[]=[]
){
  if(!game||game.mode!=='tag-classic')return {resolved:false as const,reason:'not-tag-classic' as const};
  if(!validLedger(processedEventIds)||!currentSnapshot(game,snapshot)||
    snapshot.cardId!==AMAZONESS_SWORDS_WOMAN_ID)return {resolved:false as const,reason:'invalid-trigger' as const};
  if(processedEventIds.includes(snapshot.eventId))return {resolved:false as const,reason:'duplicate-event' as const};
  try{
    const result=routeAmazonessSwordsWomanBattleDamage({
      battleDamageByTeam,battleInvolvesSource:snapshot.sourceUid===snapshot.attackerUid||snapshot.sourceUid===snapshot.defenderUid,
      sourceControllerTeam:snapshot.team,opposingTeam:(1-snapshot.team) as BattleDamageTagTeam
    });
    return {resolved:true as const,...result,processedEventIds:[...processedEventIds,snapshot.eventId]};
  }catch{return {resolved:false as const,reason:'invalid-state' as const};}
}

export function resolveTagAtomicFireflyRetaliation(
  game:TagDuel,snapshot:BattleDamageTagSnapshot,battleDamageByTeam:TeamDamage,
  destroyedByBattle:boolean,destroyingTeam:BattleDamageTagTeam,
  processedEventIds:readonly string[]=[]
){
  if(!game||game.mode!=='tag-classic')return {resolved:false as const,reason:'not-tag-classic' as const};
  if(!validLedger(processedEventIds)||!currentSnapshot(game,snapshot)||
    snapshot.cardId!==ATOMIC_FIREFLY_ID||!isTeam(destroyingTeam))
    return {resolved:false as const,reason:'invalid-trigger' as const};
  if(processedEventIds.includes(snapshot.eventId))return {resolved:false as const,reason:'duplicate-event' as const};
  try{
    const result=applyAtomicFireflyBattleRetaliation({
      battleDamageByTeam,sourceFaceUpAtBattleStart:snapshot.sourceFaceUpAtBattleStart,
      destroyedByBattle,sourceControllerTeam:snapshot.team,destroyingTeam
    });
    return {resolved:true as const,...result,processedEventIds:[...processedEventIds,snapshot.eventId]};
  }catch{return {resolved:false as const,reason:'invalid-state' as const};}
}

export function resolveTagAirknightParshathDraw(
  game:TagDuel,snapshot:BattleDamageTagSnapshot,damageKind:'battle'|'effect',
  battleDamageInflicted:number,processedEventIds:readonly string[]=[]
){
  if(!game||game.mode!=='tag-classic')return {resolved:false as const,reason:'not-tag-classic' as const};
  if(!validLedger(processedEventIds)||!currentSnapshot(game,snapshot)||
    snapshot.cardId!==AIRKNIGHT_PARSHATH_ID||snapshot.attackerUid!==snapshot.sourceUid)
    return {resolved:false as const,reason:'invalid-trigger' as const};
  if(processedEventIds.includes(snapshot.eventId))return {resolved:false as const,reason:'duplicate-event' as const};
  const player=game.core.players[snapshot.team];
  if(!player||!Array.isArray(player.deck))return {resolved:false as const,reason:'invalid-state' as const};
  try{
    const draw=resolveAirknightParshathDraw({
      damageKind,battleDamageInflicted,effectControllerSeat:snapshot.activeSeat,
      sourcePhysicalOwnerSeat:snapshot.sourcePhysicalOwnerSeat
    });
    return {resolved:true as const,...draw,drawRequired:draw.shouldDraw,
      drawUid:draw.shouldDraw?(player.deck[0]?.uid??null):null,
      deckEmpty:draw.shouldDraw&&player.deck.length===0,
      processedEventIds:[...processedEventIds,snapshot.eventId]};
  }catch{return {resolved:false as const,reason:'invalid-state' as const};}
}

function aswanSharedGraveyard(
  game:TagDuel,team:BattleDamageTagTeam,getCard:(id:string)=>Card|undefined
):BattleDamageTagGraveCard[]|null{
  const player=game.core.players[team];
  if(!player||!Array.isArray(player.grave))return null;
  const result:BattleDamageTagGraveCard[]=[];
  const seen=new Set<string>();
  for(const ref of player.grave as readonly TagGraveRef[]){
    if(!ref||typeof ref.uid!=='string'||!ref.uid||typeof ref.id!=='string'||!ref.id)return null;
    if(seen.has(ref.uid))return null;
    seen.add(ref.uid);
    const physicalOwnerSeat=physicalSeatFromBattleDamageUid(ref.uid);
    const info=getCard(ref.id);
    if(physicalOwnerSeat===null||!info)return null;
    result.push({uid:ref.uid,id:ref.id,kind:info.kind,physicalOwnerSeat});
  }
  return result;
}

export function projectTagAswanApparitionOptions(
  game:TagDuel,snapshot:BattleDamageTagSnapshot,damageKind:'battle'|'effect',
  battleDamageInflicted:number,getCard:(id:string)=>Card|undefined=getDuelCard
){
  if(!game||game.mode!=='tag-classic'||!currentSnapshot(game,snapshot)||
    snapshot.cardId!==ASWAN_APPARITION_ID||snapshot.attackerUid!==snapshot.sourceUid)
    return null;
  const graveyard=aswanSharedGraveyard(game,snapshot.team,getCard);
  if(!graveyard)return null;
  try{
    return aswanApparitionRecoveryOptions({
      damageKind,battleDamageInflicted,effectControllerSeat:snapshot.activeSeat,
      sharedGraveyard:graveyard
    });
  }catch{return null;}
}

export function resolveTagAswanApparitionRecovery(
  game:TagDuel,snapshot:BattleDamageTagSnapshot,selectedUid:string|null,
  damageKind:'battle'|'effect',battleDamageInflicted:number,
  processedEventIds:readonly string[]=[],getCard:(id:string)=>Card|undefined=getDuelCard
):BattleDamageTagAswanResult{
  if(!game||game.mode!=='tag-classic')return {resolved:false,reason:'not-tag-classic'};
  if(!validLedger(processedEventIds)||!currentSnapshot(game,snapshot)||
    snapshot.cardId!==ASWAN_APPARITION_ID||snapshot.attackerUid!==snapshot.sourceUid)
    return {resolved:false,reason:'invalid-trigger'};
  if(processedEventIds.includes(snapshot.eventId))return {resolved:false,reason:'duplicate-event'};
  const graveyard=aswanSharedGraveyard(game,snapshot.team,getCard);
  if(!graveyard)return {resolved:false,reason:'invalid-state'};
  const options=projectTagAswanApparitionOptions(game,snapshot,damageKind,battleDamageInflicted,getCard);
  if(!options)return {resolved:false,reason:'invalid-state'};
  if(!options.available){
    if(selectedUid!==null)return {resolved:false,reason:'no-target'};
    return {resolved:true,noOp:true,nextGame:game,deckTopSeat:snapshot.activeSeat,
      processedEventIds:[...processedEventIds,snapshot.eventId]};
  }
  if(typeof selectedUid!=='string'||!selectedUid)return {resolved:false,reason:'no-target'};
  const selection=chooseAswanApparitionRecovery(options,selectedUid);
  if(!selection)return {resolved:false,reason:'no-target'};
  try{
    const nextCore=structuredClone(game.core);
    const player=nextCore.players[snapshot.team];
    const index=player.grave.findIndex(card=>card.uid===selectedUid);
    if(index<0)return {resolved:false,reason:'no-target'};
    const [card]=player.grave.splice(index,1);
    if(physicalSeatFromBattleDamageUid(card.uid)!==selection.card.physicalOwnerSeat)
      return {resolved:false,reason:'invalid-state'};
    player.deck.unshift(card);
    const nextGame:TagDuel={...game,core:nextCore};
    return {resolved:true,noOp:false,card:selection.card,deckTopSeat:snapshot.activeSeat,
      nextGame,processedEventIds:[...processedEventIds,snapshot.eventId]};
  }catch{return {resolved:false,reason:'invalid-state'};}
}
