import type {DuelState,Monster} from './duelEngine';
import {atk} from './duelEngine';
import {getActivationModel} from './effectModels';
import {getEffect} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const MIRROR_WALL_ID='22359980';
export const FAIRY_BOX_ID='21598948';
type Team=0|1;
type CoinSide='heads'|'tails';
type AttackPending=Extract<DuelState['pending'],{kind:'attack'}>;
export type ContinuousBattleTrapSession={
  duel:TagDuel;
  processedFairyBoxIds:string[];
  processedUpkeepIds:string[];
  zeroedByPhase:Record<string,string[]>;
};
export type FairyBoxAttackResult={
  sourceUid:string;
  attackerUid:string;
  phaseId:string;
  call:CoinSide;
  toss:CoinSide;
  correct:boolean;
  attackerAtkBefore:number;
  attackerAtkAfter:number;
};
export type ContinuousTrapUpkeepResult={
  sourceUid:string;
  cardId:string;
  controllerTeam:Team;
  sourcePhysicalOwnerSeat:number;
  cost:number;
  lpBefore:number;
  lpAfter:number;
  paid:boolean|null;
  paidAmount:number;
  destroyed:boolean;
  alreadyProcessed:boolean;
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function assertClassicShape(duel:TagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
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
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
  if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('A Armadilha contínua alterou uma mão privada.');
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A Armadilha contínua alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A Armadilha contínua alterou a identidade física: '+uid);
}
function assertPhysicalRules(duel:TagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3||duel.active.includes(Number(seat))){
      throw new Error('Assento físico de reserva inválido.');
    }
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // Field Zone is a separate property on each team.
}
function monsterOnField(duel:TagDuel,team:Team,uid:string):Monster|undefined{
  return duel.core.players[team].monsters.find(monster=>monster.uid===uid);
}
function currentAttack(duel:TagDuel,requireDeclare:boolean):{actor:Team;uid:string;monster:Monster}|undefined{
  const core=duel.core,pending=core.pending as AttackPending;
  if(core.phase!=='response'||pending.kind!=='attack'||core.pendingNegated||
    pending.cancelled||pending.endBattle||(pending.actor!==0&&pending.actor!==1))return;
  if(requireDeclare&&(pending.stage!=='declare'||core.damageStep))return;
  const actor=pending.actor as Team,monster=monsterOnField(duel,actor,pending.card);
  if(!monster||!monster.faceUp||monster.position!=='atk')return;
  return {actor,uid:pending.card,monster};
}
function counterTrapWindow(core:DuelState):boolean{
  const last=core.chain.at(-1);
  if(!last)return false;
  const effect=getEffect(last.id);
  return !!effect&&getActivationModel(effect)?.speed===3;
}
function removeControlledBackrow(core:DuelState,controller:Team,uid:string){
  const player=core.players[controller],index=player.backrow.findIndex(card=>card.uid===uid);
  if(index<0)return;
  return player.backrow.splice(index,1)[0];
}
function moveCardToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  if(core.players.some(player=>player.grave.some(card=>card.uid===uid)))return false;
  const card=removeControlledBackrow(core,controller,uid);
  if(!card)return false;
  core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:card.uid,id:card.id});
  return true;
}
function maintenanceCost(cardId:string):number{
  if(cardId===MIRROR_WALL_ID)return 2000;
  if(cardId===FAIRY_BOX_ID)return 500;
  throw new Error('Carta sem custo de manutenção M577.');
}

export function createContinuousBattleTrapSession(duel:TagDuel):ContinuousBattleTrapSession{
  assertPhysicalRules(duel);
  return {duel:structuredClone(duel),processedFairyBoxIds:[],processedUpkeepIds:[],zeroedByPhase:{}};
}

/** Mirror Wall's continuous ATK modifier applies to the current opponent attacker.
 * Each face-up copy applies one halving; the monster object is never mutated. */
export function mirrorWallEffectiveAtk(duel:TagDuel):number|null{
  assertPhysicalRules(duel);
  const attack=currentAttack(duel,false);
  if(!attack)return null;
  const controller=(1-attack.actor) as Team;
  const copies=duel.core.players[controller].backrow.filter(card=>card.id===MIRROR_WALL_ID&&card.faceUp).length;
  let value=atk(attack.monster,duel.core);
  for(let copy=0;copy<copies;copy++)value=Math.floor(value/2);
  return value;
}

