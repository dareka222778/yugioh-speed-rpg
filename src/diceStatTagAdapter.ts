import type {CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {ownedPrivateZone} from './teamRotation';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {assertDuelRandom,randomIndex} from './duelRandom';
import {addTemporaryModifier,syncContinuous} from './continuousEffects';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {getDuelCard,getEffect} from './effectRegistry';
import {getActivationModel} from './effectModels';

export const MAXIMUM_SIX_ID='30707994';
export const GRACEFUL_DICE_ID='74137509';
export const SKULL_DICE_ID='00126218';
export type DiceStatEffect='maximum-six'|'graceful-dice'|'skull-dice';
export type DiceStatCardInfo={kind:'monster'|'spell'|'trap';effect:DiceStatEffect};
export type DiceStatLookup=(id:string)=>DiceStatCardInfo|undefined;
type Team=0|1;
type Seat=0|1|2|3;
type SourceZone='hand'|'backrow';
type PendingActivation={kind:'spell-trap';activationId:string;effect:'graceful-dice'|'skull-dice';sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number;sourceZone:SourceZone;sourceBinding:TargetBinding};
type PendingMaximumSix={kind:'maximum-six';activationId:string;eventId:string;sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;controllerSeat:Seat;turn:number;sourceBinding:TargetBinding};
type PendingDice=PendingActivation|PendingMaximumSix;
export type DiceStatSpellResolution={kind:'spell-trap';activationId:string;effect:'graceful-dice'|'skull-dice';negated:boolean;roll:number|null;statDelta:number;affectedUids:string[];sourceSentToGrave:boolean};
export type MaximumSixResolution={kind:'maximum-six';activationId:string;eventId:string;negated:boolean;roll:number|null;bonus:number;sourceStillFaceUp:boolean};
export type DiceStatResolution=DiceStatSpellResolution|MaximumSixResolution;
export type DiceStatSession={duel:TagDuel;pending:Record<string,PendingDice>;resolved:Record<string,DiceStatResolution>};
export type TributeSummonEvent={eventId:string;sourceUid:string;sourceId:string;controllerSeat:Seat;turn:number;summonType:'tribute'|'normal'|'special';summonedSuccessfully:boolean};

const defaultLookup:DiceStatLookup=(id)=>{
 if(id===MAXIMUM_SIX_ID)return {kind:'monster',effect:'maximum-six'};
 if(id===GRACEFUL_DICE_ID)return {kind:'spell',effect:'graceful-dice'};
 if(id===SKULL_DICE_ID)return {kind:'trap',effect:'skull-dice'};
 return undefined;
};
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function assertSeat(value:number):asserts value is Seat{
 if(!Number.isInteger(value)||value<0||value>3)throw new Error('Assento físico inválido.');
}
function assertActivationId(value:string):void{
 if(typeof value!=='string'||value.length<1||value.length>128||!/^[-a-zA-Z0-9:_]+$/.test(value))throw new Error('Identificador de ativação inválido.');
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2||!Array.isArray(duel.core.chain))throw new Error('Estrutura física TagDuel incompleta.');
}
export function assertDiceStatRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 }
 const extraUids=new Set<string>();
 for(let team=0;team<2;team++){
  const player=duel.core.players[team];
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('A equipe excedeu três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('A equipe excedeu três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const mainCounts=[0,0,0,0],extraCounts=[0,0,0,0];
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null)throw new Error('Carta sem proprietário físico m0–m3.');
  const info=getDuelCard(card.id);
  if(extraUids.has(card.uid)||!!info?.fusion)extraCounts[seat]++;
  else mainCounts[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(mainCounts[seat]<rules.mainDeckMin||mainCounts[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extraCounts[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // Mão acima de seis pode existir durante a resolução; o descarte pertence à End Phase.
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('O adapter alterou a quantidade de cartas físicas.');
 for(const [uid,id]of before)if(after.get(uid)!==id)throw new Error('O adapter alterou a identidade física: '+uid);
}
function findMonster(duel:TagDuel,uid:string):{team:Team;monster:Monster}|undefined{
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function findCardId(duel:TagDuel,team:Team,uid:string):string{
 const ref=tagInventory(duel).find(card=>card.uid===uid);
 if(!ref)throw new Error('Carta física ausente.');
 const seat=physicalSeat(ref.uid);
 if(seat===null||seat%2!==team)throw new Error('Carta pertence à outra equipe.');
 return ref.id;
}
function sourceZone(duel:TagDuel,team:Team,uid:string,id:string):SourceZone|'grave'|'banished'|null{
 const ref:CardRef={uid,id};
 if(ownedPrivateZone(duel.core,ref,team,'hand').some(card=>card.uid===uid&&card.id===id))return 'hand';
 if(duel.core.players[team].backrow.some(card=>card.uid===uid&&card.id===id))return 'backrow';
 if(duel.core.players[team].grave.some(card=>card.uid===uid&&card.id===id))return 'grave';
 if((duel.core.players[team].banished??[]).some(card=>card.uid===uid&&card.id===id))return 'banished';
 return null;
}
function hasPriority(duel:TagDuel,team:Team,actorSeat:Seat):boolean{
 if(duel.active[team]!==actorSeat)return false;
 if(duel.core.phase==='response')return duel.core.priority===team;
 return (duel.core.phase==='main'||duel.core.phase==='battle')&&duel.core.current===team&&duel.cursor===actorSeat;
}
function counterTrapWindow(duel:TagDuel):boolean{
 const last=duel.core.chain.at(-1);
 if(!last)return false;
 const effect=getEffect(last.id);
 return !!effect&&getActivationModel(effect)?.speed===3;
}
function damageStepAllowed(duel:TagDuel):boolean{
 const pending=duel.core.pending;
 if(pending.kind==='attack'&&pending.stage==='calculation')return false;
 if(duel.core.damageStep&&!(pending.kind==='attack'&&pending.stage==='damage'))return false;
 return true;
}
function moveSourceToGrave(duel:TagDuel,plan:PendingActivation):boolean{
 const core=duel.core,team=plan.controllerTeam,ref:CardRef={uid:plan.sourceUid,id:plan.sourceId};
 const hand=ownedPrivateZone(core,ref,team,'hand');
 const handIndex=hand.findIndex(card=>card.uid===plan.sourceUid&&card.id===plan.sourceId);
 if(handIndex>=0){
  const [card]=hand.splice(handIndex,1);
  core.players[team].grave.push({uid:card.uid,id:card.id});
  return true;
 }
 const backrow=core.players[team].backrow;
 const backrowIndex=backrow.findIndex(card=>card.uid===plan.sourceUid&&card.id===plan.sourceId);
 if(backrowIndex>=0){
  const [card]=backrow.splice(backrowIndex,1);
  core.players[team].grave.push({uid:card.uid,id:card.id});
  return true;
 }
 if(core.players[team].grave.some(card=>card.uid===plan.sourceUid&&card.id===plan.sourceId))return true;
 if((core.players[team].banished??[]).some(card=>card.uid===plan.sourceUid&&card.id===plan.sourceId))return false;
 throw new Error('A fonte da ativação desapareceu do inventário físico.');
}
function addFaceUpModifier(duel:TagDuel,uid:string,atk:number,def:number):void{
 synchronizeCardLifetimes(duel.core);
 const binding=bindTarget(duel.core,uid);
 if(!binding||binding.zone!=='monsters')throw new Error('Maximum Six perdeu sua identidade de campo.');
 const ledger=duel.core.continuousState??={next:0,sources:{},temporary:[]};
 if(ledger.next>=1_000_000)throw new Error('Ledger contínuo esgotado.');
 ledger.temporary.push({sequence:++ledger.next,uid,epoch:binding.epoch,atk,def,expiresTurn:Number.MAX_SAFE_INTEGER});
 syncContinuous(duel.core);
}
function assertSession(session:DiceStatSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||typeof session.pending!=='object'||typeof session.resolved!=='object')throw new Error('Sessão de dado inválida.');
 assertDiceStatRules(session.duel);
 assertDuelRandom(session.duel.core.random);
}
export function createDiceStatAdapter(lookup:DiceStatLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):DiceStatSession{
  assertDiceStatRules(duel);assertDuelRandom(duel.core.random);
  return {duel:structuredClone(duel),pending:{},resolved:{}};
 }
 function prepareActivation(session:DiceStatSession,actorSeat:number,sourceUid:string,activationId:string):PendingActivation{
  assertSession(session);assertSeat(actorSeat);assertActivationId(activationId);
  if(Object.hasOwn(session.pending,activationId)||Object.hasOwn(session.resolved,activationId))throw new Error('Ativação duplicada.');
  const working=structuredClone(session.duel),ownerSeat=physicalSeat(sourceUid);
  if(ownerSeat===null)throw new Error('UID físico inválido.');
  const team=ownerSeat%2 as Team,sourceId=findCardId(working,team,sourceUid),zone=sourceZone(working,team,sourceUid,sourceId);
  if(!zone||zone==='grave'||zone==='banished')throw new Error('A fonte não está na mão privada ou na Zona de Magias/Armadilhas.');
  if(!hasPriority(working,team,actorSeat))throw new Error('O assento não tem prioridade nesta janela.');
  if(working.core.phase==='response'&&counterTrapWindow(working))throw new Error('Uma Magia/Armadilha de Velocidade 2 não pode responder a uma Armadilha de Velocidade 3.');
  if(!damageStepAllowed(working))throw new Error('O efeito de dado não pode ser ativado nesta janela da Etapa de Dano.');
  const info=lookup(sourceId);
  if(!info||!['graceful-dice','skull-dice'].includes(info.effect))throw new Error('A carta não pertence à família de efeitos de dado.');
  if((info.effect==='graceful-dice'&&info.kind!=='spell')||(info.effect==='skull-dice'&&info.kind!=='trap'))throw new Error('Tipo de carta incompatível com o efeito.');
  if(zone==='hand'){
   if(info.effect!=='graceful-dice'||ownerSeat!==actorSeat||working.core.current!==team)throw new Error('Magia Rápida da mão exige o turno e a mão privada do próprio assento ativo.');
  }else{
   const set=working.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===sourceId);
   if(!set||set.faceUp||!Number.isSafeInteger(set.setTurn)||set.setTurn>=working.core.turn)throw new Error('A carta precisa estar Baixada desde um turno anterior.');
  }
  const binding=bindTarget(working.core,sourceUid);
  if(!binding||binding.zone!==(zone==='hand'?'hand':'backrow'))throw new Error('Não foi possível vincular a identidade física da fonte.');
  const plan:PendingActivation={kind:'spell-trap',activationId,effect:info.effect as PendingActivation['effect'],sourceUid,sourceId,
   sourceOwnerSeat:ownerSeat,controllerTeam:team,actorSeat:actorSeat as Seat,turn:working.core.turn,sourceZone:zone,sourceBinding:binding};
  session.duel=working;session.pending[activationId]=plan;
  return structuredClone(plan);
 }
 function resolveActivation(session:DiceStatSession,activationId:string,negated=false):DiceStatSpellResolution{
  assertSession(session);assertActivationId(activationId);
  const cached=session.resolved[activationId];
  if(cached)return structuredClone(cached) as DiceStatSpellResolution;
  const plan=session.pending[activationId];
  if(!plan||plan.kind!=='spell-trap')throw new Error('Ativação de Magia/Armadilha não preparada.');
  const working=structuredClone(session.duel);
  if(working.core.turn!==plan.turn)throw new Error('A ativação ficou obsoleta após a mudança de turno.');
  const zone=sourceZone(working,plan.controllerTeam,plan.sourceUid,plan.sourceId);
  if(!zone)throw new Error('A fonte não está mais no inventário.');
  if(zone===plan.sourceZone&&!targetBindingValid(working.core,plan.sourceBinding))throw new Error('A identidade da fonte mudou antes da resolução.');
  if(zone!=='grave'&&zone!=='banished'&&zone!==plan.sourceZone)throw new Error('A fonte mudou de zona antes da resolução.');
  const before=inventorySnapshot(working);
  let roll:number|null=null,delta=0;
  const affectedUids:string[]=[];
  if(!negated){
   assertDuelRandom(working.core.random);roll=randomIndex(working.core.random,6)+1;
   delta=(plan.effect==='graceful-dice'?1:-1)*roll*100;
   const targetTeam=(plan.effect==='graceful-dice'?plan.controllerTeam:1-plan.controllerTeam) as Team;
   for(const monster of working.core.players[targetTeam].monsters.filter(card=>card.faceUp)){
    addTemporaryModifier(working.core,monster.uid,delta,delta);affectedUids.push(monster.uid);
   }
  }
  const sourceSentToGrave=moveSourceToGrave(working,plan);
  synchronizeCardLifetimes(working.core);syncContinuous(working.core);
  assertDiceStatRules(working);assertSameInventory(before,working);assertTagDuel(working);
  const result:DiceStatSpellResolution={kind:'spell-trap',activationId,effect:plan.effect,negated,roll,statDelta:delta,affectedUids,sourceSentToGrave};
  session.duel=working;session.resolved[activationId]=result;delete session.pending[activationId];
  return structuredClone(result);
 }
 function prepareMaximumSixTrigger(session:DiceStatSession,event:TributeSummonEvent,activationId:string):PendingMaximumSix{
  assertSession(session);assertActivationId(activationId);
  if(!event||typeof event.eventId!=='string'||!event.eventId.trim()||event.eventId.length>128)throw new Error('Evento de Invocação-Tributo inválido.');
  if(event.summonType!=='tribute'||event.summonedSuccessfully!==true)throw new Error('Maximum Six só dispara após uma Invocação-Tributo bem-sucedida.');
  assertSeat(event.controllerSeat);
  if(Object.hasOwn(session.pending,activationId)||Object.hasOwn(session.resolved,activationId))throw new Error('Gatilho duplicado.');
  const working=structuredClone(session.duel),ownerSeat=physicalSeat(event.sourceUid);
  if(ownerSeat===null)throw new Error('UID físico inválido.');
  const team=ownerSeat%2 as Team;
  if(event.turn!==working.core.turn||working.core.phase!=='response'||working.core.pending.kind!=='summon'||
     working.core.pending.card!==event.sourceUid||working.core.current!==team||working.cursor!==event.controllerSeat||
     working.active[team]!==event.controllerSeat)throw new Error('Evento não corresponde à Invocação-Tributo pendente do assento ativo.');
  const found=findMonster(working,event.sourceUid);
  if(!found||found.team!==team||!found.monster.faceUp)throw new Error('Maximum Six não está face-up no campo da equipe.');
  if(found.monster.id!==event.sourceId)throw new Error('Identidade física de Maximum Six divergente.');
  const info=lookup(event.sourceId);
  if(!info||info.kind!=='monster'||info.effect!=='maximum-six')throw new Error('A carta não é Maximum Six.');
  const binding=bindTarget(working.core,event.sourceUid);
  if(!binding||binding.zone!=='monsters')throw new Error('Não foi possível vincular Maximum Six ao campo.');
  const plan:PendingMaximumSix={kind:'maximum-six',activationId,eventId:event.eventId,sourceUid:event.sourceUid,sourceId:event.sourceId,
   sourceOwnerSeat:ownerSeat,controllerTeam:team,controllerSeat:event.controllerSeat,turn:event.turn,sourceBinding:binding};
  session.duel=working;session.pending[activationId]=plan;return structuredClone(plan);
 }
 function resolveMaximumSixTrigger(session:DiceStatSession,activationId:string,negated=false):MaximumSixResolution{
  assertSession(session);assertActivationId(activationId);
  const cached=session.resolved[activationId];
  if(cached)return structuredClone(cached) as MaximumSixResolution;
  const plan=session.pending[activationId];
  if(!plan||plan.kind!=='maximum-six')throw new Error('Gatilho Maximum Six não preparado.');
  const working=structuredClone(session.duel);
  if(working.core.turn!==plan.turn)throw new Error('O gatilho ficou obsoleto após a mudança de turno.');
  const before=inventorySnapshot(working);
  let roll:number|null=null,bonus=0,sourceStillFaceUp=false;
  const found=findMonster(working,plan.sourceUid);
  sourceStillFaceUp=!!found&&found.team===plan.controllerTeam&&found.monster.faceUp&&targetBindingValid(working.core,plan.sourceBinding);
  if(!negated){
   assertDuelRandom(working.core.random);roll=randomIndex(working.core.random,6)+1;bonus=roll*200;
   if(sourceStillFaceUp)addFaceUpModifier(working,plan.sourceUid,bonus,0);
  }
  syncContinuous(working.core);
  assertDiceStatRules(working);assertSameInventory(before,working);assertTagDuel(working);
  const result:MaximumSixResolution={kind:'maximum-six',activationId,eventId:plan.eventId,negated,roll,bonus,sourceStillFaceUp};
  session.duel=working;session.resolved[activationId]=result;delete session.pending[activationId];
  return structuredClone(result);
 }
 function reconcile(session:DiceStatSession):TagDuel{
  assertSession(session);const working=structuredClone(session.duel);
  synchronizeCardLifetimes(working.core);syncContinuous(working.core);
  assertDiceStatRules(working);assertTagDuel(working);session.duel=working;return structuredClone(working);
 }
 return {createSession,prepareActivation,resolveActivation,prepareMaximumSixTrigger,resolveMaximumSixTrigger,reconcile};
}
