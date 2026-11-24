import type {DuelState,Monster} from './duelEngine';
import {atk} from './duelEngine';
import {getActivationModel} from './effectModels';
import {getEffect,getPlayableCard} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const DRAINING_SHIELD_ID='43250041';
export const ENCHANTED_JAVELIN_ID='96355986';

type Team=0|1;
type AttackPending=Extract<DuelState['pending'],{kind:'attack'}>;
type AttackSnapshot={
  turn:number;
  actor:Team;
  card:string;
  target:string|null;
  attackCount:number;
  attacked:number;
};
export type AttackLpGainAction={kind:'trap';card:string;target:string};
type Activation={
  activationId:string;
  sourceUid:string;
  sourceId:string;
  sourceOwnerSeat:number;
  controllerTeam:Team;
  controllerSeat:number;
  attack:AttackSnapshot;
};
export type AttackLpGainSession={
  duel:TagDuel;
  pending:Record<string,Activation>;
  resolved:string[];
  processedEventIds:string[];
};
export type FirePrincessLpGainEvent={
  eventId:string;
  gainingTeam:Team;
  lpGained:number;
  teamLifePointsAfterGain:[number,number];
  negatedSourceUids:string[];
};
export type AttackLpGainResolution={
  activationId:string;
  cardId:string;
  sourceActivationNegated:boolean;
  effectApplied:boolean;
  attackNegated:boolean;
  attackerUid:string;
  targetUid:string|null;
  attackerAtk:number;
  gainAmount:number;
  recipientTeam:Team|null;
  teamLifePoints:[number,number];
  sourcePhysicalOwnerSeat:number;
  sourceSentToGrave:boolean;
  eventId:string;
  firePrincessEvent:FirePrincessLpGainEvent|null;
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
  if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('A resposta de ataque alterou uma mão privada.');
  }
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A resposta de ataque alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('A resposta de ataque alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:TagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // Este adapter não altera mãos nem executa o descarte obrigatório da End Phase.
}
function sourceCard(duel:TagDuel,team:Team,uid:string){
  return duel.core.players[team].backrow.find(card=>card.uid===uid);
}
function monsterOnField(core:DuelState,team:Team,uid:string):Monster|undefined{
  return core.players[team].monsters.find(monster=>monster.uid===uid);
}
function currentAttack(duel:TagDuel):AttackSnapshot|undefined{
  const pending=duel.core.pending;
  if(duel.core.phase!=='response'||pending.kind!=='attack'||pending.stage!=='declare'||
    duel.core.pendingNegated||pending.cancelled||pending.endBattle||duel.core.damageStep||
    (pending.actor!==0&&pending.actor!==1))return;
  const actor=pending.actor as Team;
  const attacker=monsterOnField(duel.core,actor,pending.card);
  if(!attacker||!attacker.faceUp||attacker.position!=='atk'||getPlayableCard(attacker.id)?.kind!=='monster')return;
  return {
    turn:duel.core.turn,actor,card:pending.card,target:pending.target??null,
    attackCount:attacker.attackCount??0,attacked:attacker.attacked
  };
}
function sameAttack(duel:TagDuel,expected:AttackSnapshot):boolean{
  const actual=currentAttack(duel);
  return !!actual&&actual.turn===expected.turn&&actual.actor===expected.actor&&
    actual.card===expected.card&&actual.target===expected.target&&
    actual.attackCount===expected.attackCount&&actual.attacked===expected.attacked;
}
function counterTrapWindow(core:DuelState):boolean{
  const last=core.chain.at(-1);
  if(!last)return false;
  const effect=getEffect(last.id);
  return !!effect&&getActivationModel(effect)?.speed===3;
}
function removeControlledCard(core:DuelState,team:Team,uid:string){
  const player=core.players[team],index=player.backrow.findIndex(card=>card.uid===uid);
  if(index>=0)return player.backrow.splice(index,1)[0];
  if(player.field?.uid===uid){const field=player.field;player.field=null;return field;}
  return;
}
function moveCardToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  if(core.players.some(player=>player.grave.some(card=>card.uid===uid)))return false;
  const card=removeControlledCard(core,controller,uid);
  if(!card)return false;
  core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:card.uid,id:card.id});
  return true;
}

/** The two Normal Traps share the attack-declaration response window, but not
 * their targeting or cancellation semantics. No action is offered in Damage
 * Step, after the attack was cancelled, or over a Spell Speed 3 chain link. */
export function attackLpGainActions(duel:TagDuel):AttackLpGainAction[]{
  assertPhysicalRules(duel);
  const core=duel.core;
  if(core.phase!=='response'||(core.priority!==0&&core.priority!==1)||core.damageStep||counterTrapWindow(core))return [];
  const team=core.priority as Team,seat=duel.active[team];
  if(!Number.isSafeInteger(seat)||duel.members[seat]?.team!==team)return [];
  const attack=currentAttack(duel);
  if(!attack)return [];
  return core.players[team].backrow
    .filter(card=>(card.id===DRAINING_SHIELD_ID||card.id===ENCHANTED_JAVELIN_ID)&&
      !card.faceUp&&card.setTurn<core.turn&&physicalSeat(card.uid)%2===team)
    .filter(card=>card.id!==DRAINING_SHIELD_ID||attack.actor!==team)
    .map(card=>({kind:'trap',card:card.uid,target:card.id===DRAINING_SHIELD_ID?attack.card:''}));
}

