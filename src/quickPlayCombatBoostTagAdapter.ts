import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';
import {addTemporaryModifier,canAffectMonster,syncContinuous} from './continuousEffects';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
import {getDuelCard} from './effectRegistry';

export const RUSH_RECKLESSLY_ID='70046172';
export const RELIABLE_GUARDIAN_ID='16430187';

type Team=0|1;
type Stat='atk'|'def';
type SourceLocation='hand'|'backrow';
type Phase='main'|'battle'|'response';
type CardRule={stat:Stat;amount:700};
const CARD_RULES:Record<string,CardRule>={
  [RUSH_RECKLESSLY_ID]:{stat:'atk',amount:700},
  [RELIABLE_GUARDIAN_ID]:{stat:'def',amount:700}
};

export type QuickPlayCombatBoostTagDuel=TagDuel&{
  quickPlayBoostActivationIds?:string[];
  quickPlayBoostPending?:QuickPlayBoostPlan[];
  quickPlayBoostResolvedIds?:string[];
};
export type QuickPlayBoostEvent={
  activationId:string;
  actorSeat:number;
  sourceUid:string;
  targetUid:string;
};
export type QuickPlayBoostPlan=QuickPlayBoostEvent&{
  cardId:string;
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceLocation:SourceLocation;
  sourceSetTurn:number|null;
  targetBinding:TargetBinding;
  stat:Stat;
  amount:700;
  turn:number;
  activationPhase:Phase;
  activationCurrent:Team;
  damageStep:boolean;
  attackStage:'declare'|'damage'|'calculation'|null;
};
export type QuickPlayBoostActivation={
  status:'activated';
  state:QuickPlayCombatBoostTagDuel;
  plan:QuickPlayBoostPlan;
};
export type QuickPlayBoostResolution={
  status:'resolved'|'negated'|'duplicate';
  applied:boolean;
  state:QuickPlayCombatBoostTagDuel;
  activationId:string;
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(value:unknown):value is Team{return value===0||value===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:QuickPlayCombatBoostTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:QuickPlayCombatBoostTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(item=>item.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:QuickPlayCombatBoostTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('O modificador alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('O modificador alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:QuickPlayCombatBoostTagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extraCounts=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){
      extra.add(card.uid);
      extraCounts[physicalSeat(card.uid)]++;
    }
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^[0-3]$/.test(seat))throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extraCounts[physicalSeat(card.uid)]++;
    }
  }
  const mainCounts=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))mainCounts[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(mainCounts[seat]<20||mainCounts[seat]>30){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(extraCounts[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // A Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:QuickPlayCombatBoostTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/Deck físico do participante não está disponível.');
  return held;
}
function findMonster(duel:QuickPlayCombatBoostTagDuel,uid:string){
  for(let team=0;team<duel.core.players.length;team++){
    const monster=duel.core.players[team].monsters.find(item=>item.uid===uid);
    if(monster)return {team,monster};
  }
}
function locateSource(
  duel:QuickPlayCombatBoostTagDuel,actorSeat:number,sourceUid:string
):{location:SourceLocation;ownerSeat:number;setTurn:number|null;cardId:string}{
  const team=(actorSeat%2) as Team,holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&!!CARD_RULES[card.id]);
  const ownField=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&!!CARD_RULES[card.id]);
  const opposingField=duel.core.players[1-team].backrow.find(card=>card.uid===sourceUid&&!!CARD_RULES[card.id]);
  if(opposingField)throw new Error('A Quick-Play Spell está na backrow adversária.');
  if(hand&&ownField)throw new Error('A Quick-Play Spell aparece em duas zonas.');
  if(hand){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat!==actorSeat)throw new Error('A Quick-Play Spell na mão deve pertencer ao assento ativo.');
    return {location:'hand',ownerSeat,setTurn:null,cardId:hand.id};
  }
  if(ownField){
    if(ownField.faceUp)throw new Error('A Quick-Play Spell já está com a face para cima.');
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('A Quick-Play Spell preparada pertence à equipe adversária.');
    if(!Number.isInteger(ownField.setTurn))throw new Error('Turno de preparação da Quick-Play Spell inválido.');
    return {location:'backrow',ownerSeat,setTurn:ownField.setTurn,cardId:ownField.id};
  }
  throw new Error('A Quick-Play Spell não está na mão física ativa nem na backrow compartilhada da equipe.');
}
/** Stat-modifying Quick-Play Spells may respond in the Damage Step before damage calculation. */
function activationWindow(duel:QuickPlayCombatBoostTagDuel,team:Team,location:SourceLocation):boolean{
  const core=duel.core;
  if(core.priority!==team||core.turnEnding||core.choice)return false;
  const ownOpen=core.current===team&&
    (core.phase==='main'||core.phase==='battle')&&
    core.pending.kind==='none'&&core.chain.length===0;
  const response=core.phase==='response'&&core.chain.length>0;
  const damageStep=core.damageStep===true&&
    (core.phase==='battle'||core.phase==='response')&&
    core.pending.kind==='attack'&&core.pending.stage==='damage';
  const open=ownOpen||response||damageStep;
  return location==='hand'?core.current===team&&open:open;
}
function samePlan(a:QuickPlayBoostPlan,b:QuickPlayBoostPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.sourceUid===b.sourceUid&&a.targetUid===b.targetUid&&a.cardId===b.cardId&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceLocation===b.sourceLocation&&a.sourceSetTurn===b.sourceSetTurn&&
    a.targetBinding.uid===b.targetBinding.uid&&a.targetBinding.zone===b.targetBinding.zone&&
    a.targetBinding.epoch===b.targetBinding.epoch&&a.stat===b.stat&&a.amount===b.amount&&
    a.turn===b.turn&&a.activationPhase===b.activationPhase&&
    a.activationCurrent===b.activationCurrent&&a.damageStep===b.damageStep&&
    a.attackStage===b.attackStage;
}
function assertPlanBase(input:QuickPlayCombatBoostTagDuel,plan:QuickPlayBoostPlan):void{
  const rule=plan&&CARD_RULES[plan.cardId];
  if(!plan||!validActivationId(plan.activationId)||!Number.isInteger(plan.actorSeat)||
    plan.actorSeat<0||plan.actorSeat>3||!validTeam(plan.actorTeam)||
    plan.actorTeam!==plan.actorSeat%2||plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    typeof plan.targetUid!=='string'||!plan.targetUid||
    plan.targetBinding.uid!==plan.targetUid||plan.targetBinding.zone!=='monsters'||
    !Number.isSafeInteger(plan.targetBinding.epoch)||plan.targetBinding.epoch<0||
    !rule||plan.stat!==rule.stat||plan.amount!==rule.amount||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    !['main','battle','response'].includes(plan.activationPhase)||
    !validTeam(plan.activationCurrent)||typeof plan.damageStep!=='boolean'||
    !(plan.attackStage===null||plan.attackStage==='declare'||plan.attackStage==='damage'||plan.attackStage==='calculation')||
    input.active[plan.actorTeam]!==plan.actorSeat||
    !(input.quickPlayBoostActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Quick-Play Combat Boost obsoleto ou inválido.');
  }
}
function sendSourceToOriginalOwnerGrave(duel:QuickPlayCombatBoostTagDuel,plan:QuickPlayBoostPlan):void{
  const ownerTeam=(plan.sourceOwnerSeat%2) as Team;
  const field=duel.core.players[plan.actorTeam].backrow;
  const index=field.findIndex(card=>card.uid===plan.sourceUid&&card.id===plan.cardId);
  if(index>=0){
    const [source]=field.splice(index,1);
    duel.core.players[ownerTeam].grave.push(source);
    return;
  }
  if(duel.core.players[ownerTeam].grave.some(card=>card.uid===plan.sourceUid))return;
  if(duel.core.players[1-ownerTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('A Quick-Play Spell foi enviada ao Cemitério da equipe errada.');
  }
  throw new Error('A Quick-Play Spell não está no campo controlado nem no Cemitério do proprietário original.');
}

export function activateQuickPlayCombatBoost(
  input:QuickPlayCombatBoostTagDuel,event:QuickPlayBoostEvent
):QuickPlayBoostActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||typeof event.sourceUid!=='string'||
    typeof event.targetUid!=='string'||!event.targetUid||
    !Number.isInteger(event.actorSeat)||event.actorSeat<0||event.actorSeat>3){
    throw new Error('Evento de Quick-Play Combat Boost inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.active[actorTeam]!==event.actorSeat){
    throw new Error('Somente o assento físico ativo da equipe pode ativar a Quick-Play Spell.');
  }
  if((input.quickPlayBoostActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Quick-Play Combat Boost já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.ownerSeat%2!==actorTeam)throw new Error('A carta pertence à equipe errada.');
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Quick-Play Spell.');
  }
  if(source.location==='backrow'&&(source.setTurn===null||source.setTurn>=input.core.turn)){
    throw new Error('Quick-Play Spell baixada só pode ser ativada em um turno posterior ao de sua preparação.');
  }
  if(!activationWindow(input,actorTeam,source.location)){
    throw new Error('Quick-Play Spell exige prioridade legal; na mão, somente no próprio turno.');
  }
  const target=findMonster(input,event.targetUid);
  if(!target||!target.monster.faceUp||getDuelCard(target.monster.id)?.kind!=='monster'){
    throw new Error('O alvo deve ser um monstro face-up no campo.');
  }
  const next=structuredClone(input) as QuickPlayCombatBoostTagDuel;
  const binding=bindTarget(next.core,event.targetUid);
  if(!binding||binding.zone!=='monsters'){
    throw new Error('O alvo deixou o campo antes do registro da ativação.');
  }
  const rule=CARD_RULES[source.cardId];
  const plan:QuickPlayBoostPlan=Object.freeze({
    ...event,cardId:source.cardId,actorTeam,sourceOwnerSeat:source.ownerSeat,
    sourceLocation:source.location,sourceSetTurn:source.setTurn,
    targetBinding:Object.freeze({...binding,zone:'monsters' as const}),stat:rule.stat,amount:rule.amount,
    turn:next.core.turn,activationPhase:next.core.phase as Phase,
    activationCurrent:next.core.current as Team,damageStep:next.core.damageStep===true,
    attackStage:next.core.pending.kind==='attack'?next.core.pending.stage:null
  });
  next.quickPlayBoostActivationIds=[...(next.quickPlayBoostActivationIds??[]),event.activationId];
  next.quickPlayBoostPending=[...(next.quickPlayBoostPending??[]),plan];
  if(source.location==='hand'){
    const holder=physicalHolder(next,event.actorSeat);
    const index=holder.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===source.cardId);
    if(index<0)throw new Error('A Quick-Play Spell saiu da mão durante a ativação.');
    const [card]=holder.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('A Quick-Play Spell saiu da backrow durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

export function resolveQuickPlayCombatBoost(
  input:QuickPlayCombatBoostTagDuel,plan:QuickPlayBoostPlan,effectNegated=false
):QuickPlayBoostResolution{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean')throw new Error('Estado de negação da Quick-Play Spell inválido.');
  const resolved=input.quickPlayBoostResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return {status:'duplicate',applied:false,state:input,activationId:plan.activationId};
  }
  const stored=(input.quickPlayBoostPending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan)){
    throw new Error('Plano de Quick-Play Combat Boost não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as QuickPlayCombatBoostTagDuel;
  let applied=false;
  if(!effectNegated&&targetBindingValid(next.core,plan.targetBinding)){
    const target=findMonster(next,plan.targetUid);
    if(target?.monster.faceUp&&canAffectMonster(next.core,plan.targetUid,'spell')){
      addTemporaryModifier(
        next.core,plan.targetUid,
        plan.stat==='atk'?plan.amount:0,
        plan.stat==='def'?plan.amount:0
      );
      syncContinuous(next.core);
      applied=true;
    }
  }
  sendSourceToOriginalOwnerGrave(next,plan);
  next.quickPlayBoostPending=(next.quickPlayBoostPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.quickPlayBoostResolvedIds=[...resolved,plan.activationId];
  assertSameInventory(before,next);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Quick-Play Combat Boost publicou identidades no log do duelo.');
  }
  return {status:effectNegated?'negated':'resolved',applied,state:next,activationId:plan.activationId};
}
