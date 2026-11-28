import type {TagDuel} from './tagDuel';

export const BARREL_BEHIND_THE_DOOR_ID='78783370';
export type RedirectTeam=0|1;
export type BarrelRedirectLedger=Readonly<{version:1;processedActivationIds:readonly string[]}>;
export type BarrelRedirectPlan=Readonly<{
  activationId:string;
  sourceEffectActivationId:string;
  sourceEffectChainLinkId:string;
  counterTrapUid:string;
  counterTrapCardId:string;
  controllerTeam:RedirectTeam;
  originalTargetTeam:RedirectTeam;
  redirectedTargetTeam:RedirectTeam;
  amount:number;
  reason:'barrel-behind-the-door-redirection';
}>;
export type BarrelRedirectResolution=Readonly<{
  status:'redirected'|'not-applicable'|'no-damage'|'unchanged'|'duplicate';
  ledger:BarrelRedirectLedger;
  plan?:BarrelRedirectPlan;
}>;

/**
 * This is a chain-resolution receipt, not an LP mutation. activationId identifies
 * this particular Counter Trap activation; sourceEffectActivationId identifies
 * the one source effect whose single damage event is being redirected.
 */
export type BarrelDamageActivationEvent=Readonly<{
  activationId:string;
  sourceEffectActivationId:string;
  sourceEffectChainLinkId:string;
  counterTrapUid:string;
  controllerTeam:RedirectTeam;
  originalTargetTeam:RedirectTeam;
  currentLPByTeam:readonly [number,number];
  sourceCardId:string;
  sourceUid:string;
  sourceType:'spell'|'trap'|'monster';
  wasSetFaceDown:boolean;
  counterTrapResolved:boolean;
  counterTrapNegated:boolean;
  sourceEffectWillResolve:boolean;
  sourceEffectNegated:boolean;
  effectActivated:boolean;
  wouldInflictDamage:boolean;
  damageAmount:number;
  damageAlreadyApplied:boolean;
}>;

function assertTeam(value:unknown):asserts value is RedirectTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida para redirecionamento.');
}
function assertNonEmpty(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertCardId(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!/^[0-9]{8}$/.test(value))throw new Error(label+' inválido.');
}
function assertLedger(ledger:BarrelRedirectLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedActivationIds)||
    ledger.processedActivationIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(ledger.processedActivationIds).size!==ledger.processedActivationIds.length){
    throw new Error('Ledger de redirecionamento inválido.');
  }
}
function nextLedger(ledger:BarrelRedirectLedger,activationId:string):BarrelRedirectLedger{
  return {version:1,processedActivationIds:[...ledger.processedActivationIds,activationId]};
}
function assertClassicTag(state:TagDuel):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !state.core.teamRotation||!Array.isArray(state.core.teamRotation.active)||
    state.core.teamRotation.active.length!==2){
    throw new Error('Redirecionamento exige um duelo 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||
    state.members.some((member,index)=>!member.id||member.team!==index%2)||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    state.active[state.cursor%2]!==state.cursor){
    throw new Error('Assentos físicos de TagDuel inválidos para redirecionamento.');
  }
  if(state.core.teamRotation.cursor!==state.cursor||
    state.core.teamRotation.active[0]!==state.active[0]||
    state.core.teamRotation.active[1]!==state.active[1]||
    state.core.players.some((player,team)=>player.id!=='tag-team-'+team||
      !Number.isSafeInteger(player.lp)||player.lp<0||!Array.isArray(player.backrow))||
    state.core.current!==state.cursor%2){
    throw new Error('Rotação, LP ou backrow compartilhado inconsistente para redirecionamento.');
  }
}
function assertPhysicalUid(state:TagDuel,uid:string,label:string):void{
  assertNonEmpty(uid,label);
  const match=/^m([0-3]):(.+)$/.exec(uid);
  if(!match)throw new Error(label+' sem proprietário físico verificável.');
  const seat=Number(match[1]);
  const member=state.members[seat];
  if(!member||member.team!==seat%2)throw new Error(label+' aponta para proprietário físico inconsistente.');
}
function assertLpSnapshot(state:TagDuel,values:readonly [number,number]):void{
  if(!Array.isArray(values)||values.length!==2||
    values.some(value=>!Number.isSafeInteger(value)||value<0)||
    state.core.players[0].lp!==values[0]||state.core.players[1].lp!==values[1]){
    throw new Error('Snapshot de LP obsoleto para redirecionamento.');
  }
}
function assertEvent(event:BarrelDamageActivationEvent):void{
  assertNonEmpty(event?.activationId,'ID da ativação da Counter Trap');
  assertNonEmpty(event.sourceEffectActivationId,'ID da ativação do efeito de origem');
  assertNonEmpty(event.sourceEffectChainLinkId,'Chain Link do efeito de origem');
  assertNonEmpty(event.counterTrapUid,'UID físico da Counter Trap');
  assertTeam(event.controllerTeam);assertTeam(event.originalTargetTeam);
  assertCardId(event.sourceCardId,'Identidade da carta que causaria dano');
  assertNonEmpty(event.sourceUid,'UID físico da carta que causaria dano');
  if(!Array.isArray(event.currentLPByTeam)||event.currentLPByTeam.length!==2||
    event.currentLPByTeam.some(value=>!Number.isSafeInteger(value)||value<0)||
    !['spell','trap','monster'].includes(event.sourceType)||
    typeof event.wasSetFaceDown!=='boolean'||
    typeof event.counterTrapResolved!=='boolean'||typeof event.counterTrapNegated!=='boolean'||
    typeof event.sourceEffectWillResolve!=='boolean'||typeof event.sourceEffectNegated!=='boolean'||
    typeof event.effectActivated!=='boolean'||typeof event.wouldInflictDamage!=='boolean'||
    typeof event.damageAlreadyApplied!=='boolean'||
    !Number.isSafeInteger(event.damageAmount)||event.damageAmount<0){
    throw new Error('Recibo de ativação de dano inválido.');
  }
}
function assertCounterTrapAtResolution(state:TagDuel,event:BarrelDamageActivationEvent):void{
  assertPhysicalUid(state,event.counterTrapUid,'UID da Barrel Behind the Door');
  const matches: {team:RedirectTeam;card:{id:string;uid:string;faceUp?:boolean}}[]=[];
  for(const team of [0,1] as const){
    for(const card of state.core.players[team].backrow){
      if(card.uid===event.counterTrapUid)matches.push({team,card});
    }
  }
  if(matches.length!==1||matches[0].card.id!==BARREL_BEHIND_THE_DOOR_ID||
    matches[0].team!==event.controllerTeam){
    throw new Error('A Counter Trap não corresponde à instância física no backrow do controlador.');
  }
  if(matches[0].card.faceUp!==true)throw new Error('A Counter Trap ainda não está face-up na resolução.');
}