export function createAttackLpGainSession(duel:TagDuel):AttackLpGainSession{
  assertPhysicalRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[],processedEventIds:[]};
}

export function activateAttackLpGain(
  input:AttackLpGainSession,
  sourceUid:string,
  activationId:string
):AttackLpGainSession{
  if(typeof activationId!=='string'||!activationId.trim()||input.pending[activationId]||
    input.resolved.includes(activationId))throw new Error('ID de ativação ausente ou duplicado.');
  assertPhysicalRules(input.duel);
  const team=input.duel.core.priority;
  if(team!==0&&team!==1)throw new Error('Equipe sem prioridade de resposta.');
  if(!attackLpGainActions(input.duel).some(action=>action.card===sourceUid)){
    throw new Error('A Armadilha não está legal para a declaração de ataque atual.');
  }
  const source=sourceCard(input.duel,team as Team,sourceUid),attack=currentAttack(input.duel);
  if(!source||source.faceUp||source.setTurn>=input.duel.core.turn||!attack){
    throw new Error('A Armadilha não está Set e liberada para esta janela.');
  }
  const owner=physicalSeat(sourceUid);
  if(owner%2!==team)throw new Error('A Armadilha não pertence fisicamente à equipe controladora.');
  if(source.id===DRAINING_SHIELD_ID&&attack.actor===team){
    throw new Error('Draining Shield só responde ao ataque de um monstro adversário.');
  }
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input);
  const activated=sourceCard(next.duel,team as Team,sourceUid);
  if(!activated)throw new Error('A Armadilha saiu do campo antes do registro.');
  activated.faceUp=true;
  next.duel.core.chain.push({
    actor:team as Team,card:sourceUid,id:activated.id,
    target:activated.id===DRAINING_SHIELD_ID?attack.card:''
  });
  next.duel.core.priority=1-team;
  next.duel.core.passes=0;
  next.pending[activationId]={
    activationId,sourceUid,sourceId:activated.id,sourceOwnerSeat:owner,
    controllerTeam:team as Team,controllerSeat:input.duel.active[team],attack
  };
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return next;
}

export function resolveAttackLpGain(
  input:AttackLpGainSession,
  activationId:string,
  options:{sourceActivationNegated?:boolean}={}
):{session:AttackLpGainSession;result:AttackLpGainResolution}{
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId)){
    throw new Error('Ativação da Armadilha ausente ou já resolvida.');
  }
  assertPhysicalRules(input.duel);
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel);
  const next=structuredClone(input),core=next.duel.core;
  const own=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
    link.card===activation.sourceUid&&link.id===activation.sourceId);
  if(own!==core.chain.length-1)throw new Error('A Armadilha só pode resolver no topo da corrente.');
  core.chain.pop();
  let effectApplied=false,attackNegated=false,attackerAtk=0,gainAmount=0;
  if(!options.sourceActivationNegated&&sameAttack(next.duel,activation.attack)){
    const attacker=monsterOnField(core,activation.attack.actor,activation.attack.card);
    if(attacker){
      attackerAtk=atk(attacker,core);
      if(!Number.isSafeInteger(attackerAtk)||attackerAtk<0){
        throw new Error('ATK atual do atacante inválido para a recuperação de LP.');
      }
      if(activation.sourceId===DRAINING_SHIELD_ID&&activation.attack.actor!==activation.controllerTeam){
        const pending=core.pending as AttackPending;
        pending.cancelled=true;
        attackNegated=true;
        effectApplied=true;
        gainAmount=attackerAtk;
      }else if(activation.sourceId===ENCHANTED_JAVELIN_ID){
        effectApplied=true;
        gainAmount=attackerAtk;
      }
    }
  }
  const currentLp=core.players[activation.controllerTeam].lp;
  if(!Number.isSafeInteger(currentLp)||currentLp<0){
    throw new Error('LP da equipe controladora deve ser um inteiro seguro não negativo.');
  }
  const nextLp=currentLp+gainAmount;
  if(!Number.isSafeInteger(nextLp))throw new Error('A recuperação excederia o intervalo de inteiros seguros.');
  if(gainAmount>0)core.players[activation.controllerTeam].lp=nextLp;
  const sourceSentToGrave=moveCardToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  if(!sourceSentToGrave)throw new Error('A Armadilha resolvida não foi enviada ao Cemitério do proprietário físico.');
  delete next.pending[activationId];
  next.resolved.push(activationId);
  const eventId='m574:'+activationId;
  if(next.processedEventIds.includes(eventId))throw new Error('Evento de recuperação duplicado.');
  next.processedEventIds.push(eventId);
  const teamLifePoints:[number,number]=[core.players[0].lp,core.players[1].lp];
  const firePrincessEvent=effectApplied?{
    eventId,gainingTeam:activation.controllerTeam,lpGained:gainAmount,
    teamLifePointsAfterGain:[...teamLifePoints] as [number,number],negatedSourceUids:[]
  }:null;
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    activationId,cardId:activation.sourceId,sourceActivationNegated:!!options.sourceActivationNegated,
    effectApplied,attackNegated,attackerUid:activation.attack.card,
    targetUid:activation.sourceId===DRAINING_SHIELD_ID?activation.attack.card:null,
    attackerAtk,gainAmount,recipientTeam:effectApplied?activation.controllerTeam:null,
    teamLifePoints,sourcePhysicalOwnerSeat:activation.sourceOwnerSeat,sourceSentToGrave,
    eventId,firePrincessEvent
  }};
}
