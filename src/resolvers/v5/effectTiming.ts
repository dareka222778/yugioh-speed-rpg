import type {DuelState} from './duelEngineCurrent';
import type {ActivationModel} from './effectModels';
/** Window policy is data. Target existence, costs and Counter-Trap source
 * identity are validated separately, before an activation can be offered. */
export function effectActivationAllowed(s:DuelState,actor:number,a:ActivationModel):boolean{
 const pending=s.pending;
 if(a.window==='main')return s.phase==='main'&&s.current===actor;
 if(a.window==='free')return true;
 if(s.phase!=='response')return false;
 if(a.opponentOnly&&'actor' in pending&&pending.actor===actor)return false;
 if(a.window==='attackDeclared')return pending.kind==='attack'&&pending.stage==='declare';
 if(a.window==='summoned')return (pending.kind==='summon'||pending.kind==='flip'||pending.kind==='specialSummon')&&!!a.summonKinds?.includes(pending.kind);
 return true; // Counter source identity remains in its audited activation handler.
}
