import type {DuelState} from './duelEngineCurrent';
import {economicOperationIssues,executeEconomicOperations,type EconomicOperation,type EconomicServices} from './economicOperations';
import {targetBindingValid,type TargetBinding} from './cardLifetime';
export type StandbyOption={id:string;label:string;operations:EconomicOperation[];target?:TargetBinding};
export type StandbyTask={id:string;turn:number;actor:0|1;optional:boolean;costLP?:number;options:StandbyOption[]};
export type StandbyFlow={version:1;tasks:StandbyTask[];completed:{id:string;outcome:'chosen'|'declined'|'cancelled';choice?:string}[];active?:{id:string;status:'choosing'|'responding';choice?:string}};
const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9:_-]{1,80}$/.test(value);
/** Trusted scheduling primitive, not a new card activation. No live card is
 * given a Standby effect merely by adding this continuation capability. */
export function scheduleStandbyTask(input:DuelState,task:StandbyTask):DuelState{
 if(!['engine-v2','engine-v3','engine-v4','engine-v5','engine-v6','engine-v7','engine-v8'].includes(input.resolverVersion??'')||input.rulesVersion!=='speed-rpg-classic-v1'||input.phase==='finished')throw new Error('Agendamento incompatível com este duelo.');
 const s=structuredClone(input),flow=s.standby??={version:1,tasks:[],completed:[]};
 if(flow.tasks.some(t=>t.id===task.id))throw new Error('Operação de Espera já agendada.');
 if(task.turn<=s.turn)throw new Error('Agende uma Espera futura.');
 flow.tasks.push(structuredClone(task));assertStandbyFlow(s);return s;
}
export function assertStandbyFlow(s:DuelState):void{
 const fail=()=>{throw new Error('Estado da continuação de Espera inválido.');};
 const flow=s.standby;if(flow===undefined){if(s.choice?.source==='standby'||s.pending.kind==='standby'||s.chainRoot?.kind==='standby')fail();return;}
 if(!flow||!['engine-v2','engine-v3','engine-v4','engine-v5','engine-v6','engine-v7','engine-v8'].includes(s.resolverVersion??'')||s.rulesVersion!=='speed-rpg-classic-v1'||flow.version!==1||!Array.isArray(flow.tasks)||flow.tasks.length>128||!Array.isArray(flow.completed)||flow.completed.length>flow.tasks.length)fail();
 const ids=new Set<string>();for(const task of flow.tasks){
  if(!task||!identifier(task.id)||ids.has(task.id)||!Number.isSafeInteger(task.turn)||task.turn<1||![0,1].includes(task.actor)||typeof task.optional!=='boolean'||task.costLP!==undefined&&(!Number.isSafeInteger(task.costLP)||task.costLP<0)||!Array.isArray(task.options)||!task.options.length||task.options.length>12)fail();ids.add(task.id);
  const choices=new Set<string>();for(const option of task.options){if(!option||!identifier(option.id)||option.id==='__skip__'||choices.has(option.id)||typeof option.label!=='string'||!option.label.trim()||option.label.length>100||economicOperationIssues(option.operations).length)fail();choices.add(option.id);
   if(option.target&&(!identifier(option.target.uid)||!Number.isSafeInteger(option.target.epoch)||option.target.epoch<0||!['deck','hand','monsters','backrow','grave','extra','banished','field'].includes(option.target.zone)))fail();
  }
 }
 const done=new Set<string>();for(const result of flow.completed){if(!result||!ids.has(result.id)||done.has(result.id)||!['chosen','declined','cancelled'].includes(result.outcome)||result.outcome==='chosen'&&!flow.tasks.find(t=>t.id===result.id)?.options.some(o=>o.id===result.choice))fail();done.add(result.id);}
 if(flow.active){const task=flow.tasks.find(t=>t.id===flow.active!.id);if(!task||done.has(task.id)||!['choosing','responding'].includes(flow.active.status))fail();
  if(flow.active.status==='choosing'&&(s.phase!=='choice'||s.choice?.source!=='standby'||s.choice.actor!==task!.actor))fail();
  if(flow.active.status==='choosing'&&s.choice?.targets.some(id=>id!=='__skip__'&&!task!.options.some(o=>o.id===id)||id==='__skip__'&&!task!.optional))fail();
  if(flow.active.status==='responding'&&!task!.options.some(o=>o.id===flow.active!.choice))fail();
  if(flow.active.status==='responding'&&![s.pending,s.chainRoot].some(p=>p?.kind==='standby'&&p.taskId===flow.active!.id&&p.choiceId===flow.active!.choice))fail();
 }
 if(s.choice?.source==='standby'&&flow.active?.status!=='choosing')fail();
 for(const pending of [s.pending,s.chainRoot])if(pending?.kind==='standby'&&(flow.active?.status!=='responding'||flow.active.id!==pending.taskId||flow.active.choice!==pending.choiceId||flow.tasks.find(t=>t.id===pending.taskId)?.actor!==pending.actor))fail();
}
export function advanceStandby(s:DuelState):boolean{
 const flow=s.standby;if(!flow||s.phase!=='main'||flow.active||s.graveTriggers?.length||s.summonTriggers?.length)return false;
 for(const task of flow.tasks.filter(t=>t.turn<=s.turn&&t.actor===s.current&&!flow.completed.some(r=>r.id===t.id))){
  const options=task.options.filter(o=>targetBindingValid(s,o.target));
  if(!options.length||s.players[task.actor].lp<=(task.costLP??0)){flow.completed.push({id:task.id,outcome:'cancelled'});continue;}
  flow.active={id:task.id,status:'choosing'};s.choice={actor:task.actor,source:'standby',targets:[...options.map(o=>o.id),...task.optional?['__skip__']:[]]};s.phase='choice';return true;
 }
 return false;
}
export function chooseStandby(s:DuelState,actor:number,choice:string):void{
 const flow=s.standby,task=flow?.tasks.find(t=>t.id===flow.active?.id);
 if(!flow||!task||flow.active?.status!=='choosing'||actor!==task.actor||!s.choice?.targets.includes(choice))throw new Error('Escolha de Espera inválida.');
 if(choice==='__skip__'){if(!task.optional)throw new Error('Escolha obrigatória.');flow.completed.push({id:task.id,outcome:'declined'});delete flow.active;s.phase='main';delete s.choice;advanceStandby(s);return;}
 const option=task.options.find(o=>o.id===choice);if(!option||!targetBindingValid(s,option.target))throw new Error('Alvo da Espera inválido.');
 const cost=task.costLP??0;if(s.players[actor].lp<=cost)throw new Error('PV insuficientes para o custo.');s.players[actor].lp-=cost;
 flow.active={id:task.id,status:'responding',choice};s.choice=undefined;s.pending={kind:'standby',actor,card:'standby:'+task.id,taskId:task.id,choiceId:choice};s.phase='response';s.resume='main';s.priority=1-actor;s.passes=0;s.chain=[];
}
export function resolveStandby(s:DuelState,taskId:string,choiceId:string,service:EconomicServices):void{
 const flow=s.standby,task=flow?.tasks.find(t=>t.id===taskId),option=task?.options.find(o=>o.id===choiceId);
 if(!flow||!task||!option||flow.active?.status!=='responding'||flow.active.id!==taskId||flow.active.choice!==choiceId||flow.completed.some(r=>r.id===taskId))throw new Error('Retomada de Espera inválida.');
 flow.completed.push({id:task.id,outcome:'chosen',choice:choiceId});delete flow.active;
 if(targetBindingValid(s,option.target))executeEconomicOperations(s,task.actor,option.operations,service);
}
export function closeStandby(s:DuelState):void{if(s.standby){for(const task of s.standby.tasks)if(!s.standby.completed.some(r=>r.id===task.id))s.standby.completed.push({id:task.id,outcome:'cancelled'});delete s.standby.active;}}
