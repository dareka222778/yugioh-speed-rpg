import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import type {CardRef,Monster} from './duelEngine';
import {tagInventory,type TagDuel} from './tagDuel';

export const DARK_MIMIC_LV1_ID='74713514';
export const DARK_MIMIC_LV3_ID='01102515';

type DarkMimicMemory={
  lv1StandbyUsedTurnByInstance:Record<string,number>;
  lv3SummonedByLv1ByInstance:Record<string,true>;
  lv1FlipEvents:Record<string,true>;
  lv3BattleEvents:Record<string,true>;
};
export type DarkMimicState=TagDuel&{darkMimic?:DarkMimicMemory};
export type DarkMimicLookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type Team=0|1;
type SourceContext={monster:Monster;ownerSeat:number;ownerTeam:Team;controllerTeam:Team;activeSeat:number;instanceKey:string};

export type DarkMimicFlipEvent={
  kind:'flip-summon';eventId:string;sourceUid:string;turn:number;
  summonType:'flip';previousFaceUp:false;faceUp:true;
};
export type DarkMimicFlipPlan={
  kind:'dark-mimic-lv1-flip';eventId:string;sourceUid:string;sourceInstanceKey:string;
  ownerSeat:number;controllerTeam:Team;activeSeat:number;turn:number;drawCount:1;
};
export type DarkMimicStandbyPlan={
  kind:'dark-mimic-lv1-standby';sourceUid:string;sourceOwnerSeat:number;sourceOwnerTeam:Team;
  controllerTeam:Team;activeSeat:number;turn:number;sourceInstanceKey:string;
};
export type DarkMimicStandbyResolution={
  kind:'dark-mimic-lv1-standby-resolution';sourceUid:string;sourceOwnerSeat:number;
  sourceOwnerTeam:Team;controllerTeam:Team;activeSeat:number;turn:number;sourceInstanceKey:string;
};
export type DarkMimicBattleEvent={
  kind:'battle-destroyed';eventId:string;sourceUid:string;sourceEpoch:number;turn:number;
  controllerTeam:Team;destroyedByBattle:true;sentToGY:true;
};
export type DarkMimicBattlePlan={
  kind:'dark-mimic-lv3-battle-draw';eventId:string;sourceUid:string;sourceInstanceKey:string;
  sourceOwnerSeat:number;sourceOwnerTeam:Team;controllerTeam:Team;activeSeat:number;
  turn:number;sourceEpoch:number;drawCount:1|2;
};

