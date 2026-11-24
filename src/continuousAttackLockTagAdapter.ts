import type {DuelState,Monster} from './duelEngine';
import {atk} from './duelEngine';
import {getPlayableCard} from './effectRegistry';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const MESSENGER_OF_PEACE_ID='44656491';
export const GRAVEKEEPERS_SERVANT_ID='16762927';
type Team=0|1;
type StandbyPending=Extract<DuelState['pending'],{kind:'standby'}>;
export type AttackRestrictionReason={
  kind:'messenger-of-peace'|'gravekeepers-servant'|'invalid-attacker'|'deck-insufficient';
  sourceUid?:string;
  threshold?:number;
  required?:number;
  available?:number;
  message:string;
};
export type AttackRestrictionReport={
  canDeclare:boolean;
  attackingTeam:Team;
  defendingTeam:Team;
  activeAttackerSeat:number;
  attackerUid:string;
  attackerAtk:number;
  requiredMillCount:number;
  deckCount:number;
  blockedBy:AttackRestrictionReason[];
};
export type MilledPhysicalCard={uid:string;id:string;physicalOwnerSeat:number};
export type AttackDeclarationResult={
  attackId:string;
  canDeclare:boolean;
  attackingTeam:Team;
  attackerUid:string;
  requiredMillCount:number;
  milled:MilledPhysicalCard[];
  blockedBy:AttackRestrictionReason[];
};
export type ContinuousAttackLockSession={
  duel:TagDuel;
  processedAttackIds:string[];
  processedMaintenance:Record<string,number>;
};
export type MessengerMaintenanceResult={
  eventId:string;
  sourceUid:string;
  sourcePhysicalOwnerSeat:number;
  controllerTeam:Team;
  turn:number;
  choice:'pay'|'destroy';
  outcome:'paid'|'destroyed';
  lpBefore:number;
  lpAfter:number;
  sourceSentToGrave:boolean;
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
    throw new Error('A restrição contínua alterou uma mão privada.');
  }
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A restrição contínua alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('A restrição contínua alterou a identidade física: '+uid);
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
}
function sourceInTeam(duel:TagDuel,team:Team,uid:string){
  return duel.core.players[team].backrow.find(card=>card.uid===uid);
}
function locateSource(duel:TagDuel,uid:string):{team:Team;card:NonNullable<ReturnType<typeof sourceInTeam>>}|undefined{
  for(const team of [0,1] as const){
    const card=sourceInTeam(duel,team,uid);
    if(card)return {team,card};
  }
  return;
}
function monsterOnField(core:DuelState,team:Team,uid:string):Monster|undefined{
  return core.players[team].monsters.find(monster=>monster.uid===uid);
}
function moveSourceToOwnerGrave(duel:TagDuel,controllerTeam:Team,uid:string):boolean{
  if(duel.core.players.some(player=>player.grave.some(card=>card.uid===uid)))return false;
  const source=sourceInTeam(duel,controllerTeam,uid);
  if(!source)return false;
  const index=duel.core.players[controllerTeam].backrow.findIndex(card=>card.uid===uid);
  const [card]=duel.core.players[controllerTeam].backrow.splice(index,1);
  duel.core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:card.uid,id:card.id});
  return true;
}

export function createContinuousAttackLockSession(duel:TagDuel):ContinuousAttackLockSession{
  assertPhysicalRules(duel);
  return {duel:structuredClone(duel),processedAttackIds:[],processedMaintenance:{}};
}

/** Messenger of Peace is global: it restricts both teams using live ATK.
 * Gravekeeper's Servant taxes only the opposing team's attack, using the
 * currently active physical seat's own Deck (top card is index zero). */
export function inspectAttackRestrictions(
  duel:TagDuel,
  attackingTeam:Team,
  attackerUid:string
):AttackRestrictionReport{
  assertPhysicalRules(duel);
  if(attackingTeam!==0&&attackingTeam!==1)throw new Error('Equipe atacante inválida.');
  const defendingTeam=(1-attackingTeam) as Team;
  const activeAttackerSeat=duel.active[attackingTeam];
  const attacker=monsterOnField(duel.core,attackingTeam,attackerUid);
  const invalid=():AttackRestrictionReport=>({
    canDeclare:false,attackingTeam,defendingTeam,activeAttackerSeat,attackerUid,
    attackerAtk:0,requiredMillCount:0,deckCount:duel.core.players[attackingTeam].deck.length,
    blockedBy:[{kind:'invalid-attacker',message:'O atacante precisa estar face-up em Attack Position na equipe ativa.'}]
  });
  if(!Number.isSafeInteger(activeAttackerSeat)||duel.members[activeAttackerSeat]?.team!==attackingTeam||
    !attacker||!attacker.faceUp||attacker.position!=='atk'||
    getPlayableCard(attacker.id)?.kind!=='monster')return invalid();
  const currentAtk=atk(attacker,duel.core);
  if(!Number.isSafeInteger(currentAtk)||currentAtk<0)throw new Error('ATK atual do atacante inválido.');
  const messengers=duel.core.players.flatMap((player,team)=>player.backrow
    .filter(card=>card.id===MESSENGER_OF_PEACE_ID&&card.faceUp)
    .map(card=>({team:team as Team,uid:card.uid})));
  const servants=duel.core.players[defendingTeam].backrow
    .filter(card=>card.id===GRAVEKEEPERS_SERVANT_ID&&card.faceUp);
  const deckCount=duel.core.players[attackingTeam].deck.length;
  const blockedBy:AttackRestrictionReason[]=[];
  if(currentAtk>=1500){
    for(const messenger of messengers)blockedBy.push({
      kind:'messenger-of-peace',sourceUid:messenger.uid,threshold:1500,
      message:'Messenger of Peace impede monstros com ATK atual de 1500 ou mais.'
    });
  }
  if(servants.length&&deckCount<servants.length){
    blockedBy.push({
      kind:'deck-insufficient',required:servants.length,available:deckCount,
      message:'Não há cartas suficientes no Deck físico ativo para pagar Gravekeeper\'s Servant.'
    });
  }
  return {
    canDeclare:blockedBy.length===0,attackingTeam,defendingTeam,activeAttackerSeat,
    attackerUid,attackerAtk:currentAtk,requiredMillCount:servants.length,deckCount,blockedBy
  };
}

