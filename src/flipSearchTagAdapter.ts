import {getDuelCard,getEffect as getDuelEffect} from './effectRegistry';
import type {Card} from './cardCatalog';
import {
  flipSearchTargets,
  resolveFlipSearchChoice,
  type FlipSearchCardId,
  type FlipSearchDestinationChoice,
} from './flipSearchCards';
import type {TagDuel} from './tagDuel';

export const NECROVALLEY_CARD_ID='47355498';
export type FlipSearchTagTeam=0|1;
export type FlipSearchTagSeat=0|1|2|3;
type TagPlayer=TagDuel['core']['players'][number];
type TagMonster=TagPlayer['monsters'][number];

export type FlipSearchTagSnapshot=Readonly<{
  eventId:string;
  turn:number;
  team:FlipSearchTagTeam;
  activeSeat:FlipSearchTagSeat;
  sourceUid:string;
  sourcePhysicalOwnerSeat:FlipSearchTagSeat;
  cardId:FlipSearchCardId;
  wasFaceDownAtFlip:true;
}>;

export type FlipSearchTagCandidate=Readonly<{
  uid:string;
  cardId:string;
  physicalOwnerSeat:FlipSearchTagSeat;
}>;

export type FlipSearchTagProjection=Readonly<{
  snapshot:FlipSearchTagSnapshot;
  candidates:readonly FlipSearchTagCandidate[];
  necrovalleyFaceUpAtResolution:boolean;
  handAlternativeAvailable:boolean;
}>;

export type FlipSearchTagResolution=
  | Readonly<{resolved:false;reason:'not-tag-classic'|'invalid-trigger'|'stale-trigger'|'duplicate-event'|'no-target'|'invalid-choice'|'stale-selection'|'invalid-state'}>
  | Readonly<{
      resolved:true;noOp:true;cardId:FlipSearchCardId;selectedUid:null;
      physicalOwnerSeat:null;destination:null;shuffleDeck:false;
      necrovalleyFaceUpAtResolution:boolean;nextGame:TagDuel;
      processedEventIds:readonly string[];
    }>
  | Readonly<{
      resolved:true;noOp:false;cardId:FlipSearchCardId;selectedUid:string;
      physicalOwnerSeat:FlipSearchTagSeat;destination:'hand'|'deck-top';
      shuffleDeck:boolean;necrovalleyFaceUpAtResolution:boolean;
      nextGame:TagDuel;processedEventIds:readonly string[];
    }>;

const isSeat=(value:unknown):value is FlipSearchTagSeat=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
const isTeam=(value:unknown):value is FlipSearchTagTeam=>value===0||value===1;
export function physicalSeatFromFlipSearchUid(uid:string):FlipSearchTagSeat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as FlipSearchTagSeat:null;
}

function phaseAllowsFlipResolution(game:TagDuel):boolean{
  return !!game&&!!game.core&&['main','battle','response','choice'].includes(game.core.phase);
}
function isFaceUpNecrovalley(game:TagDuel):boolean{
  return game.core.players.some(player=>{
    const field=player.field as unknown as {id?:unknown;faceUp?:unknown}|null|undefined;
    return !!field&&field.id===NECROVALLEY_CARD_ID&&field.faceUp===true;
  });
}
function sourceMonster(game:TagDuel,team:FlipSearchTagTeam,uid:string,cardId?:string):TagMonster|null{
  const player=game.core.players[team];
  if(!player||!Array.isArray(player.monsters)||player.monsters.length>3)return null;
  const card=player.monsters.find(monster=>monster&&monster.uid===uid);
  if(!card||card.faceUp!==true||typeof card.id!=='string'||
    (card.id!=='24140059'&&card.id!=='23927567')||
    (cardId!==undefined&&card.id!==cardId))return null;
  return card;
}

export function captureTagFlipSearchTrigger(
  game:TagDuel,eventId:string,team:FlipSearchTagTeam,sourceUid:string,wasFaceDownAtFlip:boolean
):FlipSearchTagSnapshot|null{
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !phaseAllowsFlipResolution(game)||!isTeam(team)||typeof eventId!=='string'||
    !eventId.trim()||eventId.length>128||typeof sourceUid!=='string'||!sourceUid||
    wasFaceDownAtFlip!==true||!Number.isSafeInteger(game.core.turn)||game.core.turn<1)return null;
  const activeSeat=game.active[team];
  if(!isSeat(activeSeat)||activeSeat%2!==team)return null;
  const source=sourceMonster(game,team,sourceUid);
  if(!source)return null;
  const sourcePhysicalOwnerSeat=physicalSeatFromFlipSearchUid(source.uid);
  if(sourcePhysicalOwnerSeat===null)return null;
  return {
    eventId,turn:game.core.turn,team,activeSeat,sourceUid,
    sourcePhysicalOwnerSeat,cardId:source.id as FlipSearchCardId,wasFaceDownAtFlip:true
  };
}

