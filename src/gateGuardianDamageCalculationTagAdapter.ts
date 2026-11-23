import type {TagDuel} from './tagDuel';

export const KAZEJIN_ID='62340868';
export const SUIJIN_ID='98434877';
export const SANGA_OF_THE_THUNDER_ID='25955164';

const COMPONENT_IDS=new Set([KAZEJIN_ID,SUIJIN_ID,SANGA_OF_THE_THUNDER_ID]);

export const GATE_GUARDIAN_ATTACK_REDUCTION_RULE=Object.freeze({
  kind:'damageCalculationAttackZero',
  window:'opponentTurn',
  target:'attackingMonster',
  duration:'damageCalculation',
  oncePer:'faceUpInstance'
} as const);

export type GateGuardianNegationLookup=(state:TagDuel,sourceUid:string)=>boolean;
export type GateGuardianUseLedger=Readonly<Record<string,string>>;
export type GateGuardianAttackReductionPlan=Readonly<{
  sourceUid:string;
  sourceId:string;
  attackerUid:string;
  controllerTeam:0|1;
  attackerTeam:0|1;
  faceUpInstanceId:string;
  attackerAtkDuringDamageCalculation:0;
  duration:'damageCalculation';
}>;

function validateState(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
    state.members.some((member,index)=>!member||member.team!==index%2)||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    state.core.players.some(player=>!player||!Array.isArray(player.monsters))){
    throw new Error('Efeito dos componentes Gate Guardian exige um TagDuel clássico válido.');
  }
}

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):.+$/.exec(uid);
  if(!match)throw new Error('Participante de batalha sem UID físico válido.');
  return Number(match[1]);
}

function validatePhysicalUid(state:TagDuel,uid:string):void{
  const seat=physicalSeat(uid);
  if(!state.members[seat]||state.members[seat].team!==seat%2)throw new Error('Assento físico inexistente.');
}

function uniqueMonster(state:TagDuel,team:0|1,uid:string){
  const matches=state.core.players.flatMap((player,index)=>player.monsters
    .filter(monster=>monster.uid===uid)
    .map(monster=>({monster,team:index as 0|1})));
  if(matches.length>1)throw new Error('UID físico duplicado nas Zonas de Monstros.');
  return matches.length===1&&matches[0].team===team?matches[0].monster:undefined;
}

/**
 * Produces a non-mutating plan for the Gate Guardian components' Quick Effect.
 * faceUpInstanceId must be a caller-owned token that changes whenever the
 * source becomes face-down/face-up or leaves and re-enters the field. The
 * current cardLifetimes epoch tracks zone changes only, so it is not silently
 * treated as a complete face-up-instance token here.
 */
export function planGateGuardianAttackReduction(
  state:TagDuel,
  sourceUid:string,
  faceUpInstanceId:string,
  usedFaceUpInstances:GateGuardianUseLedger,
  isEffectNegated:GateGuardianNegationLookup
):GateGuardianAttackReductionPlan|undefined{
  validateState(state);
  if(typeof faceUpInstanceId!=='string'||faceUpInstanceId.trim().length===0)throw new Error('Token de instância face-up obrigatório.');
  if(!usedFaceUpInstances||typeof usedFaceUpInstances!=='object')throw new Error('Registro de uso face-up inválido.');
  if(typeof isEffectNegated!=='function')throw new Error('Informe o resolver de negação de efeitos.');

  const core=state.core,pending=core.pending;
  if(core.phase!=='response'||core.resume!=='battle'||core.damageStep!==true||
    pending.kind!=='attack'||pending.stage!=='calculation'||pending.actor!==core.current||
    pending.actor!==0&&pending.actor!==1||pending.target!==sourceUid)return;

  const attackerTeam=pending.actor as 0|1;
  const controllerTeam=(1-attackerTeam) as 0|1;
  const source=uniqueMonster(state,controllerTeam,sourceUid);
  const attacker=uniqueMonster(state,attackerTeam,pending.card);
  if(!source||source.faceUp!==true||!COMPONENT_IDS.has(source.id)||
    !attacker||attacker.faceUp!==true)return;
  validatePhysicalUid(state,source.uid);
  validatePhysicalUid(state,attacker.uid);
  if(usedFaceUpInstances[sourceUid]===faceUpInstanceId||isEffectNegated(state,sourceUid))return;

  return {
    sourceUid,
    sourceId:source.id,
    attackerUid:attacker.uid,
    controllerTeam,
    attackerTeam,
    faceUpInstanceId,
    attackerAtkDuringDamageCalculation:0,
    duration:'damageCalculation'
  };
}

/** Persist only after the Quick Effect successfully resolves. This function
 * returns a fresh ledger and never mutates the caller's record. */
export function recordGateGuardianAttackReductionUse(
  ledger:GateGuardianUseLedger,
  plan:GateGuardianAttackReductionPlan
):Record<string,string>{
  if(!plan||!plan.sourceUid||!plan.faceUpInstanceId)throw new Error('Plano de redução inválido.');
  if(ledger[plan.sourceUid]===plan.faceUpInstanceId)throw new Error('Instância face-up já consumida.');
  return {...ledger,[plan.sourceUid]:plan.faceUpInstanceId};
}
