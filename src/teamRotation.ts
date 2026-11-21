/** Optional serialized four-seat coordination. Absent in all ordinary 1v1 games. */
import type {CardRef,DuelState} from './duelEngine';
export type TeamHeld={hand:CardRef[];deck:CardRef[];extra:CardRef[]};
export type TeamRotation={version:1;cursor:number;active:[number,number];reserves:Record<string,TeamHeld>;overflowReturn?:{team:0|1;seat:number}};
export function teamReserveCards(s:DuelState):CardRef[]{return s.teamRotation?Object.values(s.teamRotation.reserves).flatMap(h=>[...h.hand,...h.deck,...h.extra]):[];}
/** Shared public zones do not change the physical owner of a private destination. */
export function ownedPrivateZone(s:DuelState,ref:CardRef,fallbackTeam:number,zone:'hand'|'deck'|'extra'):CardRef[]{
 const r=s.teamRotation;if(!r)return s.players[fallbackTeam][zone]??=[];
 const match=/^m([0-3]):/.exec(ref.uid);if(!match)throw Error('Proprietário físico da carta ausente.');
 const seat=Number(match[1]),team=seat%2;
 if(r.active[team]===seat)return s.players[team][zone]??=[];
 const held=r.reserves[seat];if(!held)throw Error('Reserva do proprietário ausente.');return held[zone];
}
export function swapTeamSeat(s:DuelState,seat:number){const r=s.teamRotation;if(!r)return;const team=seat%2;if(r.active[team]===seat)return;const next=r.reserves[seat];if(!next)throw Error('Reserva de equipe ausente.');const p=s.players[team];r.reserves[r.active[team]]={hand:p.hand,deck:p.deck,extra:p.extra??[]};p.hand=next.hand;p.deck=next.deck;p.extra=next.extra;delete r.reserves[seat];r.active[team]=seat;}
/** A physical card returning to a hand always returns to its original member. */
export function normalizeTeamHands(s:DuelState){const r=s.teamRotation;if(!r)return;for(const p of s.players)for(const zone of ['hand','extra'] as const){const keep:CardRef[]=[];for(const c of p[zone]??[]){const match=/^m([0-3]):/.exec(c.uid);if(!match)throw Error('Proprietário físico da carta ausente.');const seat=Number(match[1]),team=seat%2;if(r.active[team]===seat){if(s.players[team]===p)keep.push(c);else (s.players[team][zone]??=[]).push(c);}else r.reserves[seat][zone].push(c);}p[zone]=keep;}}
export function restoreTeamOverflow(s:DuelState){const r=s.teamRotation;if(r?.overflowReturn&&!s.handFlow){const back=r.overflowReturn;delete r.overflowReturn;swapTeamSeat(s,back.seat);}}
/** Inactive owners must choose their own excess discard; restore the spokesperson afterwards. */
export function prepareTeamOverflow(s:DuelState){const r=s.teamRotation;if(!r)return;restoreTeamOverflow(s);normalizeTeamHands(s);if(s.handFlow||r.overflowReturn||s.players.some(p=>p.hand.length>7))return;const seat=Object.keys(r.reserves).map(Number).find(i=>r.reserves[i].hand.length>7);if(seat!==undefined){const team=seat%2 as 0|1;r.overflowReturn={team,seat:r.active[team]};swapTeamSeat(s,seat);}}
/** Runs only after every End Phase response/trigger resolved, immediately before the incoming draw. */
export function advanceTeamSeats(s:DuelState){const r=s.teamRotation;if(!r)return;restoreTeamOverflow(s);r.cursor=(r.cursor+1)%4;swapTeamSeat(s,r.cursor);}
