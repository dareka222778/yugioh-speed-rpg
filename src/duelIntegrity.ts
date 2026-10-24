/** Runtime contracts for the serialized three-zone game. No UI or database writes.
 * The current catalog has no token-generation or card-transformation effect, so
 * each transition must conserve every physical UID and its card identity.
 */
import {getCard} from './collection';
import {getMonsterEffect} from './monsterEffects';
import type {CardRef,DuelState} from './duelEngine';
const phases=new Set(['main','battle','response','choice','discard','finished']);
const pendingKinds=new Set(['none','end','battle','summon','flip','specialSummon','field','fusion','spell','attack','monsterEffect']);
function fail(reason:string):never{throw new Error(`Estado do duelo inválido: ${reason}. Nenhuma ação foi gravada.`);}
function object(value:unknown):value is Record<string,any>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
const integer=(n:unknown,min=0)=>Number.isSafeInteger(n)&&Number(n)>=min;
const actor=(n:unknown)=>n===0||n===1;
export function duelCards(s:DuelState):CardRef[]{return s.players.flatMap(p=>[...p.deck,...p.hand,...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.banished??[],...p.field?[p.field]:[]]);}
export function assertDuelState(value:unknown):asserts value is DuelState{
 if(!object(value)||value.version!==1)fail('versão não reconhecida');
 const s=value as any;
 if(!Array.isArray(s.players)||s.players.length!==2||!actor(s.current)||!actor(s.priority))fail('participantes ou prioridade');
 if(!integer(s.turn,1)||!phases.has(s.phase)||!['main','battle'].includes(s.resume)||!integer(s.passes)||s.passes>2)fail('turno ou fase');
 if(!object(s.pending)||!pendingKinds.has(s.pending.kind)||!Array.isArray(s.chain)||!Array.isArray(s.log)||s.log.some((x:unknown)=>typeof x!=='string'))fail('resolução pendente');
 for(const link of s.chain)if(!object(link)||!actor(link.actor)||typeof link.card!=='string'||typeof link.target!=='string'||!getCard(link.id)||link.negated!==undefined&&typeof link.negated!=='boolean'||link.monsterEffect!==undefined&&(typeof link.monsterEffect!=='boolean'||link.monsterEffect&&!['quick','onOtherSummon'].includes(getMonsterEffect(link.id)?.trigger??'')))fail('elo de corrente');
 if(!['none','end','battle'].includes(s.pending.kind)&&(!actor(s.pending.actor)||typeof s.pending.card!=='string'))fail('origem do efeito');
 if(s.pending.kind==='attack'&&!['declare','damage','calculation'].includes(s.pending.stage))fail('etapa de dano');
 for(const queue of ['graveTriggers','summonTriggers'])if(s[queue]!==undefined&&(!Array.isArray(s[queue])||s[queue].some((e:any)=>!object(e)||!actor(e.actor)||typeof e.card!=='string'||!getCard(e.id))))fail('fila de gatilhos');
 if(s.turnEnding!==undefined&&typeof s.turnEnding!=='boolean')fail('encerramento de turno');
 const ids=new Set<string>(),uids=new Set<string>();
 for(const p of s.players){
  if(!object(p)||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!integer(p.lp)||typeof p.summoned!=='boolean')fail('dados do participante');
  ids.add(p.id);
  if(p.battleDamageGuard!==undefined&&(!object(p.battleDamageGuard)||!integer(p.battleDamageGuard.turn,1)||typeof p.battleDamageGuard.attacker!=='string'))fail('proteção de dano');
  for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished']){
   const list=p[zone];if(list===undefined&&['extra','banished'].includes(zone))continue;
   if(!Array.isArray(list))fail('zona ausente');
   if((zone==='monsters'||zone==='backrow')&&list.length>3||zone==='extra'&&list.length>6)fail('limite de zonas');
   for(const c of list){
    checkRef(c);const info=getCard(c.id)!;
    if(zone==='monsters'){
     if(info.kind!=='monster'||typeof c.faceUp!=='boolean'||!['atk','def'].includes(c.position)||!integer(c.entered)||!integer(c.changed)||!integer(c.attacked)||!integer(c.atkBoost,Number.MIN_SAFE_INTEGER)||!integer(c.defBoost,Number.MIN_SAFE_INTEGER))fail('monstro inválido');
     if(c.owner!==undefined&&!actor(c.owner)||c.returnTo!==undefined&&!actor(c.returnTo))fail('proprietário do monstro');
    }
    if(zone==='backrow'&&(info.kind==='monster'||!integer(c.setTurn)||typeof c.faceUp!=='boolean'))fail('Magia/Armadilha inválida');
    if(zone==='extra'&&!info.fusion||['deck','hand'].includes(zone)&&info.fusion)fail('Fusão em zona incorreta');
   }
  }
  if(p.field){checkRef(p.field);if(!getCard(p.field.id)?.field||typeof p.field.faceUp!=='boolean'||!integer(p.field.setTurn))fail('Magia de Campo');}
 }
 if(s.winner!==null&&!ids.has(s.winner))fail('vencedor desconhecido');
 if(s.phase!=='finished'&&s.winner!==null)fail('vencedor sem encerramento');
 if(s.phase==='choice'&&(!object(s.choice)||!actor(s.choice.actor)||!Array.isArray(s.choice.targets)||!s.choice.targets.length||s.choice.targets.some((id:unknown)=>typeof id!=='string')))fail('escolha pendente');
 function checkRef(c:unknown):asserts c is CardRef{
  if(!object(c)||typeof c.uid!=='string'||!c.uid||uids.has(c.uid)||typeof c.id!=='string'||!getCard(c.id))fail('identificador de carta ausente, duplicado ou desconhecido');
  if(c.properlySummoned!==undefined&&typeof c.properlySummoned!=='boolean')fail('histórico de Invocação');
  uids.add(c.uid);
 }
}
export function assertDuelTransition(before:DuelState,after:DuelState):void{
 assertDuelState(before);assertDuelState(after);
 const refs=new Map(duelCards(before).map(c=>[c.uid,c.id]));
 const next=duelCards(after);
 if(next.length!==refs.size||next.some(c=>refs.get(c.uid)!==c.id))fail('uma carta foi perdida, duplicada ou transformada');
 if(before.players.some((p,i)=>p.id!==after.players[i].id))fail('participante alterado');
}