export function resolveAttackDeclaration(
  input:ContinuousAttackLockSession,
  attackingTeam:Team,
  attackerUid:string,
  attackId:string
):{session:ContinuousAttackLockSession;result:AttackDeclarationResult}{
  if(typeof attackId!=='string'||!attackId.trim()||input.processedAttackIds.includes(attackId)){
    throw new Error('ID de declaração de ataque ausente ou duplicado.');
  }
  assertPhysicalRules(input.duel);
  if(input.duel.core.phase!=='battle'||input.duel.core.current!==attackingTeam){
    throw new Error('A declaração só pode ser validada na Battle Phase da equipe ativa.');
  }
  const report=inspectAttackRestrictions(input.duel,attackingTeam,attackerUid);
  if(!report.canDeclare){
    return {session:structuredClone(input),result:{
      attackId,canDeclare:false,attackingTeam,attackerUid,
      requiredMillCount:report.requiredMillCount,milled:[],blockedBy:report.blockedBy
    }};
  }
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input);
  const deck=next.duel.core.players[attackingTeam].deck;
  if(deck.length<report.requiredMillCount)throw new Error('O Deck mudou antes do pagamento do custo de ataque.');
  const cards=deck.splice(0,report.requiredMillCount);
  const milled:MilledPhysicalCard[]=cards.map(card=>{
    const owner=physicalSeat(card.uid);
    if(owner!==report.activeAttackerSeat)throw new Error('O topo do Deck não pertence ao assento atacante ativo.');
    next.duel.core.players[attackingTeam].grave.push({uid:card.uid,id:card.id});
    return {uid:card.uid,id:card.id,physicalOwnerSeat:owner};
  });
  next.processedAttackIds.push(attackId);
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    attackId,canDeclare:true,attackingTeam,attackerUid,
    requiredMillCount:report.requiredMillCount,milled,blockedBy:[]
  }};
}

export function messengerMaintenanceTaskId(sourceUid:string,turn:number):string{
  if(!sourceUid||!Number.isSafeInteger(turn)||turn<1)throw new Error('UID ou turno de manutenção inválido.');
  return 'm575:messenger:'+sourceUid+':'+turn;
}

/** Resolve the choice produced by a future StandbyTask bridge. The task
 * scheduler remains owned by standbyFlow.ts; this function only applies the
 * card-specific pay-or-destroy result once the matching standby choice exists. */
export function resolveMessengerMaintenance(
  input:ContinuousAttackLockSession,
  sourceUid:string,
  choice:'pay'|'destroy'
):{session:ContinuousAttackLockSession;result:MessengerMaintenanceResult}{
  assertPhysicalRules(input.duel);
  const located=locateSource(input.duel,sourceUid);
  if(!located||located.card.id!==MESSENGER_OF_PEACE_ID||!located.card.faceUp){
    throw new Error('Messenger of Peace face-up não encontrado no backrow.');
  }
  const controllerTeam=located.team,turn=input.duel.core.turn,pending=input.duel.core.pending as StandbyPending;
  if(input.duel.core.phase!=='response'||pending.kind!=='standby'||
    pending.actor!==controllerTeam||input.duel.core.current!==controllerTeam||
    pending.taskId!==messengerMaintenanceTaskId(sourceUid,turn)||pending.choiceId!==choice){
    throw new Error('A escolha não pertence à Standby atual do controlador de Messenger of Peace.');
  }
  if(input.processedMaintenance[sourceUid]===turn){
    throw new Error('Messenger of Peace já resolveu sua manutenção neste turno.');
  }
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input);
  const lpBefore=next.duel.core.players[controllerTeam].lp;
  if(!Number.isSafeInteger(lpBefore)||lpBefore<0)throw new Error('LP de manutenção deve ser inteiro seguro não negativo.');
  let outcome:'paid'|'destroyed'='destroyed',sourceSentToGrave=false;
  if(choice==='pay'&&lpBefore>100){
    next.duel.core.players[controllerTeam].lp=lpBefore-100;
    outcome='paid';
  }else{
    sourceSentToGrave=moveSourceToOwnerGrave(next.duel,controllerTeam,sourceUid);
    if(!sourceSentToGrave)throw new Error('Messenger of Peace não foi enviado ao Cemitério do proprietário físico.');
  }
  next.processedMaintenance[sourceUid]=turn;
  const lpAfter=next.duel.core.players[controllerTeam].lp;
  const result:MessengerMaintenanceResult={
    eventId:'m575:messenger-maintenance:'+sourceUid+':'+turn,
    sourceUid,sourcePhysicalOwnerSeat:physicalSeat(sourceUid),controllerTeam,turn,
    choice,outcome,lpBefore,lpAfter,sourceSentToGrave
  };
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result};
}
