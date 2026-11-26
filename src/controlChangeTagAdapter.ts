import type {DuelState,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {canAffectMonster} from './continuousEffects';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {removeToken} from './tokens';

export const SNATCH_STEAL_ID='45986603';
export const CREATURE_SWAP_ID='31036355';
export type ControlChangeEffect='snatch-steal'|'creature-swap';
type Team=0|1;
type Seat=0|1|2|3;
type CardKind='monster'|'spell'|'trap';
export type ControlChangeCardInfo={kind:CardKind;name?:string};
export type ControlChangeLookup=(id:string)=>ControlChangeCardInfo|undefined;
export type ControlChangeAction=
 |{kind:'equip';card:string;target:string;effect:'snatch-steal'}
 |{kind:'spell';card:string;effect:'creature-swap';ownTarget:string;opposingTarget:string};
type SpellTrap=NonNullable<DuelState['players'][number]['field']>;
type SnatchActivation={
 activationId:string;effect:'snatch-steal';sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;
 controllerTeam:Team;controllerSeat:Seat;turn:number;targetUid:string;targetBinding:TargetBinding;
 originalControllerTeam:Team
};
type SwapActivation={
 activationId:string;effect:'creature-swap';sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;
 controllerTeam:Team;controllerSeat:Seat;turn:number;ownTargetUid:string;opposingTargetUid:string;
 ownTargetBinding:TargetBinding;opposingTargetBinding:TargetBinding
};
type PendingActivation=SnatchActivation|SwapActivation;
type ActiveSnatch=Omit<SnatchActivation,'effect'> & {standbyTurns:number[]};
export type ControlChangeSession={
 duel:TagDuel;
 pending:Record<string,PendingActivation>;
 activeSnatch:Record<string,ActiveSnatch>;
 resolved:string[]
};
export type ControlChangeResolution={
 activationId:string;effect:ControlChangeEffect;sourceEffectNegated:boolean;
 targetControlled:boolean;targetsSwapped:boolean;sourceSentToGrave:boolean
};
function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function findMonster(core:DuelState,team:Team,uid:string):Monster|undefined{
 return core.players[team].monsters.find(monster=>monster.uid===uid);
}
function findSpellTrap(core:DuelState,uid:string):{team:Team;zone:'backrow'|'field';card:SpellTrap}|null{
 for(const team of [0,1] as const){
  const backrow=core.players[team].backrow.find(card=>card.uid===uid);
  if(backrow)return {team,zone:'backrow',card:backrow};
  const field=core.players[team].field;
  if(field?.uid===uid)return {team,zone:'field',card:field};
 }
 return null;
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  if(physicalSeat(card.uid)===null)throw new Error('UID sem proprietário físico m0–m3.');
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
export function assertPhysicalExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
 if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
  extraCounts.some(count=>!Number.isSafeInteger(count)||count<0))throw new Error('Contagem do Deck Adicional inválida.');
 if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}
