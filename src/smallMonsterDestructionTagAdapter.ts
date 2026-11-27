import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import type {Monster} from './duelEngine';
import {atk} from './duelEngineCurrent';
import {canAffectMonster,monsterEffectsNegated} from './continuousEffects';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
import {sendMonsterToGrave} from './monsterExit';

export const KING_TIGER_WANGHU_ID='83986578';
export const BLAST_JUGGLER_ID='70138455';
export type SmallMonsterTeam=0|1;
export type SmallMonsterSeat=0|1|2|3;
export type SmallMonsterSummonKind='normal'|'special'|'flip';
export type SmallMonsterEffect='wanghu'|'blast-juggler';
export type SmallMonsterLookup=(id:string)=>{kind:'monster';effect:SmallMonsterEffect}|undefined;
export type WanghuPlan={
 activationId:string;sourceUid:string;sourceOwnerSeat:SmallMonsterSeat;sourceBinding:TargetBinding;
 summonKind:'normal'|'special';turn:number;summonedBindings:TargetBinding[];
};
export type WanghuResolution={
 activationId:string;sourceUid:string;status:'destroyed'|'source-lost'|'no-targets';
 destroyedUids:string[];turn:number;
};
export type BlastJugglerPlan={
 activationId:string;sourceUid:string;sourceOwnerSeat:SmallMonsterSeat;controllerTeam:SmallMonsterTeam;
 turn:number;targetBindings:[TargetBinding,TargetBinding];
};
export type BlastJugglerResolution={
 activationId:string;sourceUid:string;status:'destroyed'|'partial'|'no-targets'|'negated';
 destroyedUids:string[];lostUids:string[];turn:number;
};
export type StandbyWindow={team:SmallMonsterTeam;actorSeat:SmallMonsterSeat;turn:number};
export type SmallMonsterSession={
 duel:TagDuel;wanghuPending:Record<string,WanghuPlan>;wanghuResolved:Record<string,WanghuResolution>;
 blastPending:Record<string,BlastJugglerPlan>;blastResolved:Record<string,BlastJugglerResolution>;
 standbyWindow?:StandbyWindow;
};
export const defaultSmallMonsterLookup:SmallMonsterLookup=(id)=>{
 if(id===KING_TIGER_WANGHU_ID)return {kind:'monster',effect:'wanghu'};
 if(id===BLAST_JUGGLER_ID)return {kind:'monster',effect:'blast-juggler'};
 return undefined;
};
function validTeam(value:unknown):value is SmallMonsterTeam{return value===0||value===1;}
function physicalSeat(uid:string):SmallMonsterSeat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as SmallMonsterSeat:null;
}
function validId(value:unknown):value is string{
 return typeof value==='string'&&value.trim().length>0&&value.length<=128&&/^[-a-zA-Z0-9:_]+$/.test(value);
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||
  duel.core.players.length!==2||!Array.isArray(duel.active)||duel.active.length!==2||
  !Array.isArray(duel.members)||duel.members.length!==4||!duel.reserves||
  !duel.core.teamRotation||!Array.isArray(duel.core.chain)){
  throw new Error('O adapter exige TagDuel clássico 2v2.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid)||physicalSeat(card.uid)===null)throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function handSnapshot(duel:TagDuel):string[]{
 const result:string[]=[];
 for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('A operação alterou uma mão privada.');
}
export function assertSmallMonsterRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Extra Deck excedeu cinco cartas no assento '+seat+'.');
 }
}
function assertSession(session:SmallMonsterSession):void{
 if(!session||!session.duel||!session.wanghuPending||!session.wanghuResolved||
  !session.blastPending||!session.blastResolved)throw new Error('Sessão M658 inválida.');
 assertTagDuel(session.duel);assertSmallMonsterRules(session.duel);
}
function findMonster(duel:TagDuel,uid:string):{team:SmallMonsterTeam;monster:Monster}|undefined{
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function faceUpTargetBindings(duel:TagDuel,uids:string[]):TargetBinding[]{
 const result:TargetBinding[]=[];
 for(const uid of uids){
  const found=findMonster(duel,uid);
  if(!found||!found.monster.faceUp)continue;
  const binding=bindTarget(duel.core,uid);
  if(binding)result.push(binding);
 }
 return result;
}
function assertTargetBinding(duel:TagDuel,binding:TargetBinding):{team:SmallMonsterTeam;monster:Monster}|undefined{
 if(!targetBindingValid(duel.core,binding))return;
 const found=findMonster(duel,binding.uid);
 return found;
}
export function createSmallMonsterDestructionAdapter(lookup:SmallMonsterLookup=defaultSmallMonsterLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):SmallMonsterSession{
  assertTagDuel(duel);assertSmallMonsterRules(duel);
  return {duel:structuredClone(duel),wanghuPending:{},wanghuResolved:{},blastPending:{},blastResolved:{}};
 }
 function prepareKingTigerWanghu(session:SmallMonsterSession,sourceUid:string,summonKind:SmallMonsterSummonKind,summonedUids:string[],activationId:string):WanghuPlan{
  assertSession(session);
  if(!validId(activationId)||typeof sourceUid!=='string'||!sourceUid||!Array.isArray(summonedUids)||
   summonedUids.length<1||summonedUids.length>6||new Set(summonedUids).size!==summonedUids.length){
   throw new Error('Evento de summon ou ID inválido.');
  }
  if(summonKind!=='normal'&&summonKind!=='special')
   throw new Error('King Tiger Wanghu não dispara por Flip Summon.');
  if(Object.prototype.hasOwnProperty.call(session.wanghuPending,activationId)||Object.prototype.hasOwnProperty.call(session.wanghuResolved,activationId))
   throw new Error('Ativação Wanghu duplicada.');
  const core=session.duel.core,pending=core.pending;
  const expected=summonKind==='normal'?'summon':'specialSummon';
  if((core.phase!=='response'&&core.phase!=='choice')||pending.kind!==expected||
   !pending.triggersQueued||!validTeam(pending.actor)||core.current!==pending.actor||
   !summonedUids.includes(pending.card)){
   throw new Error('A ativação exige o evento de Normal/Special Summon desta cadeia.');
  }
  const source=findMonster(session.duel,sourceUid);
  if(!source||source.monster.id!==KING_TIGER_WANGHU_ID&&lookup(source.monster.id)?.effect!=='wanghu'||
   !source.monster.faceUp||monsterEffectsNegated(core,sourceUid)){
   throw new Error('King Tiger Wanghu precisa estar face-up e com efeito ativo.');
  }
  const sourceBinding=bindTarget(core,sourceUid);
  if(!sourceBinding)throw new Error('Fonte Wanghu sem identidade de campo.');
  const bindings=faceUpTargetBindings(session.duel,summonedUids);
  if(!bindings.length||!bindings.some(binding=>{
   const found=findMonster(session.duel,binding.uid);
   return !!found&&atk(found.monster,core)<=1400;
  }))throw new Error('Nenhum monstro face-up de ATK 1400 ou menos foi invocado.');
  const owner=physicalSeat(sourceUid);
  if(owner===null)throw new Error('UID físico da fonte inválido.');
  const plan:WanghuPlan={activationId,sourceUid,sourceOwnerSeat:owner,sourceBinding,
   summonKind,turn:core.turn,summonedBindings:bindings};
  session.wanghuPending[activationId]=structuredClone(plan);
  return structuredClone(plan);
 }
 function resolveKingTigerWanghu(session:SmallMonsterSession,activationId:string):WanghuResolution{
  assertSession(session);
  const plan=session.wanghuPending[activationId];
  if(!plan)throw new Error('Não existe gatilho Wanghu pendente.');
  const working=structuredClone(session.duel);
  if(working.core.turn!==plan.turn)throw new Error('Gatilho Wanghu obsoleto.');
  const source=assertTargetBinding(working,plan.sourceBinding);
  let status:WanghuResolution['status']='source-lost',destroyedUids:string[]=[];
  if(source&&(source.monster.id===KING_TIGER_WANGHU_ID||lookup(source.monster.id)?.effect==='wanghu')&&source.monster.faceUp&&!monsterEffectsNegated(working.core,plan.sourceUid)){
   const targets=plan.summonedBindings.map(binding=>({binding,found:assertTargetBinding(working,binding)}))
    .filter(item=>item.found&&item.found.monster.faceUp&&atk(item.found.monster,working.core)<=1400&&canAffectMonster(working.core,item.binding.uid,'monster'));
   for(const item of targets){
    if(sendMonsterToGrave(working.core,item.binding.uid,false,'destroy'))destroyedUids.push(item.binding.uid);
   }
   status=destroyedUids.length?'destroyed':'no-targets';
  }
  session.duel=working;delete session.wanghuPending[activationId];
  const result:WanghuResolution={activationId,sourceUid:plan.sourceUid,status,destroyedUids,turn:plan.turn};
  session.wanghuResolved[activationId]=structuredClone(result);
  assertSmallMonsterRules(session.duel);assertTagDuel(session.duel);
  return structuredClone(result);
 }
 function openStandbyWindow(session:SmallMonsterSession,team:SmallMonsterTeam,actorSeat:number):StandbyWindow{
  assertSession(session);
  const core=session.duel.core;
  if(!validTeam(team)||!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||
   core.phase!=='main'||core.current!==team||core.priority!==team||core.pending.kind!=='none'||
   core.chain.length!==0||core.choice||core.turnEnding||core.damageStep||session.duel.active[team]!==actorSeat||
   session.standbyWindow){
   throw new Error('Janela de Standby inválida ou já aberta.');
  }
  const window:StandbyWindow={team,actorSeat:actorSeat as SmallMonsterSeat,turn:core.turn};
  session.standbyWindow=window;
  return structuredClone(window);
 }
 function closeStandbyWindow(session:SmallMonsterSession):void{
  assertSession(session);delete session.standbyWindow;
 }
 function activateBlastJuggler(session:SmallMonsterSession,actorSeat:number,sourceUid:string,targetUids:string[],activationId:string):BlastJugglerPlan{
  assertSession(session);
  const window=session.standbyWindow,core=session.duel.core;
  if(!window||window.turn!==core.turn||window.actorSeat!==actorSeat||window.team!==core.current||
   !Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||session.duel.active[window.team]!==actorSeat||
   core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||core.choice||core.turnEnding||core.damageStep){
   throw new Error('Blast Juggler só pode ativar na Standby Phase de seu controlador ativo.');
  }
  if(!validId(activationId)||typeof sourceUid!=='string'||!sourceUid||!Array.isArray(targetUids)||
   targetUids.length!==2||new Set(targetUids).size!==2||targetUids.includes(sourceUid)){
   throw new Error('Blast Juggler exige exatamente dois alvos distintos.');
  }
  if(Object.prototype.hasOwnProperty.call(session.blastPending,activationId)||Object.prototype.hasOwnProperty.call(session.blastResolved,activationId))
   throw new Error('Ativação Blast Juggler duplicada.');
  const source=findMonster(session.duel,sourceUid);
  if(!source||source.team!==window.team||source.monster.id!==BLAST_JUGGLER_ID&&lookup(source.monster.id)?.effect!=='blast-juggler'||
   !source.monster.faceUp||source.monster.entityKind==='token'||monsterEffectsNegated(core,sourceUid)){
   throw new Error('Blast Juggler precisa estar face-up e com efeito ativo.');
  }
  const bindings=targetUids.map(uid=>{
   const found=findMonster(session.duel,uid);
   if(!found||!found.monster.faceUp||atk(found.monster,core)>1000)
    throw new Error('Cada alvo deve ser monstro face-up com ATK 1000 ou menos.');
   const binding=bindTarget(core,uid);
   if(!binding)throw new Error('Alvo sem identidade de campo.');
   return binding;
  }) as [TargetBinding,TargetBinding];
  const owner=physicalSeat(sourceUid);
  if(owner===null)throw new Error('UID físico de Blast Juggler inválido.');
  const before=inventorySnapshot(session.duel),handsBefore=handSnapshot(session.duel);
  const working=structuredClone(session.duel);
  if(!sendMonsterToGrave(working.core,sourceUid,false,'tribute'))throw new Error('O tributo de Blast Juggler não pôde ser pago.');
  const plan:BlastJugglerPlan={activationId,sourceUid,sourceOwnerSeat:owner,controllerTeam:window.team,
   turn:core.turn,targetBindings:structuredClone(bindings)};
  session.duel=working;session.blastPending[activationId]=structuredClone(plan);
  assertSameInventory(before,session.duel);assertHandsUnchanged(handsBefore,session.duel);
  assertSmallMonsterRules(session.duel);assertTagDuel(session.duel);
  return structuredClone(plan);
 }
 function resolveBlastJuggler(session:SmallMonsterSession,activationId:string,negated=false):BlastJugglerResolution{
  assertSession(session);
  const plan=session.blastPending[activationId];
  if(!plan)throw new Error('Não existe efeito Blast Juggler pendente.');
  const working=structuredClone(session.duel);
  if(working.core.turn!==plan.turn)throw new Error('Efeito Blast Juggler obsoleto.');
  const before=inventorySnapshot(working),handsBefore=handSnapshot(working);
  const destroyedUids:string[]=[],lostUids:string[]=[];
  if(!negated){
   for(const binding of plan.targetBindings){
    const found=assertTargetBinding(working,binding);
    if(!found||!found.monster.faceUp||!canAffectMonster(working.core,binding.uid,'monster')){
     lostUids.push(binding.uid);continue;
    }
    if(sendMonsterToGrave(working.core,binding.uid,false,'destroy'))destroyedUids.push(binding.uid);
    else lostUids.push(binding.uid);
   }
  }else lostUids.push(...plan.targetBindings.map(binding=>binding.uid));
  const status:BlastJugglerResolution['status']=negated?'negated':
   destroyedUids.length===2?'destroyed':destroyedUids.length===1?'partial':'no-targets';
  const result:BlastJugglerResolution={activationId,sourceUid:plan.sourceUid,status,destroyedUids,lostUids,turn:plan.turn};
  session.duel=working;delete session.blastPending[activationId];session.blastResolved[activationId]=structuredClone(result);
  assertSameInventory(before,session.duel);assertHandsUnchanged(handsBefore,session.duel);
  assertSmallMonsterRules(session.duel);assertTagDuel(session.duel);
  return structuredClone(result);
 }
 return {createSession,prepareKingTigerWanghu,resolveKingTigerWanghu,openStandbyWindow,closeStandbyWindow,
  activateBlastJuggler,resolveBlastJuggler};
}
