import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {tagInventory,type TagDuel} from './tagDuel';

export const FIBER_JAR_ID='78706415';
type Team=0|1;
type Seat=0|1|2|3;
type Core=TagDuel['core'];
type CardRef=Core['players'][number]['deck'][number];
type SeatZones={deck:CardRef[];hand:CardRef[];extra:CardRef[]};
type Zone='hand'|'field'|'grave';

export type FiberJarMemory={resolvedActivations:Record<string,true>};
export type FiberJarState=TagDuel&{fiberJar?:FiberJarMemory};
export type FiberJarLookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
export type FiberJarFlipEvent={
  kind:'flip';
  cause:'flip-summon'|'battle'|'effect';
  sourceUid:string;
  turn:number;
  activationId:string;
  previousFaceUp:false;
  faceUp:true;
  controllerTeam:Team;
  activeSeat:Seat;
};
export type FiberJarPlan={
  kind:'fiber-jar-flip';
  sourceUid:string;
  cardId:typeof FIBER_JAR_ID;
  ownerSeat:Seat;
  controllerTeam:Team;
  activeSeat:Seat;
  turn:number;
  activationId:string;
};
type TeamUids={0:string[];1:string[];2:string[];3:string[]};
const cardLookup:FiberJarLookup=id=>getPlayableCard(id);

