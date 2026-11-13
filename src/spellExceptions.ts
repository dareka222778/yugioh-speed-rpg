/** Named escape hatch for operations not migrated into the shared vocabulary.
 * Handlers receive core services; no Discord, network, DB or text interpreter.
 */
import {canAffectMonster} from './continuousEffects';
import type {DuelState,Pending} from './duelEngine';
import type {EffectServices} from './classicEffects';
type Handler=(s:DuelState,a:Extract<Pending,{kind:'spell'}>,service:EffectServices)=>void;
const handlers:Readonly<Record<string,Handler>>={
 '72892473':(s,a,service)=>{
  // In classic 2v2, each physical participant owns a private hand and Deck.
  // A team-wide "each player" effect must visit both active seats and both
  // reserves; only the Graveyard is shared by teammates.
  const physical=s.teamRotation
   ?Array.from({length:4},(_,seat)=>{
    const team=seat%2;
    const zones=s.teamRotation!.active[team]===seat?s.players[team]:s.teamRotation!.reserves[seat];
    if(!zones)throw new Error('Reserva física ausente para Destruição de Cards.');
    return {team,zones};
   })
   :s.players.map((zones,team)=>({team,zones}));
  const needed=physical.map(({zones})=>zones.hand.length);
  const failed=physical.map(({zones},index)=>zones.deck.length<needed[index]);
  for(const [index,{team,zones}]of physical.entries()){
   const discarded=zones.hand.splice(0,zones.hand.length);
   s.players[team].grave.push(...discarded);
   zones.hand.push(...zones.deck.splice(0,needed[index]));
  }
  const failedTeams=[0,1].map(team=>physical.some((entry,index)=>entry.team===team&&failed[index]));
  service.note(s,s.teamRotation
   ?'Destruição de Cards: as quatro mãos físicas foram descartadas e recompradas.'
   :'Destruição de Cards: as duas mãos foram descartadas e recompradas.');
  if(failedTeams[0]&&failedTeams[1])service.finish(s,null,'ambos não conseguiram comprar as cartas');
  else if(failedTeams[0]||failedTeams[1])service.finish(s,failedTeams[0]?1:0,'não conseguiu comprar uma carta');
 },
 '52097679':(s,a,service)=>{
  for(const p of s.players)for(const m of p.monsters)if(m.faceUp&&canAffectMonster(s,m.uid,'spell'))m.swappedUntil=m.swappedUntil===s.turn?undefined:s.turn;
  service.note(s,'ATK e DEF originais dos monstros revelados foram trocados até o fim do turno.');
 }
};
export const spellExceptionIds=Object.freeze(Object.keys(handlers));
export function resolveSpellException(s:DuelState,a:Extract<Pending,{kind:'spell'}>,service:EffectServices):boolean{
 const handler=handlers[a.id];if(!handler)return false;handler(s,a,service);return true;
}
