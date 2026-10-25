import {teamReserveCards} from './teamRotation';
import {economicOperationIssues} from './economicOperations';
/** Runtime contracts for the serialized three-zone game. No UI or database writes.
 * The current catalog has no token-generation or card-transformation effect, so
 * each transition must conserve every physical UID and its card identity.
 */
import {getPlayableCard as getCard} from './effectRegistry';
import {assertDuelRandom} from './duelRandom';
import {CARD_DEFINITIONS_VERSION,RULES_PROFILE,rulesFor,supportedRulesVersion} from './rulesProfile';
import {getMonsterEffect} from './monsterEffects';
import type {CardRef,DuelState} from './duelEngine';
const phases=new Set(['main','battle','response','choice','discard','finished']);
const pendingKinds=new Set(['none','end','battle','summon','flip','specialSummon','field','fusion','spell','attack','monsterEffect']);
function fail(reason:string):never{throw new Error(`Estado do duelo inválido: ${reason}. Nenhuma ação foi gravada.`);}
function object(value:unknown):value is Record<string,any>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
const integer=(n:unknown,min=0)=>Number.isSafeInteger(n)&&Number(n)>=min;
const actor=(n:unknown)=>n===0||n===1;
export function duelCards(s:DuelState):CardRef[]{return s.players.flatMap(p=>[...p.deck,...p.hand,...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.banished??[],...p.field?[p.field]:[]]).concat(teamReserveCards(s));}
export function assertDuelState(value:unknown):asserts value is DuelState{
 if(!object(value)||value.version!==1)fail('versão não reconhecida');
 const s=value as any;
 if(!supportedRulesVersion(s.rulesVersion)||s.cardDefinitionsVersion!==undefined&&s.cardDefinitionsVersion!==CARD_DEFINITIONS_VERSION)fail('versão de regras ou definições incompatível');
 if(s.random!==undefined)assertDuelRandom(s.random);
 if(s.rulesVersion==='speed-rpg-v2'&&s.phase==='discard'&&!s.handFlow)fail('descarte sem continuação');
 if(s.handFlow!==undefined){
  const f=s.handFlow;
  if(!object(f)||s.rulesVersion!=='speed-rpg-v2'||s.phase!=='discard'||!actor(f.actor)||!integer(f.remaining)||f.remaining>30||!['draw','overflow'].includes(f.mode)||!['main','battle','response'].includes(f.returnPhase)||!Array.isArray(f.after)||f.after.length>0&&economicOperationIssues(f.after).length>0||f.resumeChainRoot!==undefined&&typeof f.resumeChainRoot!=='boolean'||f.mode==='draw'&&f.remaining<1||f.mode==='overflow'&&f.remaining!==0||f.resumeChainRoot&&!s.chainRoot)fail('continuação de compra/descarte');
 }

 if(!Array.isArray(s.players)||s.players.length!==2||!actor(s.current)||!actor(s.priority))fail('participantes ou prioridade');
 if(!integer(s.turn,1)||!phases.has(s.phase)||!['main','battle'].includes(s.resume)||!integer(s.passes)||s.passes>2)fail('turno ou fase');
 if(!object(s.pending)||!pendingKinds.has(s.pending.kind)||!Array.isArray(s.chain)||!Array.isArray(s.log)||s.log.some((x:unknown)=>typeof x!=='string'))fail('resolução pendente');
 for(const link of s.chain)if(!object(link)||!actor(link.actor)||typeof link.card!=='string'||typeof link.target!=='string'||!getCard(link.id)||link.negated!==undefined&&typeof link.negated!=='boolean'||link.monsterEffect!==undefined&&(typeof link.monsterEffect!=='boolean'||link.monsterEffect&&!['quick','flip','onSummon','onOtherSummon','onSentToGrave','onBattleDestroyed'].includes(getMonsterEffect(link.id)?.trigger??'')))fail('elo de corrente');
 if(!['none','end','battle'].includes(s.pending.kind)&&(!actor(s.pending.actor)||typeof s.pending.card!=='string'))fail('origem do efeito');
 if(s.pending.kind==='attack'&&(['cancelled','endBattle'].some(key=>s.pending[key]!==undefined&&typeof s.pending[key]!=='boolean')))fail('negação de ataque');
 if(s.pending.kind==='attack'&&!['declare','damage','calculation'].includes(s.pending.stage))fail('etapa de dano');
 for(const queue of ['graveTriggers','summonTriggers'])if(s[queue]!==undefined&&(!Array.isArray(s[queue])||s[queue].some((e:any)=>!object(e)||!actor(e.actor)||typeof e.card!=='string'||!getCard(e.id))))fail('fila de gatilhos');
 if(s.triggerBuild!==undefined){
  const build=s.triggerBuild;
  if(!object(build)||!Array.isArray(build.events))fail('construção de corrente');
  for(const event of [...build.events,...build.selected?[build.selected]:[]])if(!object(event)||!actor(event.actor)||typeof event.card!=='string'||!getMonsterEffect(event.id))fail('construção de corrente');
  if(s.phase!=='choice'||!['triggerOrder','triggerTarget','triggerOptional'].includes(s.choice?.source))fail('fase da construção de corrente');
 }
 if(s.pending.kind==='attack'&&s.pending.defenders!==undefined&&(!Array.isArray(s.pending.defenders)||s.pending.defenders.some((uid:unknown)=>typeof uid!=='string')||new Set(s.pending.defenders).size!==s.pending.defenders.length))fail('campo de declaração do ataque');
 if(s.chainRoot!==undefined){
  const root=s.chainRoot;
  if(!object(root)||!pendingKinds.has(root.kind)||!(s.phase==='choice'&&['monsterSearch','monsterRecruit'].includes(s.choice?.source)||s.phase==='discard'&&s.handFlow?.resumeChainRoot))fail('continuação da corrente');
  if(!['none','end','battle'].includes(root.kind)&&(!actor(root.actor)||typeof root.card!=='string'))fail('origem da continuação');
 }
 if(s.phase==='choice'&&['triggerOrder','triggerTarget','triggerOptional'].includes(s.choice?.source)){
  const build=s.triggerBuild;
  if(!build||s.choice.source!=='triggerOrder'&&(!build.selected||build.selected.actor!==s.choice.actor))fail('escolha do gatilho');
 }
 if(s.damageStep!==undefined&&typeof s.damageStep!=='boolean')fail('janela da Etapa de Dano');
 if(s.turnEnding!==undefined&&typeof s.turnEnding!=='boolean')fail('encerramento de turno');
 const ids=new Set<string>(),uids=new Set<string>();
 for(const p of s.players){
  if(!object(p)||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!integer(p.lp)||typeof p.summoned!=='boolean')fail('dados do participante');
  ids.add(p.id);
  if(p.battleDamageGuard!==undefined&&(!object(p.battleDamageGuard)||!integer(p.battleDamageGuard.turn,1)||typeof p.battleDamageGuard.attacker!=='string'))fail('proteção de dano');
  for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished']){
   const list=p[zone];if(list===undefined&&['extra','banished'].includes(zone))continue;
   if(!Array.isArray(list))fail('zona ausente');
   if(zone==='monsters'&&list.length>RULES_PROFILE.monsterZones||zone==='backrow'&&list.length>RULES_PROFILE.spellTrapZones||zone==='extra'&&list.length>rulesFor(s).extraDeckMax)fail('limite de zonas');
   for(const c of list){
    checkRef(c);const info=getCard(c.id)!;
    if(zone==='monsters'){
     if(info.kind!=='monster'||typeof c.faceUp!=='boolean'||(c.position!=='atk'&&c.position!=='def')||!integer(c.entered)||!integer(c.changed)||!integer(c.attacked)||!integer(c.atkBoost,Number.MIN_SAFE_INTEGER)||!integer(c.defBoost,Number.MIN_SAFE_INTEGER))fail('monstro inválido');
     if(c.owner!==undefined&&!actor(c.owner)||c.returnTo!==undefined&&!actor(c.returnTo))fail('proprietário do monstro');
    }
    if(zone==='backrow'&&(info.kind==='monster'||!integer(c.setTurn)||typeof c.faceUp!=='boolean'))fail('Magia/Armadilha inválida');
    if(zone==='extra'&&!info.fusion||['deck','hand'].includes(zone)&&info.fusion)fail('Fusão em zona incorreta');
   }
  }
  if(p.field){checkRef(p.field);if(!getCard(p.field.id)?.field||typeof p.field.faceUp!=='boolean'||!integer(p.field.setTurn))fail('Magia de Campo');}
 }
 if(s.teamRotation!==undefined){
  const r=s.teamRotation;
  if(!object(r)||r.version!==1||!integer(r.cursor)||r.cursor>3||!Array.isArray(r.active)||r.active.length!==2||r.active.some((i:unknown,t:number)=>!integer(i)||Number(i)>3||Number(i)%2!==t)||!object(r.reserves)||Object.keys(r.reserves).length!==2||Object.keys(r.reserves).some(k=>!(/^[0-3]$/).test(k)||r.active.includes(Number(k)))||s.current!==r.cursor%2||s.players.some((p:any,i:number)=>p.id!==`tag-team-${i}`))fail('rotação de equipes');
  if(r.overflowReturn!==undefined&&(!object(r.overflowReturn)||!actor(r.overflowReturn.team)||!integer(r.overflowReturn.seat)||r.overflowReturn.seat>3||r.overflowReturn.seat%2!==r.overflowReturn.team||!r.reserves[r.overflowReturn.seat]))fail('retomada do parceiro');
  if(r.overflowReturn&&s.phase!=='finished'&&(s.phase!=='discard'||s.handFlow?.mode!=='overflow'||s.handFlow?.actor!==r.overflowReturn.team))fail('descarte do parceiro sem continuação');
  if(r.active[s.current]!==r.cursor&&!(r.overflowReturn?.team===s.current&&r.overflowReturn.seat===r.cursor))fail('participante da vez');
  for(const h of Object.values(r.reserves) as any[]){if(!object(h)||!Array.isArray(h.hand)||!Array.isArray(h.deck)||!Array.isArray(h.extra)||h.extra.length>rulesFor(s).extraDeckMax)fail('mão/deck do parceiro');for(const c of [...h.hand,...h.deck]){checkRef(c);if(getCard(c.id)!.fusion)fail('Fusão na mão do parceiro');}for(const c of h.extra){checkRef(c);if(!getCard(c.id)!.fusion)fail('adicional do parceiro');}}
  for(const c of duelCards(s))if(!(/^m[0-3]:/).test(c.uid))fail('proprietário físico de equipe');
  for(const [team,p] of s.players.entries())for(const c of [...p.deck,...p.hand,...p.extra??[]])if(!c.uid.startsWith(`m${r.active[team]}:`))fail('zona privada de outro parceiro');
  for(const [seat,h] of Object.entries(r.reserves) as [string,any][])for(const c of [...h.deck,...h.hand,...h.extra])if(!c.uid.startsWith(`m${seat}:`))fail('reserva privada de outro parceiro');
 }
 if(s.winner!==null&&!ids.has(s.winner))fail('vencedor desconhecido');
 if(s.phase!=='finished'&&s.winner!==null)fail('vencedor sem encerramento');
 if(s.phase==='choice'&&(!object(s.choice)||!actor(s.choice.actor)||!Array.isArray(s.choice.targets)||!s.choice.targets.length||s.choice.targets.some((id:unknown)=>typeof id!=='string')))fail('escolha pendente');
 function checkRef(c:unknown):asserts c is CardRef & Record<string,unknown>{
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
