import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {tagInventory,type TagDuel} from './tagDuel';

export const MORPHING_JAR_ID='33508719';

type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type TeamUids={0:string[];1:string[]};

export type MorphingJarMemory={resolvedActivations:Record<string,true>};
export type MorphingJarState=TagDuel&{morphingJar?:MorphingJarMemory};
export type MorphingJarLookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
export type MorphingJarFlipEvent={
  kind:'flip-summon';
  sourceUid:string;
  turn:number;
  activationId:string;
  summonType:'flip';
  previousFaceUp:false;
  faceUp:true;
};
export type MorphingJarPlan={
  kind:'morphing-jar-flip';
  sourceUid:string;
  cardId:typeof MORPHING_JAR_ID;
  ownerSeat:number;
  controllerTeam:Team;
  activeSeat:number;
  turn:number;
  activationId:string;
};
type SourceContext={monster:Monster;ownerSeat:number;controllerTeam:Team;activeSeat:number};
const cardLookup:MorphingJarLookup=id=>getPlayableCard(id);

function assertState(state:MorphingJarState):void{
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
    state.core.players.some(player=>!Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3))
    throw Error('Estado TagDuel clássico/rotação inválido para Morphing Jar.');
  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Morphing Jar.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.grave)||!Array.isArray(player.extra)||player.extra.length>5)
      throw Error('Zonas da equipe inválidas para Morphing Jar.');
    const activePrefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...player.extra])
      if(typeof card.uid!=='string'||!card.uid.startsWith(activePrefix))
        throw Error('Deck/mão/Extra devem pertencer ao representante físico ativo.');
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||!Array.isArray(held.extra)||held.extra.length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...held.extra])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('Zona privada da reserva contém carta de outro proprietário físico.');
  }
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||
    new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.morphingJar!==undefined&&(!state.morphingJar||typeof state.morphingJar!=='object'||
    !state.morphingJar.resolvedActivations||typeof state.morphingJar.resolvedActivations!=='object'||
    Object.entries(state.morphingJar.resolvedActivations).some(([id,value])=>!id||value!==true)))
    throw Error('Recibos de resolução Morphing Jar inválidos.');
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Morphing Jar sem proprietário físico válido.');
  return Number(match[1]);
}
function sourceContext(state:MorphingJarState,uid:string,lookup:MorphingJarLookup):SourceContext{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte Morphing Jar ausente.');
  const ownerSeat=physicalSeat(uid);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)throw Error('Proprietário físico Morphing Jar inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters
    .filter(monster=>monster.uid===uid)
    .map(monster=>({monster,team:team as Team})));
  if(matches.length!==1)throw Error('Morphing Jar deve ocupar exatamente uma Zona de Monstro.');
  const {monster,team}=matches[0];
  if(monster.id!==MORPHING_JAR_ID)throw Error('A fonte não é Morphing Jar.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de Morphing Jar não admitida.');
  if(!monster.faceUp)throw Error('Morphing Jar precisa estar face-up após a Invocação-Virar.');
  if(state.core.current!==team)throw Error('Morphing Jar não pertence à equipe ativa.');
  return {monster,ownerSeat,controllerTeam:team,activeSeat:state.active[team]};
}
function inventorySnapshot(state:MorphingJarState):string{
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Morphing Jar.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:MorphingJarState):void{
  if(inventorySnapshot(after)!==before)throw Error('Morphing Jar alterou ou perdeu um UID físico.');
}
function finish(core:Core,winnerTeam:Team|null,reason:string):void{
  core.phase='finished';
  core.winner=winnerTeam===null?null:core.players[winnerTeam].id;
  core.reason=reason;
  core.pending={kind:'none'};
  core.chain=[];
  delete core.choice;
  delete core.handFlow;
  delete core.triggerBuild;
  delete core.chainRoot;
  delete core.graveTriggers;
  delete core.summonTriggers;
  delete core.battleFlip;
  delete core.damageStep;
  delete core.effectFlips;
  delete core.afterEffectFlips;
  core.log=[...core.log,reason].slice(-12);
}

