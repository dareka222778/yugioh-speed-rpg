import { identityTributeEligibility, payIdentityTributes, type IdentityTributeEligibility } from './identityScopedTribute';
export const THREE_HUMP_LACOODA_ID='86988864';
export const THREE_HUMP_LACOODA_DRAW_COUNT=3;
export const THREE_HUMP_LACOODA_REQUIRED_COPIES=3;
export const THREE_HUMP_LACOODA_TRIBUTE_COUNT=2;
export type PhysicalSeat=0|1|2|3;
export type DuelTeam=0|1;
export type PhysicalCardRef={readonly uid:string;readonly id:string};
export type ThreeHumpFieldCard=PhysicalCardRef&{readonly faceUp:boolean;readonly owner:DuelTeam};
export type ThreeHumpSeatZones={readonly deck:PhysicalCardRef[];readonly hand:PhysicalCardRef[]};
export type ThreeHumpState={readonly field:ThreeHumpFieldCard[];readonly grave:PhysicalCardRef[];readonly seats:Readonly<Record<PhysicalSeat,ThreeHumpSeatZones>>;readonly activeSeat:PhysicalSeat;readonly activeTeam:DuelTeam};
export type TagDuelLike={
  readonly mode:'tag-classic';readonly active:readonly [number,number];readonly cursor:number;
  readonly reserves:Readonly<Record<string,{readonly deck:PhysicalCardRef[];readonly hand:PhysicalCardRef[]}>>;
  readonly core:{readonly current:number;readonly players:readonly [
    {readonly monsters:ThreeHumpFieldCard[];readonly grave:PhysicalCardRef[];readonly deck:PhysicalCardRef[];readonly hand:PhysicalCardRef[]},
    {readonly monsters:ThreeHumpFieldCard[];readonly grave:PhysicalCardRef[];readonly deck:PhysicalCardRef[];readonly hand:PhysicalCardRef[]}
  ]};
};
export type ThreeHumpActivation={readonly sourceUid:string;readonly activeSeat:PhysicalSeat;readonly activeTeam:DuelTeam;readonly eligibleUids:readonly string[]};
export type ThreeHumpPaidCost={readonly sourceUid:string;readonly activeSeat:PhysicalSeat;readonly activeTeam:DuelTeam;readonly tributedUids:readonly string[];status:'paid'|'resolved'};
export type ThreeHumpDrawResolution={readonly activeSeat:PhysicalSeat;readonly drawn:readonly PhysicalCardRef[];readonly deckOut:boolean;readonly negated:boolean;readonly deckSizeAfter:number;readonly handSizeAfter:number;readonly costPaid:true};
function isSeat(v:number):v is PhysicalSeat{return Number.isInteger(v)&&v>=0&&v<=3;}
function physicalSeatFromUid(uid:string):PhysicalSeat|null{const m=/^m([0-3]):/.exec(uid);return m?Number(m[1]) as PhysicalSeat:null;}

/** Project the real TagDuel shape: core.players[team] belongs to active[team],
 * while inactive physical seats live in reserves[seat]. The active player is
 * active[core.current], not cursor when an overflow-return seat is pending. */
