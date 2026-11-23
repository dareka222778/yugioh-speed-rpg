import type {TagDuel} from './tagDuel';
import type {ContinuousRule} from './continuousRules';

export const EAGLE_EYE_ID='53693416';
export const CREEPING_DOOM_MANTA_ID='52571838';
export const INVASION_OF_FLAMES_ID='26082229';
export const TACTICAL_ESPIONAGE_EXPERT_ID='89698120';

const CARD_IDS=new Set([
  EAGLE_EYE_ID,
  CREEPING_DOOM_MANTA_ID,
  INVASION_OF_FLAMES_ID,
  TACTICAL_ESPIONAGE_EXPERT_ID
]);

export const NORMAL_SUMMON_TRAP_LOCK_RULE:ContinuousRule=Object.freeze({
  kind:'preventActivation',
  cardKind:'trap',
  controller:'both',
  window:'ownNormalSummon'
});

export type NormalSummonTrapLockNegationLookup=(state:TagDuel,sourceUid:string)=>boolean;

function validateState(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
    state.members.some((member,index)=>!member||member.team!==index%2)||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    state.core.players.some(player=>!player||!Array.isArray(player.monsters))){
    throw new Error('Bloqueio de Invocação-Normal exige um TagDuel clássico válido.');
  }
}

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):.+$/.exec(uid);
  if(!match)throw new Error('Fonte de bloqueio sem UID físico válido.');
  return Number(match[1]);
}

export function normalSummonTrapLockRuleForCard(cardId:string):ContinuousRule|undefined{
  return CARD_IDS.has(cardId)?NORMAL_SUMMON_TRAP_LOCK_RULE:undefined;
}

/**
 * The four Rise of Destiny monsters share the same exact text. Their policy
 * exists only in the response window for their own successful Normal Summon.
 * The effect-negation resolver is mandatory: the adapter never assumes that
 * a face-up source is necessarily unnegated.
 */
export function normalSummonTrapLockActive(
  state:TagDuel,
  isEffectNegated:NormalSummonTrapLockNegationLookup
):boolean{
  validateState(state);
  if(typeof isEffectNegated!=='function')throw new Error('Informe o resolver de negação de efeitos.');
  const core=state.core,pending=core.pending;
  if(core.phase!=='response'||pending.kind!=='summon'||core.pendingNegated===true)return false;
  if(pending.actor!==core.current||pending.actor!==0&&pending.actor!==1||!pending.id||!CARD_IDS.has(pending.id))return false;
  const source=core.players[pending.actor].monsters.find(monster=>monster.uid===pending.card&&monster.id===pending.id);
  if(!source||source.faceUp!==true)return false;
  const seat=physicalSeat(source.uid);
  if(!state.members[seat]||state.members[seat].team!==seat%2)throw new Error('Assento físico da fonte de bloqueio inexistente.');
  return !isEffectNegated(state,source.uid);
}

/** Both teams are barred from activating Trap Cards during this one summon
 * response window. Non-Trap activations and later windows remain untouched. */
export function tagTrapActivationAllowedDuringNormalSummon(
  state:TagDuel,
  activatingTeam:0|1,
  cardKind:'trap'|'non-trap',
  isEffectNegated:NormalSummonTrapLockNegationLookup
):boolean{
  validateState(state);
  if(activatingTeam!==0&&activatingTeam!==1)throw new Error('Equipe ativadora inválida.');
  if(cardKind!=='trap')return true;
  return !normalSummonTrapLockActive(state,isEffectNegated);
}