/** Plans only the real FLIP trigger. Normal Summons and effect-flips are not Morphing Jar activations. */
export function planMorphingJarFlip(
  state:MorphingJarState,
  event:MorphingJarFlipEvent,
  sourceUid:string,
  lookup:MorphingJarLookup=cardLookup
):MorphingJarPlan{
  if(!event||event.kind!=='flip-summon'||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.summonType!=='flip'||
    event.previousFaceUp!==false||event.faceUp!==true||
    typeof event.activationId!=='string'||!event.activationId||event.activationId.length>128)
    throw Error('Morphing Jar exige uma Invocação-Virar real com activationId único.');
  const source=sourceContext(state,sourceUid,lookup);
  if(state.morphingJar?.resolvedActivations?.[event.activationId])
    throw Error('Esta ativação Morphing Jar já foi resolvida.');
  return {
    kind:'morphing-jar-flip',sourceUid,cardId:MORPHING_JAR_ID,
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,
    activeSeat:source.activeSeat,turn:state.core.turn,activationId:event.activationId
  };
}

/** Both active teams discard first, then draw up to five. Inactive partner reserves are not touched. */
export function resolveMorphingJarFlip(
  input:MorphingJarState,
  plan:MorphingJarPlan,
  effectNegated=false
):{
  status:'resolved'|'negated';
  state:MorphingJarState;
  discardedUids:TeamUids;
  drawnUids:TeamUids;
  deckOutTeams:Team[];
  handLimitDeferred:boolean;
}{
  assertState(input);
  if(!plan||plan.kind!=='morphing-jar-flip'||plan.cardId!==MORPHING_JAR_ID||
    typeof plan.activationId!=='string'||!plan.activationId||plan.activationId.length>128||
    plan.turn!==input.core.turn||plan.controllerTeam!==input.core.current||
    input.active[plan.controllerTeam]!==plan.activeSeat||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||
    input.members[plan.ownerSeat]?.team!==plan.ownerSeat%2)
    throw Error('Plano Morphing Jar obsoleto ou inválido.');
  if(input.morphingJar?.resolvedActivations?.[plan.activationId])
    throw Error('Replay de ativação Morphing Jar rejeitado.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as MorphingJarState;
  const resolved={...(next.morphingJar?.resolvedActivations??{})};
  resolved[plan.activationId]=true;
  next.morphingJar={resolvedActivations:resolved};
  const discardedUids:TeamUids={0:[],1:[]};
  const drawnUids:TeamUids={0:[],1:[]};
  const deckOutTeams:Team[]=[];
  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,discardedUids,drawnUids,deckOutTeams,handLimitDeferred:false};
  }
  const sourceMatches=next.core.players.flatMap(player=>player.monsters.filter(monster=>monster.uid===plan.sourceUid));
  if(sourceMatches.length>1||sourceMatches.length===1&&sourceMatches[0].id!==MORPHING_JAR_ID)
    throw Error('A instância Morphing Jar foi duplicada ou transformada antes da resolução.');
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    const discarded=player.hand.splice(0,player.hand.length);
    discardedUids[team]=discarded.map(card=>card.uid);
    player.grave.push(...discarded);
  }
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    const drawn=player.deck.splice(0,Math.min(5,player.deck.length));
    drawnUids[team]=drawn.map(card=>card.uid);
    player.hand.push(...drawn);
    if(drawn.length<5)deckOutTeams.push(team);
  }
  if(deckOutTeams.length===2)
    finish(next.core,null,'ambas as equipes não conseguiram comprar cinco cartas');
  else if(deckOutTeams.length===1)
    finish(next.core,(1-deckOutTeams[0]) as Team,'uma equipe não conseguiu comprar cinco cartas');
  assertState(next);assertConserved(before,next);
  return {status:'resolved',state:next,discardedUids,drawnUids,deckOutTeams,handLimitDeferred:false};
}