function physicalSeat(uid:string):Seat{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Fiber Jar sem proprietário físico válido.');
  return Number(match[1]) as Seat;
}
function assertState(state:FiberJarState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2)||
    state.core.players.some(player=>!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.extra)||player.extra.length>5||
      !Array.isArray(player.banished)))
    throw Error('Estado TagDuel clássico/rotação inválido para Fiber Jar.');
  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Fiber Jar.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team)
      throw Error('Identidade da equipe inválida para Fiber Jar.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.extra])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('Deck/Extra ativos devem pertencer ao representante físico.');
  }
  for(const [seatText,held] of Object.entries(state.reserves)){
    const seat=Number(seatText);
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||
      !Array.isArray(held.extra)||held.extra.length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.extra])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('Deck/Extra da reserva contém carta de outro proprietário físico.');
  }
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.fiberJar!==undefined&&(!state.fiberJar||
    typeof state.fiberJar!=='object'||!state.fiberJar.resolvedActivations||
    typeof state.fiberJar.resolvedActivations!=='object'||
    Object.entries(state.fiberJar.resolvedActivations).some(([id,value])=>!id||value!==true)))
    throw Error('Recibos de resolução Fiber Jar inválidos.');
}
function seatZones(state:FiberJarState,seat:Seat):SeatZones{
  const team=(seat%2) as Team;
  if(state.active[team]===seat)
    return state.core.players[team] as unknown as SeatZones;
  return state.reserves[String(seat)] as SeatZones;
}
function inventorySnapshot(state:FiberJarState):string{
  const cards=tagInventory(state).filter(card=>(card as CardRef&{entityKind?:string}).entityKind!=='token');
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)
    throw Error('Inventário físico duplicado antes da resolução Fiber Jar.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:FiberJarState):void{
  if(inventorySnapshot(after)!==before)
    throw Error('Fiber Jar alterou ou perdeu um UID físico.');
}
function sourceContext(
  state:FiberJarState,
  event:FiberJarFlipEvent,
  lookup:FiberJarLookup
):{ownerSeat:Seat;controllerTeam:Team;activeSeat:Seat}{
  if(typeof event.sourceUid!=='string'||!event.sourceUid)
    throw Error('UID da fonte Fiber Jar ausente.');
  const ownerSeat=physicalSeat(event.sourceUid);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)
    throw Error('Proprietário físico Fiber Jar inválido.');
  const fieldMatches=state.core.players.flatMap((player,team)=>player.monsters
    .filter(monster=>monster.uid===event.sourceUid)
    .map(monster=>({monster,team:team as Team})));
  const graveMatches=state.core.players.flatMap((player,team)=>player.grave
    .filter(card=>card.uid===event.sourceUid)
    .map(card=>({card,team:team as Team})));
  if(fieldMatches.length+graveMatches.length!==1)
    throw Error('Fiber Jar deve estar uma única vez no campo ou no Cemitério ao registrar o FLIP.');
  if(fieldMatches.length===1){
    if(fieldMatches[0].monster.id!==FIBER_JAR_ID||!fieldMatches[0].monster.faceUp||
      fieldMatches[0].team!==event.controllerTeam)
      throw Error('A fonte Fiber Jar não corresponde ao controlador registrado.');
  }else if(graveMatches[0].card.id!==FIBER_JAR_ID){
    throw Error('A fonte no Cemitério não é Fiber Jar.');
  }
  const metadata=lookup(FIBER_JAR_ID);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de Fiber Jar não admitida.');
  if(state.active[event.controllerTeam]!==event.activeSeat)
    throw Error('Representante físico ativo Fiber Jar obsoleto.');
  return {ownerSeat,controllerTeam:event.controllerTeam,activeSeat:event.activeSeat};
}
function shuffleDeck(cards:CardRef[],random:()=>number):CardRef[]{
  const shuffled=[...cards];
  for(let index=shuffled.length-1;index>0;index--){
    const value=random();
    if(!Number.isFinite(value)||value<0||value>=1)
      throw Error('Gerador de embaralhamento Fiber Jar deve retornar valor em [0,1).');
    const swap=Math.floor(value*(index+1));
    [shuffled[index],shuffled[swap]]=[shuffled[swap],shuffled[index]];
  }
  return shuffled;
}
function routeCard(
  state:FiberJarState,
  card:CardRef,
  zone:Zone,
  lookup:FiberJarLookup,
  returned:TeamUids,
  tokensRemoved:string[]
):void{
  const entityKind=(card as CardRef&{entityKind?:string}).entityKind;
  if(entityKind==='token'){
    if(zone!=='field')throw Error('Token não pode estar na mão ou no Cemitério.');
    tokensRemoved.push(card.uid);
    return;
  }
  const ownerSeat=physicalSeat(card.uid);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)
    throw Error('Proprietário físico inválido ao devolver carta Fiber Jar.');
  const metadata=lookup(card.id);
  if(!metadata)throw Error('Carta sem metadata executável ao resolver Fiber Jar: '+card.id);
  const owner=seatZones(state,ownerSeat);
  if(metadata.kind==='monster'&&metadata.monsterType==='fusion')
    owner.extra.push(card);
  else
    owner.deck.push(card);
  returned[ownerSeat].push(card.uid);
}
function finish(core:Core,winnerTeam:Team|null,reason:string):void{
  const mutable=core as any;
  mutable.phase='finished';
  mutable.winner=winnerTeam===null?null:core.players[winnerTeam].id;
  mutable.reason=reason;
  mutable.pending={kind:'none'};
  mutable.chain=[];
  delete mutable.choice;
  delete mutable.handFlow;
  delete mutable.triggerBuild;
  delete mutable.chainRoot;
  delete mutable.graveTriggers;
  delete mutable.summonTriggers;
  delete mutable.battleFlip;
  delete mutable.damageStep;
  delete mutable.effectFlips;
  delete mutable.afterEffectFlips;
  mutable.log=[...mutable.log,reason].slice(-12);
}

/**
 * A FLIP trigger fires for Flip Summon, battle-flip and card-effect flip.
 * In TagDuel each physical player keeps a private hand/Deck while each team
 * shares its field and Graveyard. Cards return to the Deck/Extra Deck of the
 * physical owner, including cards controlled by the opposing team.
 */
export function planFiberJarFlip(
  state:FiberJarState,
  event:FiberJarFlipEvent,
  lookup:FiberJarLookup=cardLookup
):FiberJarPlan{
  assertState(state);
  if(!event||event.kind!=='flip'||!['flip-summon','battle','effect'].includes(event.cause)||
    event.turn!==state.core.turn||event.previousFaceUp!==false||event.faceUp!==true||
    typeof event.activationId!=='string'||!event.activationId||event.activationId.length>128||
    (event.controllerTeam!==0&&event.controllerTeam!==1)||
    !Number.isInteger(event.activeSeat)||event.activeSeat<0||event.activeSeat>3)
    throw Error('Fiber Jar exige um FLIP real e activationId único.');
  const source=sourceContext(state,event,lookup);
  if(state.fiberJar?.resolvedActivations?.[event.activationId])
    throw Error('Esta ativação Fiber Jar já foi resolvida.');
  return {
    kind:'fiber-jar-flip',sourceUid:event.sourceUid,cardId:FIBER_JAR_ID,
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,
    activeSeat:source.activeSeat,turn:state.core.turn,activationId:event.activationId
  };
}

