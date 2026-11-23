import type {TagDuel} from './tagDuel';
import type {ContinuousRule} from './continuousRules';

export const MIRAGE_DRAGON_ID='15960641';
export const PITCH_BLACK_WARWOLF_ID='88975532';

export const BATTLE_TRAP_LOCK_RULE:ContinuousRule=Object.freeze({
  kind:'preventActivation',
  cardKind:'trap',
  controller:'opponent',
  window:'battle'
});

const CARD_IDS=new Set([MIRAGE_DRAGON_ID,PITCH_BLACK_WARWOLF_ID]);

export type BattleTrapLockNegationLookup=(state:TagDuel,sourceUid:string)=>boolean;
export type BattleTrapLockSource=Readonly<{
  sourceUid:string;
  cardId:string;
  controllerTeam:0|1;
  restrictedTeam:0|1;
  rule:ContinuousRule;
}>;

function validateState(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
    state.members.some((member,index)=>!member||member.team!==index%2)||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2){
    throw new Error('Bloqueio de Armadilhas exige um TagDuel clássico válido.');
  }
  for(const player of state.core.players){
    if(!player||!Array.isArray(player.monsters))throw new Error('Zona de Monstros do TagDuel inválida.');
  }
}

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):.+$/.exec(uid);
  if(!match)throw new Error('Fonte de bloqueio sem UID físico válido.');
  return Number(match[1]);
}

function isBattleWindow(state:TagDuel):boolean{
  const phase=state.core.phase;
  return phase==='battle'||state.core.resume==='battle'&&(phase==='response'||phase==='choice');
}

export function battleTrapLockRuleForCard(cardId:string):ContinuousRule|undefined{
  return CARD_IDS.has(cardId)?BATTLE_TRAP_LOCK_RULE:undefined;
}

/**
 * Resolves the two classic monsters' shared continuous policy against the
 * current TagDuel field. The controller is the team whose Monster Zone
 * currently contains the card, not the physical owner encoded in its UID.
 * Negation is injected so the caller must use the selected engine revision's
 * monster-effect-negation resolver rather than a cached or guessed flag.
 */
export function battleTrapLockSources(
  state:TagDuel,
  isEffectNegated:BattleTrapLockNegationLookup
):BattleTrapLockSource[]{
  validateState(state);
  if(typeof isEffectNegated!=='function')throw new Error('Informe o resolver de negação de efeitos.');
  if(!isBattleWindow(state))return [];

  const all=state.core.players.flatMap((player,team)=>player.monsters.map(monster=>({monster,team:team as 0|1})));
  const result:BattleTrapLockSource[]=[];
  for(const {monster,team} of all){
    if(!CARD_IDS.has(monster.id))continue;
    const seat=physicalSeat(monster.uid);
    if(!state.members[seat]||state.members[seat].team!==seat%2)throw new Error('Assento físico da fonte de bloqueio inexistente.');
    if(all.filter(row=>row.monster.uid===monster.uid).length!==1)throw new Error('UID físico duplicado na Zona de Monstros.');
    if(monster.faceUp!==true||isEffectNegated(state,monster.uid))continue;
    result.push({
      sourceUid:monster.uid,
      cardId:monster.id,
      controllerTeam:team,
      restrictedTeam:(1-team) as 0|1,
      rule:BATTLE_TRAP_LOCK_RULE
    });
  }
  return result;
}

/** Only new Trap Card activations are prohibited; Quick-Play Spells and
 * already-activated Trap effects are outside this policy. */
export function tagTrapActivationAllowed(
  state:TagDuel,
  activatingTeam:0|1,
  cardKind:'trap'|'non-trap',
  isEffectNegated:BattleTrapLockNegationLookup
):boolean{
  validateState(state);
  if(activatingTeam!==0&&activatingTeam!==1)throw new Error('Equipe ativadora inválida.');
  if(cardKind!=='trap'||!isBattleWindow(state))return true;
  return !battleTrapLockSources(state,isEffectNegated).some(source=>source.restrictedTeam===activatingTeam);
}