const defaultLookup:DarkMimicLookup=id=>getPlayableCard(id);
const emptyMemory=():DarkMimicMemory=>({
  lv1StandbyUsedTurnByInstance:{},lv3SummonedByLv1ByInstance:{},lv1FlipEvents:{},lv3BattleEvents:{}
});
function memory(state:DarkMimicState):DarkMimicMemory{
  return state.darkMimic??=(emptyMemory());
}
function teamId(team:Team):string{return 'tag-team-'+String(team);}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:DarkMimicState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core.teamRotation||state.core.turn<1||!Number.isSafeInteger(state.core.turn))
    throw Error('Estado TagDuel inválido para Dark Mimic.');
  if(state.members.some((member,index)=>member.team!==index%2||!member.id)||
    state.core.players.some((player,index)=>player.id!==teamId(index as Team)||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||!Array.isArray(player.monsters)||
      !Array.isArray(player.backrow)||!Array.isArray(player.grave)||player.monsters.length>3||player.backrow.length>3))
    throw Error('Estrutura física de equipes ou limite 3+3 inválido.');
  if(state.core.current!==state.cursor%2||state.active[state.cursor%2]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves))
    throw Error('Rotação/Reservas TagDuel fora de sincronia.');
  const reserveSeats=Object.keys(state.reserves).map(Number);
  if(reserveSeats.length!==2||reserveSeats.some(seat=>!Number.isInteger(seat)||seat<0||seat>3||state.active.includes(seat)))
    throw Error('Reservas físicas inválidas.');
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length||cards.some(card=>!card.uid||!card.id))
    throw Error('Inventário físico duplicado ou incompleto.');
}
function lifetimeEpoch(state:DarkMimicState,uid:string,expectedZone?:string):number{
  const entry=state.core.cardLifetimes?.[uid];
  if(entry&&(!Number.isSafeInteger(entry.epoch)||entry.epoch<0||expectedZone&&entry.zone!==expectedZone))
    throw Error('Época/zona física da carta incompatível.');
  return entry?.epoch??0;
}
function sourceContext(
  state:DarkMimicState,uid:string,expectedId:string,lookup:DarkMimicLookup,requireFaceUp=true
):SourceContext{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte ausente.');
  const ownerSeat=physicalSeat(uid),ownerTeam=(ownerSeat%2) as Team;
  if(state.members[ownerSeat]?.team!==ownerTeam)throw Error('Proprietário físico da fonte inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters
    .filter(monster=>monster.uid===uid).map(monster=>({monster,team:team as Team})));
  if(matches.length!==1)throw Error('A fonte deve ocupar uma única Zona de Monstro.');
  const {monster,team}=matches[0];
  if(monster.id!==expectedId)throw Error('A fonte não corresponde à identidade Dark Mimic esperada.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Dark Mimic não está admitido como monstro de efeito.');
  if(requireFaceUp&&!monster.faceUp)throw Error('A fonte Dark Mimic precisa estar face-up.');
  const epoch=lifetimeEpoch(state,uid,'monsters');
  return {monster,ownerSeat,ownerTeam,controllerTeam:team,activeSeat:state.active[team],instanceKey:uid+'@'+String(epoch)};
}
function inventorySnapshot(state:DarkMimicState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,state:DarkMimicState):void{
  if(inventorySnapshot(state)!==before)throw Error('A resolução Dark Mimic alterou o inventário físico.');
}
function finish(state:TagDuel['core'],winner:Team,reason:string):void{
  state.phase='finished';state.winner=state.players[winner].id;state.reason=reason;
  state.pending={kind:'none'};state.chain=[];delete state.choice;delete state.handFlow;
  delete state.triggerBuild;delete state.chainRoot;delete state.graveTriggers;delete state.summonTriggers;
  delete state.battleFlip;delete state.damageStep;state.log=[...state.log,reason].slice(-12);
}
function drawForTeam(
  state:DarkMimicState,team:Team,count:number
):{drawnUids:string[];deckOut:boolean;handLimitDeferred:boolean}{
  const player=state.core.players[team],drawnUids:string[]=[];
  for(let index=0;index<count;index++){
    if(!player.deck.length){
      finish(state.core,(1-team) as Team,'não conseguiu comprar uma carta');
      return {drawnUids,deckOut:true,handLimitDeferred:player.hand.length>6};
    }
    const card=player.deck.shift()!;
    player.hand.push(card);drawnUids.push(card.uid);
  }
  return {drawnUids,deckOut:false,handLimitDeferred:player.hand.length>6};
}
function validateTeam(team:unknown):asserts team is Team{
  if(team!==0&&team!==1)throw Error('Equipe controladora inválida.');
}

/** FLIP trigger: only a real Flip Summon in Main Phase draws one card. */
export function planDarkMimicLv1Flip(
  state:DarkMimicState,event:DarkMimicFlipEvent,sourceUid:string,lookup:DarkMimicLookup=defaultLookup
):DarkMimicFlipPlan{
  if(!event||event.kind!=='flip-summon'||!event.eventId||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.summonType!=='flip'||event.previousFaceUp!==false||event.faceUp!==true)
    throw Error('Dark Mimic LV1 exige uma Invocação-Virar real.');
  const source=sourceContext(state,sourceUid,DARK_MIMIC_LV1_ID,lookup);
  if(state.core.phase!=='main'||state.core.current!==source.controllerTeam)
    throw Error('A Invocação-Virar de Dark Mimic LV1 exige a Fase Principal da equipe controladora.');
  return {kind:'dark-mimic-lv1-flip',eventId:event.eventId,sourceUid,sourceInstanceKey:source.instanceKey,
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,activeSeat:source.activeSeat,turn:state.core.turn,drawCount:1};
}
export function resolveDarkMimicLv1Flip(
  input:DarkMimicState,plan:DarkMimicFlipPlan,effectNegated=false
):{status:'resolved'|'negated';state:DarkMimicState;drawnUids:string[];deckOut:boolean;handLimitDeferred:boolean}{
  assertState(input);
  validateTeam(plan?.controllerTeam);
  if(!plan||plan.kind!=='dark-mimic-lv1-flip'||plan.drawCount!==1||
    plan.turn!==input.core.turn||plan.controllerTeam!==input.core.current||
    input.active[plan.controllerTeam]!==plan.activeSeat||!plan.eventId)
    throw Error('Plano FLIP de Dark Mimic LV1 obsoleto ou inválido.');
  const next=structuredClone(input) as DarkMimicState,before=inventorySnapshot(input),mem=memory(next);
  if(mem.lv1FlipEvents[plan.eventId])throw Error('Este evento FLIP de Dark Mimic LV1 já foi resolvido.');
  mem.lv1FlipEvents[plan.eventId]=true;
  if(effectNegated){
    assertConserved(before,next);
    return {status:'negated',state:next,drawnUids:[],deckOut:false,handLimitDeferred:false};
  }
  const draw=drawForTeam(next,plan.controllerTeam,1);
  assertConserved(before,next);
  return {status:'resolved',state:next,...draw};
}