function currentSnapshot(game:TagDuel,snapshot:FlipSearchTagSnapshot):boolean{
  if(!snapshot||typeof snapshot!=='object'||typeof snapshot.eventId!=='string'||
    !snapshot.eventId.trim()||snapshot.eventId.length>128||
    !isTeam(snapshot.team)||!isSeat(snapshot.activeSeat)||
    !isSeat(snapshot.sourcePhysicalOwnerSeat)||typeof snapshot.sourceUid!=='string'||
    !snapshot.sourceUid||snapshot.wasFaceDownAtFlip!==true||
    (snapshot.cardId!=='24140059'&&snapshot.cardId!=='23927567')||
    !Number.isSafeInteger(snapshot.turn)||snapshot.turn<1)return false;
  if(!game||game.mode!=='tag-classic'||!game.core||!Array.isArray(game.core.players)||
    game.core.players.length!==2||!Array.isArray(game.active)||game.active.length!==2||
    !phaseAllowsFlipResolution(game)||game.core.turn!==snapshot.turn||
    game.active[snapshot.team]!==snapshot.activeSeat||
    snapshot.activeSeat%2!==snapshot.team)return false;
  const source=sourceMonster(game,snapshot.team,snapshot.sourceUid,snapshot.cardId);
  return !!source&&physicalSeatFromFlipSearchUid(source.uid)===snapshot.sourcePhysicalOwnerSeat;
}

/** Candidate discovery happens at resolution and reads only the active physical
 * seat's Deck held in the team's core player. Partner reserves are never enumerated. */
export function projectTagFlipSearchState(
  game:TagDuel,snapshot:FlipSearchTagSnapshot,
  getCard:(id:string)=>Card|undefined=getDuelCard,
  getEffect:(id:string)=>{kind:string}|undefined=getDuelEffect
):FlipSearchTagProjection|null{
  if(!currentSnapshot(game,snapshot))return null;
  const refs=flipSearchTargets(game.core,snapshot.team,snapshot.cardId,getCard,getEffect);
  const candidates:FlipSearchTagCandidate[]=[];
  const seen=new Set<string>();
  for(const ref of refs){
    if(!ref||typeof ref.uid!=='string'||typeof ref.id!=='string'||seen.has(ref.uid))return null;
    const physicalOwnerSeat=physicalSeatFromFlipSearchUid(ref.uid);
    if(physicalOwnerSeat===null||physicalOwnerSeat!==snapshot.activeSeat)return null;
    seen.add(ref.uid);
    candidates.push({uid:ref.uid,cardId:ref.id,physicalOwnerSeat});
  }
  const necrovalleyFaceUpAtResolution=isFaceUpNecrovalley(game);
  return {snapshot,candidates,necrovalleyFaceUpAtResolution,
    handAlternativeAvailable:necrovalleyFaceUpAtResolution};
}

/** Resolve on a cloned TagDuel core. The caller commits nextGame atomically and
 * shuffles only when shuffleDeck is true. A mandatory effect with no legal
 * Deck target resolves as a no-op without changing any card. */
export function resolveTagFlipSearch(
  game:TagDuel,snapshot:FlipSearchTagSnapshot,selectedUid:string|null,
  choice:FlipSearchDestinationChoice,processedEventIds:readonly string[]=[],
  getCard:(id:string)=>Card|undefined=getDuelCard,
  getEffect:(id:string)=>{kind:string}|undefined=getDuelEffect
):FlipSearchTagResolution{
  if(!game||game.mode!=='tag-classic')return {resolved:false,reason:'not-tag-classic'};
  if(!Array.isArray(processedEventIds)||processedEventIds.length>10000||
    processedEventIds.some(id=>typeof id!=='string'||!id||id.length>128)||
    new Set(processedEventIds).size!==processedEventIds.length)return {resolved:false,reason:'invalid-trigger'};
  if(!currentSnapshot(game,snapshot))return {resolved:false,reason:'stale-trigger'};
  if(processedEventIds.includes(snapshot.eventId))return {resolved:false,reason:'duplicate-event'};
  const projection=projectTagFlipSearchState(game,snapshot,getCard,getEffect);
  if(!projection)return {resolved:false,reason:'stale-trigger'};
  if(projection.candidates.length===0){
    if(selectedUid!==null)return {resolved:false,reason:'no-target'};
    return {resolved:true,noOp:true,cardId:snapshot.cardId,selectedUid:null,
      physicalOwnerSeat:null,destination:null,shuffleDeck:false,
      necrovalleyFaceUpAtResolution:projection.necrovalleyFaceUpAtResolution,
      nextGame:game,processedEventIds:[...processedEventIds,snapshot.eventId]};
  }
  if(typeof selectedUid!=='string'||!selectedUid)return {resolved:false,reason:'invalid-choice'};
  if(!projection.candidates.some(card=>card.uid===selectedUid))return {resolved:false,reason:'no-target'};
  if(choice==='hand'&&!projection.necrovalleyFaceUpAtResolution)
    return {resolved:false,reason:'invalid-choice'};
  if(choice!=='hand'&&choice!=='deck-top')return {resolved:false,reason:'invalid-choice'};
  try{
    const nextCore=structuredClone(game.core);
    const result=resolveFlipSearchChoice(
      nextCore,snapshot.team,snapshot.cardId,selectedUid,choice,
      projection.necrovalleyFaceUpAtResolution,getCard,getEffect
    );
    if(!result)return {resolved:false,reason:'stale-selection'};
    const physicalOwnerSeat=physicalSeatFromFlipSearchUid(result.card.uid);
    if(physicalOwnerSeat===null||physicalOwnerSeat!==snapshot.activeSeat)
      return {resolved:false,reason:'invalid-state'};
    const nextGame:TagDuel={...game,core:nextCore};
    return {resolved:true,noOp:false,cardId:snapshot.cardId,selectedUid:result.card.uid,
      physicalOwnerSeat,destination:result.destination,shuffleDeck:result.shuffleDeck,
      necrovalleyFaceUpAtResolution:projection.necrovalleyFaceUpAtResolution,
      nextGame,processedEventIds:[...processedEventIds,snapshot.eventId]};
  }catch{
    return {resolved:false,reason:'invalid-state'};
  }
}
