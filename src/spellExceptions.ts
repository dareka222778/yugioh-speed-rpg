/** Named escape hatch for operations not migrated into the shared vocabulary.
 * Handlers receive core services; no Discord, network, DB or text interpreter.
 */
import {canAffectMonster} from './continuousEffects';
import type {DuelState,Pending} from './duelEngine';
import type {EffectServices} from './classicEffects';
type Handler=(s:DuelState,a:Extract<Pending,{kind:'spell'}>,service:EffectServices)=>void;
const handlers:Readonly<Record<string,Handler>>={
 '72892473':(s,a,service)=>{
  const need=s.players.map(p=>p.hand.length),failed=s.players.map((p,i)=>p.deck.length<need[i]);
  for(const [i,p]of s.players.entries()){p.grave.push(...p.hand);p.hand=p.deck.splice(0,need[i]);}
  service.note(s,'Destruição de Cards: as duas mãos foram descartadas e recompradas.');
  if(failed[0]&&failed[1])service.finish(s,null,'ambos não conseguiram comprar as cartas');
  else if(failed.some(Boolean))service.finish(s,failed[0]?1:0,'não conseguiu comprar uma carta');
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
