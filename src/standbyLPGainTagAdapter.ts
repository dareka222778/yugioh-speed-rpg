import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {monsterEffectsNegated} from './continuousEffects';

export const CURE_MERMAID_ID='85802526';
export const SPIRIT_OF_THE_BREEZE_ID='53530069';

type Team=0|1;
type AdapterIds={cureMermaidId?:string;spiritOfTheBreezeId?:string};
export type StandbyLPSession={duel:TagDuel;appliedKeys:string[]};
export type StandbyLPGainSource={uid:string;id:string;physicalOwnerSeat:number;amount:number;condition:'face-up'|'face-up-attack'};
export type StandbyLPGainResult={team:Team;turn:number;gain:number;lpBefore:number;lpAfter:number;sources:StandbyLPGainSource[];applied:true;sharedTeamLP:true};
export type StandbyLPGainApplication={session:StandbyLPSession;result:StandbyLPGainResult};

function physicalSeat(uid:string):number{
 const match=/^m([0-3]):/.exec(uid);
 if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
 return Number(match[1]);
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const snapshot=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(snapshot.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  physicalSeat(card.uid);
  snapshot.set(card.uid,card.id);
 }
 return snapshot;
}
function hasPendingStandbyTask(duel:TagDuel,team:Team):boolean{
 const flow=duel.core.standby;
 if(!flow)return false;
 if(flow.active)return true;
 return flow.tasks.some(task=>task.turn<=duel.core.turn&&task.actor===team&&!flow.completed.some(done=>done.id===task.id));
}
function assertSession(session:StandbyLPSession):void{
 if(!session||!Array.isArray(session.appliedKeys)||new Set(session.appliedKeys).size!==session.appliedKeys.length||session.appliedKeys.some(key=>typeof key!=='string'||!/^[0-9]+:[01]$/.test(key)))throw new Error('Sessão de recuperação de LP inválida.');
 assertTagDuel(session.duel);
 if(session.duel.mode!=='tag-classic')throw new Error('A recuperação de LP exige TagDuel clássico.');
}

/** Call after the shared Standby task queue has drained (advanceStandby returned false). */
export function createStandbyLPSession(duel:TagDuel):StandbyLPSession{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('A recuperação de LP exige TagDuel clássico.');
 return {duel:structuredClone(duel),appliedKeys:[]};
}

/**
 * Applies the two continuous Standby LP effects atomically to the team's shared LP.
 * Cure Mermaid works in either face-up battle position; Spirit of the Breeze requires
 * face-up Attack Position. The adapter never moves cards or changes inventory.
 */
export function applyStandbyLPGains(session:StandbyLPSession,team:Team,ids:AdapterIds={}):StandbyLPGainApplication{
 assertSession(session);
 const duel=session.duel;
 if(![0,1].includes(team)||duel.core.current!==team||duel.core.phase!=='main')throw new Error('A equipe não está na janela de Standby aplicável.');
 if(hasPendingStandbyTask(duel,team))throw new Error('Resolva a fila de efeitos da Standby antes da recuperação contínua.');
 const turn=duel.core.turn,key=turn+':'+team;
 if(session.appliedKeys.includes(key))throw new Error('Recuperação de LP já aplicada nesta Standby.');
 const before=inventorySnapshot(duel),next=structuredClone(session);
 const cureId=ids.cureMermaidId??CURE_MERMAID_ID;
 const breezeId=ids.spiritOfTheBreezeId??SPIRIT_OF_THE_BREEZE_ID;
 const sources:StandbyLPGainSource[]=[];
 for(const monster of next.duel.core.players[team].monsters){
  if(!monster.faceUp||monsterEffectsNegated(next.duel.core,monster.uid))continue;
  if(monster.id===cureId){
   sources.push({uid:monster.uid,id:monster.id,physicalOwnerSeat:physicalSeat(monster.uid),amount:800,condition:'face-up'});
  }else if(monster.id===breezeId&&monster.position==='atk'){
   sources.push({uid:monster.uid,id:monster.id,physicalOwnerSeat:physicalSeat(monster.uid),amount:1000,condition:'face-up-attack'});
  }
 }
 sources.sort((a,b)=>a.uid.localeCompare(b.uid));
 const gain=sources.reduce((sum,source)=>sum+source.amount,0);
 const lpBefore=next.duel.core.players[team].lp;
 next.duel.core.players[team].lp+=gain;
 next.appliedKeys.push(key);
 assertTagDuel(next.duel);
 const after=inventorySnapshot(next.duel);
 if(before.size!==after.size||[...before].some(([uid,id])=>after.get(uid)!==id))throw new Error('A recuperação de LP alterou o inventário físico.');
 return {session:next,result:{team,turn,gain,lpBefore,lpAfter:next.duel.core.players[team].lp,sources,applied:true,sharedTeamLP:true}};
}
