import type {Backrow,DuelState,Monster} from './duelEngine';
import {getPlayableCard} from './effectRegistry';
import {closeStandby} from './standbyFlow';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const PARALYZING_POTION_ID='50152549';
export const MASK_OF_THE_ACCURSED_ID='56948373';

type Team=0|1;
type LocatedMonster={team:Team;monster:Monster};

export type EquipAttackLockSession={
  duel:TagDuel;
  negatedSourceUids:string[];
  processedUpkeepIds:string[];
};

export type EquipAttackLockResult={
  targetUid:string;
  targetControllerTeam:Team;
  targetPhysicalOwnerSeat:number;
  isBlocked:boolean;
  blockedBy:string[];
};

export type EquipStandbyContext={phase:'standby';turn:number;team:Team};

export type MaskUpkeepResult={
  sourceUid:string;
  sourcePhysicalOwnerSeat:number;
  sourceControllerTeam:Team;
  targetUid:string;
  targetPhysicalOwnerSeat:number;
  targetControllerTeam:Team;
  damageAmount:number;
  lpBefore:number;
  lpAfter:number;
  sourceNegated:boolean;
  alreadyProcessed:boolean;
  gameFinished:boolean;
  winnerTeam:Team|null;
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
    throw new Error('A Equip Spell alterou uma mão privada.');
  }
}

function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A Equip Spell alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('A Equip Spell alterou a identidade física: '+uid);
  }
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
    if(main[seat]<20||main[seat]>30){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // Field Zone permanece separada das três Spell/Trap Zones.
}

function findMonster(duel:DuelState,uid:string):LocatedMonster|undefined{
  for(const team of [0,1] as const){
    const monster=duel.players[team].monsters.find(card=>card.uid===uid);
    if(monster)return {team,monster};
  }
  return undefined;
}

function assertSession(input:EquipAttackLockSession):void{
  assertPhysicalRules(input.duel);
  if(!Array.isArray(input.negatedSourceUids)||input.negatedSourceUids.length>4096||
    new Set(input.negatedSourceUids).size!==input.negatedSourceUids.length||
    !Array.isArray(input.processedUpkeepIds)||input.processedUpkeepIds.length>4096||
    new Set(input.processedUpkeepIds).size!==input.processedUpkeepIds.length){
    throw new Error('Ledger da Equip Spell inválido.');
  }
}

export function createEquipAttackLockSession(duel:TagDuel):EquipAttackLockSession{
  assertPhysicalRules(duel);
  return {duel:structuredClone(duel),negatedSourceUids:[],processedUpkeepIds:[]};
}

/** Negation is supplied by the host's chain/continuous resolver; this adapter
 * never guesses whether another card negates an Equip Spell. */
export function setEquipEffectNegated(
  input:EquipAttackLockSession,
  sourceUid:string,
  negated:boolean
):EquipAttackLockSession{
  assertSession(input);
  if(typeof sourceUid!=='string'||!sourceUid.trim()||typeof negated!=='boolean'){
    throw new Error('Fonte ou estado de negação inválido.');
  }
  const source=input.duel.core.players.flatMap(player=>player.backrow)
    .find(card=>card.uid===sourceUid&&
      (card.id===PARALYZING_POTION_ID||card.id===MASK_OF_THE_ACCURSED_ID));
  if(!source)throw new Error('Equip Spell não está no campo.');
  const next=structuredClone(input);
  next.negatedSourceUids=negated
    ? [...new Set([...next.negatedSourceUids,sourceUid])]
    : next.negatedSourceUids.filter(uid=>uid!==sourceUid);
  assertSession(next);
  return next;
}

/** Returns only restrictions created by these two face-up, resolved Equip
 * Spells. Normal attack-position, summoning-sickness and battle rules remain
 * the responsibility of the duel engine. */
export function equipAttackLockForMonster(
  input:EquipAttackLockSession,
  targetUid:string
):EquipAttackLockResult{
  assertSession(input);
  if(typeof targetUid!=='string'||!targetUid.trim())throw new Error('UID do monstro equipado inválido.');
  const target=findMonster(input.duel.core,targetUid);
  if(!target)throw new Error('Monstro equipado não está em uma Monster Zone.');
  const metadata=getPlayableCard(target.monster.id);
  if(!metadata||metadata.kind!=='monster')throw new Error('Metadados certificados do monstro equipado ausentes.');
  const blockedBy:string[]=[];
  for(const player of input.duel.core.players){
    for(const source of player.backrow){
      if(!source.faceUp||source.resolved!==true||source.equippedTo!==targetUid||
        input.negatedSourceUids.includes(source.uid))continue;
      if(source.id===MASK_OF_THE_ACCURSED_ID)blockedBy.push(source.uid);
      else if(source.id===PARALYZING_POTION_ID&&metadata.race!=='Machine')blockedBy.push(source.uid);
    }
  }
  return {
    targetUid,
    targetControllerTeam:target.team,
    targetPhysicalOwnerSeat:physicalSeat(targetUid),
    isBlocked:blockedBy.length>0,
    blockedBy
  };
}

