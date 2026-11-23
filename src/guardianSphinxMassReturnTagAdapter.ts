import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {tagInventory,type TagDuel} from './tagDuel';
import {
  GUARDIAN_SPHINX_ID,planSelfSet,resolveSelfSet,
  type FlipCycleCardLookup,type FlipCycleState,type FlipSummonEvent,type SelfSetPlan
} from './flipCycleTagAdapter';

export {GUARDIAN_SPHINX_ID};
export type GuardianSphinxState=FlipCycleState;
export type GuardianSphinxLookup=FlipCycleCardLookup;
export type GuardianSphinxPlan={
  kind:'guardian-sphinx-return-all';
  sourceUid:string;
  sourceOwnerSeat:number;
  controllerTeam:0|1;
  activeSeat:number;
  turn:number;
  targeting:false;
};
type OwnerHand={seat:number;team:0|1;hand:CardRefLike[]};
type CardRefLike={uid:string;id:string;entityKind?:'token'};

const defaultLookup:GuardianSphinxLookup=id=>getPlayableCard(id);

function assertState(state:GuardianSphinxState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||!Array.isArray(state.active)||state.active.length!==2||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.core.players.some(player=>!Array.isArray(player.monsters)||player.monsters.length>3))
    throw Error('Estado TagDuel clássico/rotação inválido para Guardian Sphinx.');
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID sem proprietário físico válido.');
  return Number(match[1]);
}
function inventorySnapshot(state:GuardianSphinxState):string{
  // Tokens disappear when they leave the field; they are not physical inventory.
  const cards=tagInventory(state).filter(card=>card.entityKind!=='token');
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado no estado TagDuel.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,state:GuardianSphinxState):void{
  if(inventorySnapshot(state)!==before)throw Error('O retorno em massa alterou o inventário físico.');
}
function ownerHand(state:GuardianSphinxState,uid:string):OwnerHand{
  const seat=physicalSeat(uid);
  const team=state.members[seat]?.team;
  if(team!==seat%2)throw Error('Proprietário físico do monstro inválido.');
  if(state.active[team]===seat){
    const hand=state.core.players[team].hand;
    if(!Array.isArray(hand))throw Error('Mão do representante ativo ausente.');
    return {seat,team,hand};
  }
  const reserve=state.reserves[String(seat)];
  if(!reserve||!Array.isArray(reserve.hand))throw Error('Reserva física do parceiro inativo ausente.');
  return {seat,team,hand:reserve.hand};
}
function guardianSource(state:GuardianSphinxState,uid:string,lookup:GuardianSphinxLookup){
  assertState(state);
  const ownerSeat=physicalSeat(uid);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)throw Error('Proprietário físico da fonte Guardian Sphinx inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters.filter(monster=>monster.uid===uid).map(monster=>({monster,team:team as 0|1})));
  if(matches.length!==1)throw Error('Guardian Sphinx deve ocupar uma única Zona de Monstro.');
  const {monster,team}=matches[0];
  if(monster.id!==GUARDIAN_SPHINX_ID)throw Error('A fonte não é Guardian Sphinx.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')throw Error('Guardian Sphinx não está admitido como monstro de efeito.');
  if(!monster.faceUp)throw Error('Guardian Sphinx precisa estar face-up após Flip Summon.');
  return {monster,ownerSeat,controllerTeam:team,activeSeat:state.active[team]};
}

/** Reuses M550's durable per-UID/epoch Main Phase self-set marker. */
export function planGuardianSphinxSelfSet(
  state:GuardianSphinxState,sourceUid:string,lookup:GuardianSphinxLookup=defaultLookup
):SelfSetPlan{return planSelfSet(state,sourceUid,lookup);}
export function resolveGuardianSphinxSelfSet(
  state:GuardianSphinxState,plan:SelfSetPlan,effectNegated=false
){return resolveSelfSet(state,plan,effectNegated);}

/** The plan intentionally contains no targets; all opposing monsters are read at resolution. */
export function planGuardianSphinxFlipSummon(
  state:GuardianSphinxState,event:FlipSummonEvent,sourceUid:string,lookup:GuardianSphinxLookup=defaultLookup
):GuardianSphinxPlan{
  if(!event||event.kind!=='flip-summon'||event.sourceUid!==sourceUid||event.turn!==state.core.turn||
    event.summonType!=='flip'||event.previousFaceUp!==false||event.faceUp!==true)
    throw Error('Guardian Sphinx exige uma Invocação-Virar real.');
  const source=guardianSource(state,sourceUid,lookup);
  if(state.core.current!==source.controllerTeam)throw Error('Guardian Sphinx não pertence à equipe ativa.');
  return {kind:'guardian-sphinx-return-all',sourceUid,sourceOwnerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,activeSeat:source.activeSeat,turn:state.core.turn,targeting:false};
}

/** Returns every monster currently on the opposing side to its physical owner's hand. */
export function resolveGuardianSphinxFlipSummon(
  input:GuardianSphinxState,plan:GuardianSphinxPlan,effectNegated=false
):{status:'resolved'|'negated';state:GuardianSphinxState;returnedUids:string[];removedTokenUids:string[];affectedCount:number;handLimitDeferredSeats:number[]}{
  assertState(input);
  if(!plan||plan.kind!=='guardian-sphinx-return-all'||plan.targeting!==false||plan.turn!==input.core.turn||
    plan.controllerTeam!==input.core.current||input.active[plan.controllerTeam]!==plan.activeSeat||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid))
    throw Error('Plano Guardian Sphinx obsoleto ou inválido.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as GuardianSphinxState;
  if(effectNegated){assertConserved(before,next);return {status:'negated',state:next,returnedUids:[],removedTokenUids:[],affectedCount:0,handLimitDeferredSeats:[]};}

  const opponentTeam=(1-plan.controllerTeam) as 0|1;
  const targets=[...next.core.players[opponentTeam].monsters];
  const targetUids=targets.map(monster=>monster.uid);
  if(new Set(targetUids).size!==targetUids.length)throw Error('Monstro adversário duplicado.');
  const routes=targets.map(monster=>monster.entityKind==='token'?null:ownerHand(next,monster.uid));
  const returnedUids:string[]=[];
  const removedTokenUids:string[]=[];
  const deferred=new Set<number>();

  // Validate every destination before changing any zone; no partial return on malformed data.
  next.core.players[opponentTeam].monsters=[];
  for(let i=0;i<targets.length;i++){
    const monster=targets[i];
    if(monster.entityKind==='token'){
      removedTokenUids.push(monster.uid);
      if(next.core.cardLifetimes)delete next.core.cardLifetimes[monster.uid];
      continue;
    }
    const route=routes[i]!;
    route.hand.push({uid:monster.uid,id:monster.id});
    returnedUids.push(monster.uid);
    const lifetimes=next.core.cardLifetimes??={};
    const previous=lifetimes[monster.uid];
    lifetimes[monster.uid]={zone:'hand',epoch:(previous?.epoch??0)+1};
    if(route.hand.length>6)deferred.add(route.seat);
  }
  next.core.teamRotation.reserves=next.reserves;
  assertConserved(before,next);
  return {status:'resolved',state:next,returnedUids,removedTokenUids,affectedCount:targets.length,handLimitDeferredSeats:[...deferred].sort((a,b)=>a-b)};
}
