import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {tagInventory,type TagDuel} from './tagDuel';

export const STEALTH_BIRD_ID='03510565';
export const DES_LACOODA_ID='02326738';

export type FlipCycleState=TagDuel&{
  /** Durable, JSON-serialized once-per-turn use markers, keyed by physical UID + zone epoch. */
  flipCycleUses?:{selfSetUsedTurnByInstance:Record<string,number>};
};
export type FlipCycleCardLookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
export type FlipSummonEvent={
  kind:'flip-summon';
  sourceUid:string;
  turn:number;
  summonType:'flip';
  previousFaceUp:false;
  faceUp:true;
};
export type FlipSummonPlan={
  kind:'flip-summon';
  sourceUid:string;
  cardId:typeof STEALTH_BIRD_ID|typeof DES_LACOODA_ID;
  ownerSeat:number;
  controllerTeam:0|1;
  activeSeat:number;
  turn:number;
  outcome:'burn'|'draw';
  amount:1000|1;
};
export type SelfSetPlan={
  kind:'self-set';
  sourceUid:string;
  cardId:typeof STEALTH_BIRD_ID|typeof DES_LACOODA_ID;
  controllerTeam:0|1;
  activeSeat:number;
  turn:number;
  instanceKey:string;
};
type SourceContext={monster:TagDuel['core']['players'][number]['monsters'][number];ownerSeat:number;controllerTeam:0|1;activeSeat:number;instanceKey:string};

const cardIds=new Set<string>([STEALTH_BIRD_ID,DES_LACOODA_ID]);
const cardLookup:FlipCycleCardLookup=(id)=>getPlayableCard(id);

function assertState(state:FlipCycleState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||!Array.isArray(state.active)||state.active.length!==2||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.core.players.some(p=>!Array.isArray(p.monsters)||p.monsters.length>3))
    throw Error('Estado TagDuel clássico/rotação inválido para o ciclo FLIP.');
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID sem proprietário físico válido.');
  return Number(match[1]);
}
function epochFor(state:FlipCycleState,uid:string):number{
  const lifetime=state.core.cardLifetimes?.[uid];
  if(lifetime&&lifetime.zone!=='monsters')throw Error('A instância FLIP não está na Monster Zone.');
  return lifetime?.epoch??0;
}
function sourceContext(state:FlipCycleState,uid:string,lookup:FlipCycleCardLookup):SourceContext{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte FLIP ausente.');
  const ownerSeat=physicalSeat(uid);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)throw Error('Proprietário físico da fonte FLIP inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters.filter(monster=>monster.uid===uid).map(monster=>({monster,team:team as 0|1})));
  if(matches.length!==1)throw Error('A fonte FLIP deve ocupar uma única Zona de Monstro.');
  const {monster,team}=matches[0];
  if(!cardIds.has(monster.id))throw Error('A carta não pertence à família flip-cycle M60.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')throw Error('Definição de monstro de efeito não admitida.');
  if(!monster.faceUp)throw Error('A fonte FLIP precisa estar com a face para cima.');
  const epoch=epochFor(state,uid);
  return {monster,ownerSeat,controllerTeam:team,activeSeat:state.active[team],instanceKey:uid+'@'+epoch};
}
function inventorySnapshot(state:FlipCycleState):string{
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado no estado TagDuel.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:FlipCycleState):void{
  if(inventorySnapshot(after)!==before)throw Error('A resolução FLIP alterou o inventário físico.');
}
function finish(state:TagDuel['core'],winner:number|null,reason:string):void{
  state.phase='finished';
  state.winner=winner===null?null:state.players[winner].id;
  state.reason=reason;
  state.pending={kind:'none'};
  state.chain=[];
  delete state.choice;
  delete state.handFlow;
  delete state.triggerBuild;
  delete state.chainRoot;
  delete state.graveTriggers;
  delete state.summonTriggers;
  delete state.battleFlip;
  delete state.damageStep;
  state.log=[...state.log,reason].slice(-12);
}
function checkLP(state:TagDuel['core']):void{
  if(state.players.every(player=>player.lp<=0))finish(state,null,'pontos de vida');
  else if(state.players[0].lp<=0)finish(state,1,'pontos de vida');
  else if(state.players[1].lp<=0)finish(state,0,'pontos de vida');
}

/** Flip Summon trigger only. A normal summon or an effect-flip is not enough. */
export function planFlipSummon(
  state:FlipCycleState,
  event:FlipSummonEvent,
  sourceUid:string,
  lookup:FlipCycleCardLookup=cardLookup
):FlipSummonPlan{
  if(!event||event.kind!=='flip-summon'||event.sourceUid!==sourceUid||event.turn!==state.core.turn||
    event.summonType!=='flip'||event.previousFaceUp!==false||event.faceUp!==true)
    throw Error('O gatilho M60 exige uma Invocação-Virar real.');
  const source=sourceContext(state,sourceUid,lookup);
  if(state.core.current!==source.controllerTeam)throw Error('A Invocação-Virar não pertence à equipe ativa.');
  const isStealthBird=source.monster.id===STEALTH_BIRD_ID;
  return {
    kind:'flip-summon',sourceUid,cardId:source.monster.id as FlipSummonPlan['cardId'],
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,activeSeat:source.activeSeat,
    turn:state.core.turn,outcome:isStealthBird?'burn':'draw',amount:isStealthBird?1000:1
  };
}