/** Optional Standby ignition. The LV3 is selected at resolution, not targeted at activation. */
export function planDarkMimicLv1Standby(
  state:DarkMimicState,sourceUid:string,lookup:DarkMimicLookup=defaultLookup
):DarkMimicStandbyPlan{
  const source=sourceContext(state,sourceUid,DARK_MIMIC_LV1_ID,lookup);
  const team=source.controllerTeam,player=state.core.players[team];
  if(state.core.phase!=='standby'||state.core.current!==team||state.core.pending.kind!=='none'||
    state.core.chain.length>0||state.core.choice)
    throw Error('O efeito de Standby de Dark Mimic LV1 exige a Fase de Apoio sem cadeia pendente.');
  if(player.monsters.length>=3)
    throw Error('Não há Zona de Monstro livre para a Invocação-Especial.');
  const targetMetadata=lookup(DARK_MIMIC_LV3_ID);
  if(!targetMetadata||targetMetadata.kind!=='monster'||targetMetadata.monsterType!=='effect')
    throw Error('Dark Mimic LV3 não está admitido como monstro de efeito.');
  if(![...player.hand,...player.deck].some(card=>card.id===DARK_MIMIC_LV3_ID))
    throw Error('Não há Dark Mimic LV3 na mão/Deck do representante ativo.');
  if(state.darkMimic?.lv1StandbyUsedTurnByInstance?.[source.instanceKey]===state.core.turn)
    throw Error('Esta cópia de Dark Mimic LV1 já usou o efeito de Standby neste turno.');
  return {kind:'dark-mimic-lv1-standby',sourceUid,sourceOwnerSeat:source.ownerSeat,
    sourceOwnerTeam:source.ownerTeam,controllerTeam:team,activeSeat:source.activeSeat,
    turn:state.core.turn,sourceInstanceKey:source.instanceKey};
}

/** Pays the send-to-GY cost and consumes this physical instance's once-per-turn use. */
export function payDarkMimicLv1StandbyCost(
  input:DarkMimicState,plan:DarkMimicStandbyPlan,lookup:DarkMimicLookup=defaultLookup
):{state:DarkMimicState;resolutionPlan:DarkMimicStandbyResolution}{
  assertState(input);
  validateTeam(plan?.controllerTeam);
  if(!plan||plan.kind!=='dark-mimic-lv1-standby'||plan.turn!==input.core.turn||
    input.core.current!==plan.controllerTeam||input.active[plan.controllerTeam]!==plan.activeSeat||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||plan.sourceOwnerTeam!==plan.sourceOwnerSeat%2)
    throw Error('Plano de Standby Dark Mimic LV1 obsoleto ou inválido.');
  const next=structuredClone(input) as DarkMimicState,before=inventorySnapshot(input);
  const source=sourceContext(next,plan.sourceUid,DARK_MIMIC_LV1_ID,lookup);
  if(source.controllerTeam!==plan.controllerTeam||source.instanceKey!==plan.sourceInstanceKey||
    source.ownerSeat!==plan.sourceOwnerSeat)
    throw Error('A instância de Dark Mimic LV1 mudou antes do pagamento do custo.');
  const used=memory(next).lv1StandbyUsedTurnByInstance;
  if(used[plan.sourceInstanceKey]===plan.turn)throw Error('O efeito de Standby desta instância já foi usado.');
  const field=next.core.players[plan.controllerTeam].monsters;
  const index=field.findIndex(monster=>monster.uid===plan.sourceUid);
  if(index<0)throw Error('Dark Mimic LV1 deixou a Zona de Monstro antes do custo.');
  const [removed]=field.splice(index,1);
  next.core.players[plan.sourceOwnerTeam].grave.push({uid:removed.uid,id:removed.id} as CardRef);
  const oldEpoch=next.core.cardLifetimes?.[removed.uid]?.epoch??0;
  next.core.cardLifetimes??={};
  next.core.cardLifetimes[removed.uid]={zone:'grave',epoch:oldEpoch+1};
  used[plan.sourceInstanceKey]=plan.turn;
  assertConserved(before,next);
  return {state:next,resolutionPlan:{kind:'dark-mimic-lv1-standby-resolution',
    sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,sourceOwnerTeam:plan.sourceOwnerTeam,
    controllerTeam:plan.controllerTeam,activeSeat:plan.activeSeat,turn:plan.turn,sourceInstanceKey:plan.sourceInstanceKey}};
}