function finishForLifePoints(core:DuelState,losingTeam:Team):Team|null{
  const draw=core.players.every(player=>player.lp<=0);
  const winnerTeam=draw?null:(1-losingTeam) as Team;
  delete core.movementSelection;
  delete core.afterEffectFlips;
  delete core.effectFlips;
  delete core.ritual;
  closeStandby(core);
  core.phase='finished';
  delete core.damageStep;
  delete core.triggerBuild;
  delete core.chainRoot;
  delete core.choice;
  delete core.handFlow;
  core.graveTriggers=[];
  core.summonTriggers=[];
  delete core.battleFlip;
  core.winner=winnerTeam===null?null:core.players[winnerTeam].id;
  core.reason='pontos de vida';
  core.log.push((winnerTeam===null?'Empate':core.players[winnerTeam].name+' venceu')+': pontos de vida.');
  return winnerTeam;
}

/** Mask of the Accursed triggers once per copy on the Equip Spell controller's
 * Standby Phase, but damages the team that currently controls the equipped
 * monster. A stolen monster therefore changes the LP recipient, not its UID
 * owner. */
export function resolveMaskOfTheAccursedStandby(
  input:EquipAttackLockSession,
  sourceUid:string,
  context:EquipStandbyContext
):{session:EquipAttackLockSession;result:MaskUpkeepResult}{
  assertSession(input);
  const team=context?.team;
  if(context?.phase!=='standby'||(team!==0&&team!==1)||
    context.turn!==input.duel.core.turn||input.duel.core.current!==team){
    throw new Error('Contexto de Standby Phase incompatível com o turno/controlador.');
  }
  if(typeof sourceUid!=='string'||!sourceUid.trim())throw new Error('UID da Equip Spell inválido.');
  const core=input.duel.core,key=String(context.turn)+':'+sourceUid;
  const source=core.players[team].backrow.find(card=>card.uid===sourceUid);
  if(!source||source.id!==MASK_OF_THE_ACCURSED_ID||!source.faceUp||
    source.resolved!==true||source.setTurn>=context.turn||!source.equippedTo){
    throw new Error('Mask of the Accursed não está elegível nesta Standby Phase.');
  }
  const target=findMonster(core,source.equippedTo);
  if(!target||!target.monster.faceUp){
    throw new Error('O monstro equipado não está mais face-up no campo.');
  }
  const sourceOwner=physicalSeat(sourceUid),targetOwner=physicalSeat(target.monster.uid);
  const lpBefore=core.players[target.team].lp;
  if(!Number.isSafeInteger(lpBefore)||lpBefore<0){
    throw new Error('LP da equipe que controla o monstro equipado deve ser inteiro não negativo.');
  }
  const keyAlreadyProcessed=input.processedUpkeepIds.includes(key);
  if(keyAlreadyProcessed){
    return {session:structuredClone(input),result:{
      sourceUid,sourcePhysicalOwnerSeat:sourceOwner,sourceControllerTeam:team,
      targetUid:target.monster.uid,targetPhysicalOwnerSeat:targetOwner,
      targetControllerTeam:target.team,damageAmount:0,lpBefore,lpAfter:lpBefore,
      sourceNegated:input.negatedSourceUids.includes(sourceUid),
      alreadyProcessed:true,gameFinished:core.phase==='finished',winnerTeam:null
    }};
  }
  if(core.phase==='finished')throw new Error('O duelo já terminou.');
  const next=structuredClone(input),nextCore=next.duel.core;
  const sourceNegated=next.negatedSourceUids.includes(sourceUid);
  const damageAmount=sourceNegated?0:500;
  const lpAfter=Math.max(0,lpBefore-damageAmount);
  nextCore.players[target.team].lp=lpAfter;
  next.processedUpkeepIds.push(key);
  let winnerTeam:Team|null=null,gameFinished=false;
  if(damageAmount>0&&lpAfter===0){
    winnerTeam=finishForLifePoints(nextCore,target.team);
    gameFinished=true;
  }
  assertSameInventory(inventorySnapshot(input.duel),next.duel);
  assertHandsUnchanged(handSnapshot(input.duel),next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    sourceUid,sourcePhysicalOwnerSeat:sourceOwner,sourceControllerTeam:team,
    targetUid:target.monster.uid,targetPhysicalOwnerSeat:targetOwner,
    targetControllerTeam:target.team,damageAmount,lpBefore,lpAfter,
    sourceNegated,alreadyProcessed:false,gameFinished,winnerTeam
  }};
}