/** Fairy Box is a Spell Speed 2 attack-declaration response. */
export function fairyBoxAttackActions(duel:TagDuel):string[]{
  assertPhysicalRules(duel);
  const attack=currentAttack(duel,true);
  if(!attack||duel.core.damageStep||counterTrapWindow(duel.core))return [];
  const controller=(1-attack.actor) as Team;
  if(duel.core.priority!==controller)return [];
  return duel.core.players[controller].backrow
    .filter(card=>card.id===FAIRY_BOX_ID&&card.faceUp&&card.setTurn<duel.core.turn)
    .map(card=>card.uid);
}
export function fairyBoxEffectiveAtk(
  session:ContinuousBattleTrapSession,
  phaseId:string
):number|null{
  assertPhysicalRules(session.duel);
  const attack=currentAttack(session.duel,false);
  if(!attack)return null;
  if((session.zeroedByPhase[phaseId]??[]).includes(attack.uid))return 0;
  return mirrorWallEffectiveAtk(session.duel);
}
export function resolveFairyBoxAttack(
  input:ContinuousBattleTrapSession,
  sourceUid:string,
  call:CoinSide,
  toss:CoinSide,
  phaseId:string
):{session:ContinuousBattleTrapSession;result:FairyBoxAttackResult}{
  if((call!=='heads'&&call!=='tails')||(toss!=='heads'&&toss!=='tails')||
    typeof phaseId!=='string'||!phaseId.trim())throw new Error('Chamada, moeda ou Battle Phase inválida.');
  assertPhysicalRules(input.duel);
  const attack=currentAttack(input.duel,true);
  if(!attack||!fairyBoxAttackActions(input.duel).includes(sourceUid)){
    throw new Error('Fairy Box não está disponível para esta declaração de ataque.');
  }
  const eventId=phaseId+':'+sourceUid+':'+attack.uid;
  if(input.processedFairyBoxIds.includes(eventId))throw new Error('Resolução de Fairy Box duplicada nesta Battle Phase.');
  const next=structuredClone(input),attackerAtkBefore=mirrorWallEffectiveAtk(next.duel);
  const correct=call===toss;
  if(correct){
    const affected=next.zeroedByPhase[phaseId]??[];
    if(!affected.includes(attack.uid))affected.push(attack.uid);
    next.zeroedByPhase[phaseId]=affected;
  }
  next.processedFairyBoxIds.push(eventId);
  const attackerAtkAfter=fairyBoxEffectiveAtk(next,phaseId);
  return {session:next,result:{
    sourceUid,attackerUid:attack.uid,phaseId,call,toss,correct,
    attackerAtkBefore:attackerAtkBefore??0,attackerAtkAfter:attackerAtkAfter??0
  }};
}

/** Each Continuous Trap has its own once-per-turn Standby Phase upkeep. */
export type StandbyContext={phase:'standby';turn:number;team:Team};

/** The host supplies this context from its Standby continuation. DuelState.phase
 * intentionally has no literal "standby"; StandbyFlow owns that boundary. */
export function resolveContinuousTrapUpkeep(
  input:ContinuousBattleTrapSession,
  sourceUid:string,
  pay:boolean,
  context:StandbyContext
):{session:ContinuousBattleTrapSession;result:ContinuousTrapUpkeepResult}{
  assertPhysicalRules(input.duel);
  const core=input.duel.core,controller=context?.team;
  if(context?.phase!=='standby'||(controller!==0&&controller!==1)||
    context.turn!==core.turn||core.current!==controller){
    throw new Error('Contexto de Standby Phase incompatível com o turno/controlador.');
  }
  const key=core.turn+':'+sourceUid;
  const existing=input.processedUpkeepIds.includes(key);
  if(existing){
    const priorOwner=physicalSeat(sourceUid),knownId=core.players.flatMap(p=>p.backrow).find(c=>c.uid===sourceUid)?.id;
    return {session:structuredClone(input),result:{
      sourceUid,cardId:knownId??'',controllerTeam:controller,sourcePhysicalOwnerSeat:priorOwner,
      cost:knownId?maintenanceCost(knownId):0,lpBefore:core.players[controller].lp,
      lpAfter:core.players[controller].lp,paid:null,paidAmount:0,destroyed:false,alreadyProcessed:true
    }};
  }
  const source=core.players[controller].backrow.find(card=>card.uid===sourceUid);
  if(!source||!source.faceUp||(source.id!==MIRROR_WALL_ID&&source.id!==FAIRY_BOX_ID)||
    source.setTurn>=core.turn){
    throw new Error('A Continuous Trap não está elegível para manutenção nesta Standby Phase.');
  }
  const cost=maintenanceCost(source.id),ownerSeat=physicalSeat(sourceUid);
  const next=structuredClone(input),nextCore=next.duel.core,lpBefore=nextCore.players[controller].lp;
  const paid=pay&&lpBefore>=cost;
  let destroyed=false;
  if(paid)nextCore.players[controller].lp-=cost;
  else{
    destroyed=moveCardToOwnerGrave(nextCore,controller,sourceUid);
    if(!destroyed)throw new Error('A Continuous Trap não foi enviada ao Cemitério do proprietário físico.');
  }
  next.processedUpkeepIds.push(key);
  assertSameInventory(inventorySnapshot(input.duel),next.duel);
  assertHandsUnchanged(handSnapshot(input.duel),next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    sourceUid,cardId:source.id,controllerTeam:controller,sourcePhysicalOwnerSeat:ownerSeat,
    cost,lpBefore,lpAfter:nextCore.players[controller].lp,paid,paidAmount:paid?cost:0,
    destroyed,alreadyProcessed:false
  }};
}