export function threeHumpStateFromTagDuel(s:TagDuelLike):ThreeHumpState{
  if(!s||s.mode!=='tag-classic'||!Array.isArray(s.active)||!s.reserves||!s.core||!Array.isArray(s.core.players)||s.core.players.length!==2)throw new TypeError('3-Hump Lacooda requires a classic TagDuel state.');
  const team=s.core.current;
  if((team!==0&&team!==1)||s.cursor%2!==team)throw new Error('3-Hump Lacooda TagDuel team/cursor is inconsistent.');
  const activeSeat=s.active[team];
  if(!isSeat(activeSeat)||activeSeat%2!==team)throw new Error('3-Hump Lacooda active representative is invalid.');
  const seats={} as Record<PhysicalSeat,ThreeHumpSeatZones>;
  for(const seat of [0,1,2,3] as const){
    const t=(seat%2) as DuelTeam;
    const held=s.active[t]===seat?s.core.players[t]:s.reserves[String(seat)];
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand))throw new Error('3-Hump Lacooda cannot resolve physical seat '+seat+' zones.');
    seats[seat]={deck:held.deck,hand:held.hand};
  }
  return {field:s.core.players[team].monsters,grave:s.core.players[team].grave,seats,activeSeat,activeTeam:team};
}
function assertState(state:ThreeHumpState):void{
  if(!state||!Array.isArray(state.field)||!Array.isArray(state.grave)||!state.seats)throw new TypeError('3-Hump Lacooda state is incomplete.');
  if(!isSeat(state.activeSeat)||(state.activeTeam!==0&&state.activeTeam!==1))throw new RangeError('3-Hump Lacooda active seat/team is invalid.');
  if(state.activeSeat%2!==state.activeTeam)throw new Error('3-Hump Lacooda active seat does not belong to the controlling team.');
  const seen=new Set<string>();
  const add=(card:PhysicalCardRef,zone:string,expectedOwner?:PhysicalSeat):void=>{
    if(!card||typeof card.uid!=='string'||!card.uid||typeof card.id!=='string'||!card.id)throw new TypeError('3-Hump Lacooda '+zone+' contains an invalid physical card.');
    const owner=physicalSeatFromUid(card.uid);
    if(expectedOwner!==undefined&&owner===null)throw new Error('3-Hump Lacooda card UID has no physical seat prefix.');
    if(expectedOwner!==undefined&&owner!==expectedOwner)throw new Error('3-Hump Lacooda '+zone+' contains a card owned by another physical seat.');
    if(seen.has(card.uid))throw new Error('3-Hump Lacooda state contains a duplicate physical UID.');
    seen.add(card.uid);
  };
  for(const card of state.field){add(card,'field');if(typeof card.faceUp!=='boolean'||card.owner!==state.activeTeam)throw new Error('3-Hump Lacooda field must contain only this team controlled Monster Zones.');}
  for(const card of state.grave)add(card,'Graveyard');
  for(const seat of [0,1,2,3] as const){
    const zones=state.seats[seat];
    if(!zones||!Array.isArray(zones.deck)||!Array.isArray(zones.hand))throw new TypeError('3-Hump Lacooda private zones for seat '+seat+' are incomplete.');
    for(const card of zones.deck)add(card,'seat '+seat+' Deck',seat);
    for(const card of zones.hand)add(card,'seat '+seat+' hand',seat);
  }
}
export function prepareThreeHumpLacooda(state:ThreeHumpState,sourceUid:string):ThreeHumpActivation|null{
  assertState(state);
  if(state.seats[state.activeSeat].deck.length<THREE_HUMP_LACOODA_DRAW_COUNT)return null;
  const e=identityTributeEligibility(state.field,sourceUid,THREE_HUMP_LACOODA_ID,THREE_HUMP_LACOODA_REQUIRED_COPIES,THREE_HUMP_LACOODA_TRIBUTE_COUNT);
  if(!e)return null;
  if(e.candidates.some(c=>physicalSeatFromUid(c.uid)===null))throw new Error('3-Hump Lacooda field copy has no physical seat UID.');
  return Object.freeze({sourceUid,activeSeat:state.activeSeat,activeTeam:state.activeTeam,eligibleUids:Object.freeze(e.candidates.map(c=>c.uid))});
}
export function payThreeHumpLacoodaCost(state:ThreeHumpState,activation:ThreeHumpActivation,selectedUids:readonly string[]):ThreeHumpPaidCost|null{
  assertState(state);
  if(!activation||!Array.isArray(activation.eligibleUids)||state.activeSeat!==activation.activeSeat||state.activeTeam!==activation.activeTeam)return null;
  if(state.seats[activation.activeSeat].deck.length<THREE_HUMP_LACOODA_DRAW_COUNT)return null;
  if(!Array.isArray(selectedUids)||selectedUids.length!==THREE_HUMP_LACOODA_TRIBUTE_COUNT||selectedUids.some(uid=>!activation.eligibleUids.includes(uid)))return null;
  const e:IdentityTributeEligibility<ThreeHumpFieldCard>|null=identityTributeEligibility(state.field,activation.sourceUid,THREE_HUMP_LACOODA_ID,THREE_HUMP_LACOODA_REQUIRED_COPIES,THREE_HUMP_LACOODA_TRIBUTE_COUNT);
  if(!e)return null;
  const tributed=payIdentityTributes(state.field,state.grave,e,selectedUids);
  if(!tributed)return null;
  return {sourceUid:activation.sourceUid,activeSeat:activation.activeSeat,activeTeam:activation.activeTeam,tributedUids:Object.freeze(tributed.map(c=>c.uid)),status:'paid'};
}
/** Negation never refunds cost. Draw from the physical seat captured at activation.
 * A short Deck at resolution is reported for the engine's deck-out rule.
 * Hand overflow is left for the End Phase hand-limit flow. */
export function resolveThreeHumpLacoodaDraw(state:ThreeHumpState,cost:ThreeHumpPaidCost,effectNegated=false):ThreeHumpDrawResolution|null{
  assertState(state);
  if(!cost||cost.status!=='paid'||!isSeat(cost.activeSeat)||cost.activeSeat%2!==cost.activeTeam||state.activeTeam!==cost.activeTeam||!Array.isArray(cost.tributedUids)||cost.tributedUids.length!==THREE_HUMP_LACOODA_TRIBUTE_COUNT)return null;
  const zones=state.seats[cost.activeSeat];
  if(effectNegated){cost.status='resolved';return {activeSeat:cost.activeSeat,drawn:Object.freeze([]),deckOut:false,negated:true,deckSizeAfter:zones.deck.length,handSizeAfter:zones.hand.length,costPaid:true};}
  const count=Math.min(THREE_HUMP_LACOODA_DRAW_COUNT,zones.deck.length);
  const drawn=zones.deck.splice(0,count);zones.hand.push(...drawn);cost.status='resolved';
  return {activeSeat:cost.activeSeat,drawn:Object.freeze([...drawn]),deckOut:count<THREE_HUMP_LACOODA_DRAW_COUNT,negated:false,deckSizeAfter:zones.deck.length,handSizeAfter:zones.hand.length,costPaid:true};
}