/**
 * Barrel Behind the Door redirects the pending effect damage to the other team.
 * It does not negate the source effect and this adapter does not apply LP.
 * Distinct Counter Trap activations may reference one sourceEffectActivationId;
 * the chain resolver must still apply that source effect's damage exactly once.
 */
export function createBarrelRedirectLedger():BarrelRedirectLedger{
  return {version:1,processedActivationIds:[]};
}
export function resolveBarrelBehindTheDoor(
  state:TagDuel,
  ledger:BarrelRedirectLedger,
  event:BarrelDamageActivationEvent
):BarrelRedirectResolution{
  assertLedger(ledger);assertEvent(event);
  if(ledger.processedActivationIds.includes(event.activationId)){
    return {status:'duplicate',ledger};
  }
  assertClassicTag(state);assertLpSnapshot(state,event.currentLPByTeam);
  assertPhysicalUid(state,event.sourceUid,'UID da carta que causaria dano');
  const next=nextLedger(ledger,event.activationId);
  if(!event.wasSetFaceDown||event.controllerTeam!==event.originalTargetTeam){
    return {status:'not-applicable',ledger:next};
  }
  if(!event.effectActivated||!event.wouldInflictDamage||event.damageAmount===0||
    !event.counterTrapResolved||event.counterTrapNegated||
    !event.sourceEffectWillResolve||event.sourceEffectNegated){
    return {status:'no-damage',ledger:next};
  }
  if(event.damageAlreadyApplied)throw new Error('Dano de origem já aplicado; redirecionamento duplicaria LP.');
  assertCounterTrapAtResolution(state,event);
  return {
    status:'redirected',
    ledger:next,
    plan:{
      activationId:event.activationId,
      sourceEffectActivationId:event.sourceEffectActivationId,
      sourceEffectChainLinkId:event.sourceEffectChainLinkId,
      counterTrapUid:event.counterTrapUid,
      counterTrapCardId:BARREL_BEHIND_THE_DOOR_ID,
      controllerTeam:event.controllerTeam,
      originalTargetTeam:event.originalTargetTeam,
      redirectedTargetTeam:(1-event.controllerTeam) as RedirectTeam,
      amount:event.damageAmount,
      reason:'barrel-behind-the-door-redirection'
    }
  };
}