/** Enforces the owner's physical 2v2 format without checking hand size before End Phase. */
export function assertControlChangeRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('Mudança de controle exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Perfil de regras incompatível com o proprietário.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const [seat,held] of Object.entries(duel.reserves)){
  if(!/^[0-3]$/.test(seat))throw new Error('Assento físico de reserva inválido.');
  for(const card of held.extra??[])extraUids.add(card.uid);
 }
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
  if(extraUids.has(card.uid))extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++)if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
  throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
 }
 assertPhysicalExtraDeckCounts(extra,rules.extraDeckMax);
 for(const player of duel.core.players){
  if(player.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Monster Zones.');
  if(player.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Spell/Trap Zones.');
  // The Field Zone is independent of the three shared Spell/Trap Zones.
 }
}
function sourceIdFor(effect:ControlChangeEffect,override?:string):string{
 return override??(effect==='snatch-steal'?SNATCH_STEAL_ID:CREATURE_SWAP_ID);
}
function mainPhaseTeam(duel:TagDuel):Team|null{
 const core=duel.core,team=core.current;
 if(!isTeam(team)||core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||
  core.turnEnding||core.priority!==team)return null;
 return team;
}
function sourceInActiveHand(
 duel:TagDuel,team:Team,uid:string,cardId:string,lookup:ControlChangeLookup
):{card:{uid:string;id:string};ownerSeat:Seat}|undefined{
 const ownerSeat=physicalSeat(uid),activeSeat=duel.active[team] as Seat;
 if(ownerSeat===null||ownerSeat!==activeSeat)return;
 const card=duel.core.players[team].hand.find(candidate=>candidate.uid===uid&&candidate.id===cardId);
 if(!card||lookup(card.id)?.kind!=='spell')return;
 return {card,ownerSeat};
}
function activationIdValid(input:ControlChangeSession,id:string):boolean{
 return typeof id==='string'&&!!id.trim()&&id.length<=128&&!input.pending[id]&&
  !input.resolved.includes(id);
}
function moveMonster(core:DuelState,from:Team,to:Team,uid:string):Monster|undefined{
 if(from===to)return;
 const index=core.players[from].monsters.findIndex(monster=>monster.uid===uid);
 if(index<0)return;
 const [monster]=core.players[from].monsters.splice(index,1);
 core.players[to].monsters.push(monster);
 return monster;
}
function moveSpellTrapToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 const location=findSpellTrap(core,uid),ownerSeat=physicalSeat(uid);
 if(!location||location.team!==controller||ownerSeat===null)return false;
 if(location.zone==='backrow')core.players[controller].backrow=core.players[controller].backrow.filter(card=>card.uid!==uid);
 else core.players[controller].field=null;
 core.players[ownerSeat%2].grave.push({
  uid:location.card.uid,id:location.card.id,
  ...(location.card.properlySummoned?{properlySummoned:true}:{})
 });
 synchronizeCardLifetimes(core);
 return true;
}
function moveMonsterToPhysicalOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 const monster=findMonster(core,controller,uid);
 if(!monster)return false;
 if(monster.entityKind==='token'){
  const removed=removeToken(core,uid,'return');
  synchronizeCardLifetimes(core);
  return removed;
 }
 const ownerSeat=physicalSeat(uid);
 if(ownerSeat===null)return false;
 core.players[controller].monsters=core.players[controller].monsters.filter(card=>card.uid!==uid);
 core.players[ownerSeat%2].grave.push({
  uid:monster.uid,id:monster.id,
  ...(monster.properlySummoned?{properlySummoned:true}:{})
 });
 synchronizeCardLifetimes(core);
 return true;
}
function putSpellOnField(core:DuelState,team:Team,sourceUid:string,cardId:string,target?:string):void{
 const hand=core.players[team].hand,index=hand.findIndex(card=>card.uid===sourceUid&&card.id===cardId);
 if(index<0)throw new Error('A Magia deixou a mão antes da ativação.');
 const [card]=hand.splice(index,1);
 core.players[team].backrow.push({
  ...card,faceUp:true,setTurn:core.turn,resolved:true,
  ...(target?{equippedTo:target}:{})
 });
 core.chain.push({actor:team,card:sourceUid,id:cardId,target:target??''});
 core.phase='response';
 core.resume='main';
 core.pending={kind:'none'};
 core.priority=1-team;
 core.passes=0;
 synchronizeCardLifetimes(core);
}
export function snatchStealActions(
 duel:TagDuel,lookup:ControlChangeLookup,options:{cardId?:string}={}
):ControlChangeAction[]{
 assertControlChangeRules(duel);
 const team=mainPhaseTeam(duel);
 if(team===null||duel.core.players[team].monsters.length>=3||
  duel.core.players[team].backrow.length>=3)return [];
 const cardId=sourceIdFor('snatch-steal',options.cardId);
 if(lookup(cardId)?.kind!=='spell')return [];
 const sources=duel.core.players[team].hand.filter(card=>
  card.id===cardId&&physicalSeat(card.uid)===duel.active[team]&&lookup(card.id)?.kind==='spell');
 const opposingTeam=(1-team) as Team;
 const targets=duel.core.players[opposingTeam].monsters.filter(monster=>
  monster.faceUp&&lookup(monster.id)?.kind==='monster'&&canAffectMonster(duel.core,monster.uid,'spell')&&
  !duel.core.players.some(player=>player.backrow.some(card=>card.equippedTo===monster.uid)));
 return sources.flatMap(source=>targets.map(target=>({
  kind:'equip' as const,card:source.uid,target:target.uid,effect:'snatch-steal' as const
 })));
}
export function creatureSwapActions(
 duel:TagDuel,lookup:ControlChangeLookup,options:{cardId?:string}={}
):ControlChangeAction[]{
 assertControlChangeRules(duel);
 const team=mainPhaseTeam(duel);
 if(team===null||duel.core.players[team].backrow.length>=3)return [];
 const cardId=sourceIdFor('creature-swap',options.cardId);
 if(lookup(cardId)?.kind!=='spell')return [];
 const sources=duel.core.players[team].hand.filter(card=>
  card.id===cardId&&physicalSeat(card.uid)===duel.active[team]&&lookup(card.id)?.kind==='spell');
 const own=duel.core.players[team].monsters.filter(monster=>
  lookup(monster.id)?.kind==='monster'&&canAffectMonster(duel.core,monster.uid,'spell'));
 const opposingTeam=(1-team) as Team;
 const opposing=duel.core.players[opposingTeam].monsters.filter(monster=>
  lookup(monster.id)?.kind==='monster'&&canAffectMonster(duel.core,monster.uid,'spell'));
 return sources.flatMap(source=>own.flatMap(first=>opposing.map(second=>({
  kind:'spell' as const,card:source.uid,effect:'creature-swap' as const,
  ownTarget:first.uid,opposingTarget:second.uid
 }))));
}
export function createControlChangeSession(duel:TagDuel):ControlChangeSession{
 assertControlChangeRules(duel);
 return {duel:structuredClone(duel),pending:{},activeSnatch:{},resolved:[]};
}
export function activateSnatchSteal(
 input:ControlChangeSession,sourceUid:string,activationId:string,lookup:ControlChangeLookup,
 options:{cardId?:string;targetUid:string}
):ControlChangeSession{
 if(!activationIdValid(input,activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertControlChangeRules(input.duel);
 const team=mainPhaseTeam(input.duel);
 if(team===null)throw new Error('Snatch Steal só pode ser ativado na Main Phase do controlador.');
 const cardId=sourceIdFor('snatch-steal',options.cardId);
 const legal=snatchStealActions(input.duel,lookup,{cardId});
 if(!legal.some(action=>action.kind==='equip'&&action.card===sourceUid&&action.target===options.targetUid)){
  throw new Error('Snatch Steal não tem alvo válido ou a carta não pertence ao participante ativo.');
 }
 const source=sourceInActiveHand(input.duel,team,sourceUid,cardId,lookup);
 const opposingTeam=(1-team) as Team;
 const target=findMonster(input.duel.core,opposingTeam,options.targetUid);
 const targetBinding=bindTarget(input.duel.core,options.targetUid);
 if(!source||!target||!targetBinding||targetBinding.zone!=='monsters'){
  throw new Error('O Equip ou o monstro-alvo saiu da zona esperada.');
 }
 const before=inventorySnapshot(input.duel),next=structuredClone(input);
 putSpellOnField(next.duel.core,team,sourceUid,cardId,options.targetUid);
 next.pending[activationId]={
  activationId,effect:'snatch-steal',sourceUid,sourceId:cardId,sourceOwnerSeat:source.ownerSeat,
  controllerTeam:team,controllerSeat:next.duel.active[team] as Seat,turn:next.duel.core.turn,
  targetUid:options.targetUid,targetBinding,originalControllerTeam:opposingTeam
 };
 assertSameInventory(before,next.duel);
 assertControlChangeRules(next.duel);
 return next;
}
export function activateCreatureSwap(
 input:ControlChangeSession,sourceUid:string,activationId:string,lookup:ControlChangeLookup,
 options:{cardId?:string;ownTargetUid:string;opposingTargetUid:string}
):ControlChangeSession{
 if(!activationIdValid(input,activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertControlChangeRules(input.duel);
 const team=mainPhaseTeam(input.duel);
 if(team===null)throw new Error('Creature Swap só pode ser ativada na Main Phase do controlador.');
 const cardId=sourceIdFor('creature-swap',options.cardId);
 const legal=creatureSwapActions(input.duel,lookup,{cardId});
 if(!legal.some(action=>action.kind==='spell'&&action.card===sourceUid&&action.ownTarget===options.ownTargetUid&&
  action.opposingTarget===options.opposingTargetUid)){
  throw new Error('Creature Swap exige um monstro válido de cada equipe.');
 }
 const source=sourceInActiveHand(input.duel,team,sourceUid,cardId,lookup);
 const ownTarget=findMonster(input.duel.core,team,options.ownTargetUid);
 const opposingTeam=(1-team) as Team;
 const opposingTarget=findMonster(input.duel.core,opposingTeam,options.opposingTargetUid);
 const ownTargetBinding=bindTarget(input.duel.core,options.ownTargetUid);
 const opposingTargetBinding=bindTarget(input.duel.core,options.opposingTargetUid);
 if(!source||!ownTarget||!opposingTarget||!ownTargetBinding||!opposingTargetBinding||
  ownTargetBinding.zone!=='monsters'||opposingTargetBinding.zone!=='monsters'){
  throw new Error('Creature Swap perdeu um dos alvos ou a carta de ativação.');
 }
 const before=inventorySnapshot(input.duel),next=structuredClone(input);
 putSpellOnField(next.duel.core,team,sourceUid,cardId);
 next.pending[activationId]={
  activationId,effect:'creature-swap',sourceUid,sourceId:cardId,sourceOwnerSeat:source.ownerSeat,
  controllerTeam:team,controllerSeat:next.duel.active[team] as Seat,turn:next.duel.core.turn,
  ownTargetUid:options.ownTargetUid,opposingTargetUid:options.opposingTargetUid,
  ownTargetBinding,opposingTargetBinding
 };
 assertSameInventory(before,next.duel);
 assertControlChangeRules(next.duel);
 return next;
}
export function resolveControlChange(
 input:ControlChangeSession,activationId:string,options:{sourceActivationNegated?:boolean}={}
):{session:ControlChangeSession;result:ControlChangeResolution}{
 const activation=input.pending[activationId];
 if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de mudança de controle ausente ou já resolvida.');
 assertControlChangeRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const ownIndex=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
  link.card===activation.sourceUid&&link.id===activation.sourceId);
 if(ownIndex!==core.chain.length-1)throw new Error('A Magia só pode resolver no topo da corrente.');
 const own=core.chain.pop();
 if(!own)throw new Error('Link da Magia ausente.');
 const sourceEffectNegated=options.sourceActivationNegated===true||own.negated===true;
 let targetControlled=false,targetsSwapped=false,sourceSentToGrave=false;
 const source=findSpellTrap(core,activation.sourceUid);
 if(activation.effect==='snatch-steal'){
  const target=findMonster(core,activation.originalControllerTeam,activation.targetUid);
  if(!sourceEffectNegated&&source?.team===activation.controllerTeam&&source.zone==='backrow'&&
   source.card.faceUp&&source.card.id===activation.sourceId&&target&&target.faceUp&&
   targetBindingValid(core,activation.targetBinding)&&canAffectMonster(core,target.uid,'spell')&&
   core.players[activation.controllerTeam].monsters.length<3){
   target.owner??=activation.originalControllerTeam;
   const moved=moveMonster(core,activation.originalControllerTeam,activation.controllerTeam,activation.targetUid);
   if(moved){
    source.card.equippedTo=activation.targetUid;
    source.card.resolved=true;
    next.activeSnatch[activationId]={...activation,standbyTurns:[]};
    targetControlled=true;
   }else sourceSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  }else sourceSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
 }else{
  const opposingTeam=(1-activation.controllerTeam) as Team;
  const ownTarget=findMonster(core,activation.controllerTeam,activation.ownTargetUid);
  const opposingTarget=findMonster(core,opposingTeam,activation.opposingTargetUid);
  if(!sourceEffectNegated&&source?.team===activation.controllerTeam&&source.zone==='backrow'&&
   source.card.faceUp&&source.card.id===activation.sourceId&&ownTarget&&opposingTarget&&
   targetBindingValid(core,activation.ownTargetBinding)&&
   targetBindingValid(core,activation.opposingTargetBinding)&&
   canAffectMonster(core,ownTarget.uid,'spell')&&canAffectMonster(core,opposingTarget.uid,'spell')){
   ownTarget.owner??=activation.controllerTeam;
   opposingTarget.owner??=opposingTeam;
   const ownIndex=core.players[activation.controllerTeam].monsters.findIndex(monster=>monster.uid===activation.ownTargetUid);
   const opposingIndex=core.players[opposingTeam].monsters.findIndex(monster=>monster.uid===activation.opposingTargetUid);
   if(ownIndex>=0&&opposingIndex>=0){
    const [ownMonster]=core.players[activation.controllerTeam].monsters.splice(ownIndex,1);
    const [opposingMonster]=core.players[opposingTeam].monsters.splice(opposingIndex,1);
    ownMonster.positionLockedThrough=core.turn;
    opposingMonster.positionLockedThrough=core.turn;
    core.players[activation.controllerTeam].monsters.push(opposingMonster);
    core.players[opposingTeam].monsters.push(ownMonster);
    targetsSwapped=true;
   }
  }
  sourceSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
 }
 delete next.pending[activationId];
 next.resolved.push(activationId);
 next.resolved=next.resolved.slice(-256);
 if(core.chain.length===0){core.phase='main';core.resume='main';core.priority=activation.controllerTeam;core.passes=0;}
 synchronizeCardLifetimes(core);
 assertSameInventory(before,next.duel);
 assertControlChangeRules(next.duel);
 return {session:next,result:{
  activationId,effect:activation.effect,sourceEffectNegated,targetControlled,targetsSwapped,sourceSentToGrave
 }};
}
export function releaseSnatchSteal(
 input:ControlChangeSession,activationId:string
):{session:ControlChangeSession;result:{activationId:string;equipSentToGrave:boolean;monsterReturned:boolean;monsterSentToGrave:boolean}}{
 const activation=input.activeSnatch[activationId];
 if(!activation)throw new Error('Equip Snatch Steal ausente ou já liberado.');
 assertControlChangeRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const equipSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
 const target=findMonster(core,activation.controllerTeam,activation.targetUid);
 let monsterReturned=false,monsterSentToGrave=false;
 if(target&&targetBindingValid(core,activation.targetBinding)){
  if(core.players[activation.originalControllerTeam].monsters.length<3){
   monsterReturned=!!moveMonster(core,activation.controllerTeam,activation.originalControllerTeam,activation.targetUid);
  }else monsterSentToGrave=moveMonsterToPhysicalOwnerGrave(core,activation.controllerTeam,activation.targetUid);
 }
 delete next.activeSnatch[activationId];
 synchronizeCardLifetimes(core);
 assertSameInventory(before,next.duel);
 assertControlChangeRules(next.duel);
 return {session:next,result:{activationId,equipSentToGrave,monsterReturned,monsterSentToGrave}};
}
export function resolveSnatchStealStandby(
 input:ControlChangeSession,activationId:string,standbyTurn:number,activeTeam:Team
):{session:ControlChangeSession;result:{activationId:string;standbyTurn:number;beneficiaryTeam:Team;applied:boolean}}{
 const activation=input.activeSnatch[activationId];
 if(!activation)throw new Error('Equip Snatch Steal ausente ou liberado.');
 if(!Number.isSafeInteger(standbyTurn)||standbyTurn<1||!isTeam(activeTeam)||
  activeTeam!==1-activation.controllerTeam||standbyTurn<=activation.turn||
  input.duel.core.turn!==standbyTurn){
  throw new Error('Evento de Standby incompatível com a equipe adversária ou com o turno.');
 }
 assertControlChangeRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),entry=next.activeSnatch[activationId];
 let applied=false;
 const source=findSpellTrap(next.duel.core,entry.sourceUid);
 const target=findMonster(next.duel.core,entry.controllerTeam,entry.targetUid);
 if(!entry.standbyTurns.includes(standbyTurn)&&next.duel.core.phase!=='finished'&&
  source?.team===entry.controllerTeam&&source.zone==='backrow'&&source.card.faceUp&&
  source.card.equippedTo===entry.targetUid&&target&&targetBindingValid(next.duel.core,entry.targetBinding)&&
  Number.isSafeInteger(next.duel.core.players[activeTeam].lp)&&
  next.duel.core.players[activeTeam].lp<=Number.MAX_SAFE_INTEGER-1000){
  next.duel.core.players[activeTeam].lp+=1000;
  entry.standbyTurns.push(standbyTurn);
  entry.standbyTurns=entry.standbyTurns.slice(-128);
  applied=true;
 }
 assertSameInventory(before,next.duel);
 assertControlChangeRules(next.duel);
 return {session:next,result:{activationId,standbyTurn,beneficiaryTeam:activeTeam,applied}};
}