/** Resolves the non-targeting LV3 summon from the active physical player's hand or Deck. */
export function resolveDarkMimicLv1Standby(
  input:DarkMimicState,plan:DarkMimicStandbyResolution,
  options:{targetUid?:string;effectNegated?:boolean}={}
):{status:'summoned'|'negated'|'no-target'|'no-zone';state:DarkMimicState;summonedUid?:string;handLimitDeferred:false}{
  assertState(input);
  validateTeam(plan?.controllerTeam);
  if(!plan||plan.kind!=='dark-mimic-lv1-standby-resolution'||plan.turn!==input.core.turn||
    input.core.current!==plan.controllerTeam||input.active[plan.controllerTeam]!==plan.activeSeat||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||plan.sourceOwnerTeam!==plan.sourceOwnerSeat%2)
    throw Error('Resolução de Standby Dark Mimic LV1 obsoleta ou inválida.');
  const next=structuredClone(input) as DarkMimicState,before=inventorySnapshot(input);
  if(options.effectNegated){
    assertConserved(before,next);
    return {status:'negated',state:next,handLimitDeferred:false};
  }
  const player=next.core.players[plan.controllerTeam];
  if(player.monsters.length>=3){
    assertConserved(before,next);
    return {status:'no-zone',state:next,handLimitDeferred:false};
  }
  const uid=options.targetUid;
  if(!uid||physicalSeat(uid)!==plan.activeSeat){
    assertConserved(before,next);
    return {status:'no-target',state:next,handLimitDeferred:false};
  }
  let card:CardRef|undefined;
  const deckIndex=player.deck.findIndex(item=>item.uid===uid&&item.id===DARK_MIMIC_LV3_ID);
  if(deckIndex>=0)card=player.deck.splice(deckIndex,1)[0];
  else{
    const handIndex=player.hand.findIndex(item=>item.uid===uid&&item.id===DARK_MIMIC_LV3_ID);
    if(handIndex>=0)card=player.hand.splice(handIndex,1)[0];
  }
  if(!card){
    assertConserved(before,next);
    return {status:'no-target',state:next,handLimitDeferred:false};
  }
  const previous=next.core.cardLifetimes?.[uid];
  const epoch=previous?(previous.zone==='monsters'?previous.epoch:previous.epoch+1):0;
  next.core.cardLifetimes??={};
  next.core.cardLifetimes[uid]={zone:'monsters',epoch};
  const monster:Monster={uid:card.uid,id:card.id,position:'atk',faceUp:true,entered:plan.turn,
    lastSummonedTurn:plan.turn,changed:plan.turn,attacked:0,atkBoost:0,defBoost:0};
  player.monsters.push(monster);
  memory(next).lv3SummonedByLv1ByInstance[uid+'@'+String(epoch)]=true;
  assertConserved(before,next);
  return {status:'summoned',state:next,summonedUid:uid,handLimitDeferred:false};
}