/** Resolve the stored trigger plan. Source removal after activation does not erase its trigger. */
export function resolveFlipSummon(
  input:FlipCycleState,
  plan:FlipSummonPlan,
  effectNegated=false
):{status:'resolved'|'negated';state:FlipCycleState;drawnUid?:string;damage?:number;handLimitDeferred?:boolean}{
  assertState(input);
  if(!plan||plan.kind!=='flip-summon'||plan.turn!==input.core.turn||plan.controllerTeam!==input.core.current||
    input.active[plan.controllerTeam]!==plan.activeSeat||
    (plan.cardId===STEALTH_BIRD_ID&&(plan.outcome!=='burn'||plan.amount!==1000))||
    (plan.cardId===DES_LACOODA_ID&&(plan.outcome!=='draw'||plan.amount!==1))||
    !cardIds.has(plan.cardId))
    throw Error('Plano de Invocação-Virar obsoleto ou inválido.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as FlipCycleState;
  if(effectNegated){assertConserved(before,next);return {status:'negated',state:next};}
  if(plan.outcome==='burn'){
    next.core.players[1-plan.controllerTeam].lp-=1000;
    checkLP(next.core);
    assertConserved(before,next);
    return {status:'resolved',state:next,damage:1000};
  }
  const player=next.core.players[plan.controllerTeam];
  if(!player.deck.length){
    finish(next.core,1-plan.controllerTeam,'não conseguiu comprar uma carta');
    assertConserved(before,next);
    return {status:'resolved',state:next,handLimitDeferred:false};
  }
  const drawn=player.deck.shift()!;
  player.hand.push(drawn);
  assertConserved(before,next);
  return {status:'resolved',state:next,drawnUid:drawn.uid,handLimitDeferred:player.hand.length>6};
}

/** Manual ignition effect: only the current controller may self-set during Main Phase. */
export function planSelfSet(
  state:FlipCycleState,
  sourceUid:string,
  lookup:FlipCycleCardLookup=cardLookup
):SelfSetPlan{
  const source=sourceContext(state,sourceUid,lookup);
  if(state.core.phase!=='main'||state.core.current!==source.controllerTeam||state.core.pending.kind!=='none'||
    state.core.chain.length>0||state.core.choice)
    throw Error('O auto-set FLIP só pode ser ativado na Fase Principal sem cadeia pendente.');
  const used=state.flipCycleUses?.selfSetUsedTurnByInstance?.[source.instanceKey];
  if(used===state.core.turn)throw Error('Esta cópia já usou o auto-set neste turno.');
  return {kind:'self-set',sourceUid,cardId:source.monster.id as SelfSetPlan['cardId'],controllerTeam:source.controllerTeam,activeSeat:source.activeSeat,turn:state.core.turn,instanceKey:source.instanceKey};
}

/** The per-instance marker is consumed on activation, including negation or source removal. */
export function resolveSelfSet(
  input:FlipCycleState,
  plan:SelfSetPlan,
  effectNegated=false
):{status:'set-face-down'|'negated'|'source-left-field'|'source-changed';state:FlipCycleState;instanceKey:string}{
  assertState(input);
  if(!plan||plan.kind!=='self-set'||plan.turn!==input.core.turn||plan.controllerTeam!==input.core.current||
    input.active[plan.controllerTeam]!==plan.activeSeat||!cardIds.has(plan.cardId))
    throw Error('Plano de auto-set obsoleto ou inválido.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as FlipCycleState;
  const used={...(next.flipCycleUses?.selfSetUsedTurnByInstance??{})};
  if(used[plan.instanceKey]===plan.turn)throw Error('Esta cópia já consumiu o auto-set neste turno.');
  used[plan.instanceKey]=plan.turn;
  next.flipCycleUses={selfSetUsedTurnByInstance:used};
  if(effectNegated){assertConserved(before,next);return {status:'negated',state:next,instanceKey:plan.instanceKey};}
  const matches=next.core.players.flatMap((player,team)=>player.monsters.filter(monster=>monster.uid===plan.sourceUid).map(monster=>({monster,team:team as 0|1})));
  if(matches.length===0){assertConserved(before,next);return {status:'source-left-field',state:next,instanceKey:plan.instanceKey};}
  if(matches.length!==1){throw Error('A fonte FLIP deve ocupar uma única Zona de Monstro.');}
  const {monster,team}=matches[0];
  const epoch=next.core.cardLifetimes?.[plan.sourceUid]?.epoch??0;
  if(team!==plan.controllerTeam||monster.id!==plan.cardId||!monster.faceUp||plan.sourceUid+'@'+epoch!==plan.instanceKey){
    assertConserved(before,next);return {status:'source-changed',state:next,instanceKey:plan.instanceKey};
  }
  monster.position='def';
  monster.faceUp=false;
  monster.changed=next.core.turn;
  assertConserved(before,next);
  return {status:'set-face-down',state:next,instanceKey:plan.instanceKey};
}