/** Shuffles every physical hand plus both shared fields/GYs into each owner's Deck, then each seat draws five. */
export function resolveFiberJarFlip(
  input:FiberJarState,
  plan:FiberJarPlan,
  effectNegated=false,
  random:()=>number=Math.random,
  lookup:FiberJarLookup=cardLookup
):{
  status:'resolved'|'negated';
  state:FiberJarState;
  returnedUids:TeamUids;
  drawnUids:TeamUids;
  deckOutSeats:Seat[];
  deckOutTeams:Team[];
  tokensRemoved:string[];
  handLimitDeferred:boolean;
}{
  assertState(input);
  if(!plan||plan.kind!=='fiber-jar-flip'||plan.cardId!==FIBER_JAR_ID||
    typeof plan.activationId!=='string'||!plan.activationId||plan.activationId.length>128||
    plan.turn!==input.core.turn||
    (plan.controllerTeam!==0&&plan.controllerTeam!==1)||
    input.active[plan.controllerTeam]!==plan.activeSeat||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||
    input.members[plan.ownerSeat]?.team!==plan.ownerSeat%2)
    throw Error('Plano Fiber Jar obsoleto ou inválido.');
  if(input.fiberJar?.resolvedActivations?.[plan.activationId])
    throw Error('Replay de ativação Fiber Jar rejeitado.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as FiberJarState;
  const resolved={...(next.fiberJar?.resolvedActivations??{})};
  resolved[plan.activationId]=true;
  next.fiberJar={resolvedActivations:resolved};
  const returnedUids:TeamUids={0:[],1:[],2:[],3:[]};
  const drawnUids:TeamUids={0:[],1:[],2:[],3:[]};
  const deckOutSeats:Seat[]=[];
  const tokensRemoved:string[]=[];
  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,returnedUids,drawnUids,deckOutSeats,deckOutTeams:[],tokensRemoved,handLimitDeferred:false};
  }

  for(const seat of [0,1,2,3] as const){
    const zones=seatZones(next,seat);
    const hand=zones.hand.splice(0,zones.hand.length);
    for(const card of hand)routeCard(next,card,'hand',lookup,returnedUids,tokensRemoved);
  }
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    const fieldCards:CardRef[]=[...player.monsters,...player.backrow];
    if(player.field)fieldCards.push(player.field as CardRef);
    const graveCards=[...player.grave] as CardRef[];
    player.monsters=[];
    player.backrow=[];
    player.field=null;
    player.grave=[];
    for(const card of fieldCards)routeCard(next,card,'field',lookup,returnedUids,tokensRemoved);
    for(const card of graveCards)routeCard(next,card,'grave',lookup,returnedUids,tokensRemoved);
  }

  for(const seat of [0,1,2,3] as const){
    const zones=seatZones(next,seat);
    zones.deck=shuffleDeck(zones.deck,random);
  }
  for(const seat of [0,1,2,3] as const){
    const zones=seatZones(next,seat);
    const drawn=zones.deck.splice(0,Math.min(5,zones.deck.length));
    zones.hand.push(...drawn);
    drawnUids[seat]=drawn.map(card=>card.uid);
    if(drawn.length<5)deckOutSeats.push(seat);
  }
  const deckOutTeams=Array.from(new Set(deckOutSeats.map(seat=>(seat%2) as Team))).sort() as Team[];
  if(deckOutTeams.length===2)
    finish(next.core,null,'ambas as equipes tiveram um jogador sem cinco cartas para comprar');
  else if(deckOutTeams.length===1)
    finish(next.core,(1-deckOutTeams[0]) as Team,'uma equipe teve um jogador sem cinco cartas para comprar');

  if(!next.core.teamRotation)throw Error('Rotação TagDuel ausente após Fiber Jar.');
  next.core.teamRotation.reserves=next.reserves as NonNullable<Core['teamRotation']>['reserves'];
  assertState(next);assertConserved(before,next);
  return {status:'resolved',state:next,returnedUids,drawnUids,deckOutSeats,deckOutTeams,tokensRemoved,handLimitDeferred:false};
}