/** Trigger after LV3 was destroyed by battle and sent to its owner's Graveyard. */
export function planDarkMimicLv3BattleDraw(
  state:DarkMimicState,event:DarkMimicBattleEvent,lookup:DarkMimicLookup=defaultLookup
):DarkMimicBattlePlan{
  assertState(state);
  if(!event||event.kind!=='battle-destroyed'||!event.eventId||!event.sourceUid||
    event.turn!==state.core.turn||!Number.isSafeInteger(event.sourceEpoch)||event.sourceEpoch<0||
    event.destroyedByBattle!==true||event.sentToGY!==true)
    throw Error('Dark Mimic LV3 exige destruição por batalha e envio ao GY.');
  validateTeam(event.controllerTeam);
  const ownerSeat=physicalSeat(event.sourceUid),ownerTeam=(ownerSeat%2) as Team;
  if(state.members[ownerSeat]?.team!==ownerTeam)throw Error('Proprietário físico de Dark Mimic LV3 inválido.');
  const graveMatches=state.core.players[ownerTeam].grave.filter(card=>card.uid===event.sourceUid&&card.id===DARK_MIMIC_LV3_ID);
  if(graveMatches.length!==1)throw Error('Dark Mimic LV3 não está no GY do proprietário físico.');
  const lifetime=state.core.cardLifetimes?.[event.sourceUid];
  if(!lifetime||lifetime.zone!=='grave'||lifetime.epoch!==event.sourceEpoch+1)
    throw Error('A transição de batalha para GY não corresponde à época da instância.');
  const metadata=lookup(DARK_MIMIC_LV3_ID);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Dark Mimic LV3 não está admitido como monstro de efeito.');
  const instanceKey=event.sourceUid+'@'+String(event.sourceEpoch),mem=state.darkMimic;
  if(mem?.lv3BattleEvents?.[event.eventId])throw Error('Este evento de batalha de Dark Mimic LV3 já foi resolvido.');
  return {kind:'dark-mimic-lv3-battle-draw',eventId:event.eventId,sourceUid:event.sourceUid,
    sourceInstanceKey:instanceKey,sourceOwnerSeat:ownerSeat,sourceOwnerTeam:ownerTeam,
    controllerTeam:event.controllerTeam,activeSeat:state.active[event.controllerTeam],turn:event.turn,sourceEpoch:event.sourceEpoch,
    drawCount:mem?.lv3SummonedByLv1ByInstance?.[instanceKey]?2:1};
}
export function resolveDarkMimicLv3BattleDraw(
  input:DarkMimicState,plan:DarkMimicBattlePlan,effectNegated=false
):{status:'resolved'|'negated';state:DarkMimicState;drawnUids:string[];deckOut:boolean;handLimitDeferred:boolean}{
  assertState(input);
  validateTeam(plan?.controllerTeam);
  if(!plan||plan.kind!=='dark-mimic-lv3-battle-draw'||!plan.eventId||plan.turn!==input.core.turn||
    !Number.isSafeInteger(plan.sourceEpoch)||plan.sourceEpoch<0||
    plan.sourceInstanceKey!==plan.sourceUid+'@'+String(plan.sourceEpoch)||
    input.active[plan.controllerTeam]!==plan.activeSeat||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||plan.sourceOwnerTeam!==plan.sourceOwnerSeat%2||
    (plan.drawCount!==1&&plan.drawCount!==2))
    throw Error('Plano de compra de Dark Mimic LV3 obsoleto ou inválido.');
  const next=structuredClone(input) as DarkMimicState,before=inventorySnapshot(input),mem=memory(next);
  if(mem.lv3BattleEvents[plan.eventId])throw Error('Este evento de batalha de Dark Mimic LV3 já foi resolvido.');
  const expectedDrawCount=mem.lv3SummonedByLv1ByInstance[plan.sourceInstanceKey]?2:1;
  if(plan.drawCount!==expectedDrawCount)throw Error('Quantidade de compra do plano Dark Mimic LV3 foi adulterada.');
  mem.lv3BattleEvents[plan.eventId]=true;
  delete mem.lv3SummonedByLv1ByInstance[plan.sourceInstanceKey];
  if(effectNegated){
    assertConserved(before,next);
    return {status:'negated',state:next,drawnUids:[],deckOut:false,handLimitDeferred:false};
  }
  const draw=drawForTeam(next,plan.controllerTeam,plan.drawCount);
  assertConserved(before,next);
  return {status:'resolved',state:next,...draw};
}
