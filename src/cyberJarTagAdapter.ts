import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {tagInventory,type TagDuel} from './tagDuel';

export const CYBER_JAR_ID='34124316';

type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type TeamUids={0:string[];1:string[]};
type PositionChoice='atk'|'def';
export type CyberJarMemory={resolvedActivations:Record<string,true>};
export type CyberJarState=TagDuel&{cyberJar?:CyberJarMemory};
export type CyberJarLookup=(id:string)=>Pick<Card,'kind'|'monsterType'|'level'>|undefined;
export type CyberJarFlipEvent={
  kind:'flip-summon';
  sourceUid:string;
  turn:number;
  activationId:string;
  summonType:'flip';
  previousFaceUp:false;
  faceUp:true;
};
export type CyberJarPlan={
  kind:'cyber-jar-flip';
  sourceUid:string;
  cardId:typeof CYBER_JAR_ID;
  ownerSeat:number;
  controllerTeam:Team;
  activeSeat:number;
  turn:number;
  activationId:string;
};
type SourceContext={ownerSeat:number;controllerTeam:Team;activeSeat:number};
const cardLookup:CyberJarLookup=id=>getPlayableCard(id);

function assertState(state:CyberJarState):void{
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
    throw Error('Estado TagDuel clássico/rotação inválido para Cyber Jar.');
  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Cyber Jar.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.grave)||!Array.isArray(player.extra)||player.extra.length>5)
      throw Error('Zonas da equipe inválidas para Cyber Jar.');
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
  const physical=tagInventory(state).filter(card=>card.entityKind!=='token');
  const uids=physical.map(card=>card.uid);
  if(physical.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.cyberJar!==undefined&&(!state.cyberJar||typeof state.cyberJar!=='object'||
    !state.cyberJar.resolvedActivations||typeof state.cyberJar.resolvedActivations!=='object'||
    Object.entries(state.cyberJar.resolvedActivations).some(([id,value])=>!id||value!==true)))
    throw Error('Recibos de resolução Cyber Jar inválidos.');
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Cyber Jar sem proprietário físico válido.');
  return Number(match[1]);
}
function sourceContext(state:CyberJarState,uid:string,lookup:CyberJarLookup):SourceContext{
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte Cyber Jar ausente.');
  const ownerSeat=physicalSeat(uid);
  assertState(state);
  if(state.members[ownerSeat]?.team!==ownerSeat%2)throw Error('Proprietário físico Cyber Jar inválido.');
  const matches=state.core.players.flatMap((player,team)=>player.monsters
    .filter(monster=>monster.uid===uid)
    .map(monster=>({monster,team:team as Team})));
  if(matches.length!==1)throw Error('Cyber Jar deve ocupar exatamente uma Zona de Monstro.');
  const {monster,team}=matches[0];
  if(monster.id!==CYBER_JAR_ID)throw Error('A fonte não é Cyber Jar.');
  const metadata=lookup(monster.id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de Cyber Jar não admitida.');
  if(!monster.faceUp)throw Error('Cyber Jar precisa estar face-up após a Invocação-Virar.');
  if(state.core.current!==team)throw Error('Cyber Jar não pertence à equipe ativa.');
  return {ownerSeat,controllerTeam:team,activeSeat:state.active[team]};
}
function physicalInventorySnapshot(state:CyberJarState):string{
  const cards=tagInventory(state).filter(card=>card.entityKind!=='token');
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Cyber Jar.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:CyberJarState):void{
  if(physicalInventorySnapshot(after)!==before)
    throw Error('Cyber Jar alterou, perdeu ou duplicou uma carta física.');
}
function setZone(core:Core,uid:string,zone:'grave'|'hand'|'monsters'):void{
  const lifetimes={...(core.cardLifetimes??{})};
  const previous=lifetimes[uid];
  lifetimes[uid]={zone,epoch:(previous?.epoch??0)+1};
  core.cardLifetimes=lifetimes;
}
function eligibleMonster(id:string,lookup:CyberJarLookup):boolean{
  const card=lookup(id);
  return !!card&&card.kind==='monster'&&typeof card.level==='number'&&card.level>=1&&card.level<=4&&
    (card.monsterType==='normal'||card.monsterType==='effect');
}

/** Plans only a genuine Flip Summon of Cyber Jar; effect-flips do not trigger this adapter. */
export function planCyberJarFlip(
  state:CyberJarState,
  event:CyberJarFlipEvent,
  sourceUid:string,
  lookup:CyberJarLookup=cardLookup
):CyberJarPlan{
  if(!event||event.kind!=='flip-summon'||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.summonType!=='flip'||
    event.previousFaceUp!==false||event.faceUp!==true||
    typeof event.activationId!=='string'||!event.activationId||event.activationId.length>128)
    throw Error('Cyber Jar exige uma Invocação-Virar real com activationId único.');
  const source=sourceContext(state,sourceUid,lookup);
  if(state.cyberJar?.resolvedActivations?.[event.activationId])
    throw Error('Esta ativação Cyber Jar já foi resolvida.');
  return {
    kind:'cyber-jar-flip',sourceUid,cardId:CYBER_JAR_ID,
    ownerSeat:source.ownerSeat,controllerTeam:source.controllerTeam,
    activeSeat:source.activeSeat,turn:state.core.turn,activationId:event.activationId
  };
}

/** Destroys both fields, then reveals up to five from each active physical Deck. */
export function resolveCyberJarFlip(
  input:CyberJarState,
  plan:CyberJarPlan,
  effectNegated=false,
  positionsByUid:Record<string,PositionChoice>={}
):{
  status:'resolved'|'negated';
  state:CyberJarState;
  destroyedUids:TeamUids;
  tokenUids:TeamUids;
  revealedUids:TeamUids;
  summonedUids:TeamUids;
  addedToHandUids:TeamUids;
  positions:Record<string,PositionChoice>;
  handLimitDeferred:boolean;
}{
  assertState(input);
  if(!plan||plan.kind!=='cyber-jar-flip'||plan.cardId!==CYBER_JAR_ID||
    typeof plan.activationId!=='string'||!plan.activationId||plan.activationId.length>128||
    plan.turn!==input.core.turn||plan.controllerTeam!==input.core.current||
    input.active[plan.controllerTeam]!==plan.activeSeat||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||
    input.members[plan.ownerSeat]?.team!==plan.ownerSeat%2)
    throw Error('Plano Cyber Jar obsoleto ou inválido.');
  if(input.cyberJar?.resolvedActivations?.[plan.activationId])
    throw Error('Replay de ativação Cyber Jar rejeitado.');
  const before=physicalInventorySnapshot(input);
  const next=structuredClone(input) as CyberJarState;
  const resolved={...(next.cyberJar?.resolvedActivations??{})};
  resolved[plan.activationId]=true;
  next.cyberJar={resolvedActivations:resolved};
  const destroyedUids:TeamUids={0:[],1:[]};
  const tokenUids:TeamUids={0:[],1:[]};
  const revealedUids:TeamUids={0:[],1:[]};
  const summonedUids:TeamUids={0:[],1:[]};
  const addedToHandUids:TeamUids={0:[],1:[]};
  const positions:Record<string,PositionChoice>={};
  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,destroyedUids,tokenUids,revealedUids,summonedUids,addedToHandUids,positions,handLimitDeferred:next.core.players.some(player=>player.hand.length>6)};
  }
  const sourceMatches=next.core.players.flatMap(player=>player.monsters.filter(monster=>monster.uid===plan.sourceUid));
  if(sourceMatches.length>1||sourceMatches.length===1&&sourceMatches[0].id!==CYBER_JAR_ID)
    throw Error('A instância Cyber Jar foi duplicada ou transformada antes da resolução.');
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    const monsters=player.monsters.splice(0,player.monsters.length);
    for(const monster of monsters){
      if(monster.entityKind==='token'){tokenUids[team].push(monster.uid);continue;}
      destroyedUids[team].push(monster.uid);
      player.grave.push({uid:monster.uid,id:monster.id});
      setZone(next.core,monster.uid,'grave');
    }
  }
  const revealedByTeam:{0:typeof next.core.players[0]['deck'];1:typeof next.core.players[1]['deck']}={0:[],1:[]};
  const summonByTeam:{0:Set<string>;1:Set<string>}={0:new Set(),1:new Set()};
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    const revealed=player.deck.splice(0,Math.min(5,player.deck.length));
    revealedByTeam[team]=revealed;
    revealedUids[team]=revealed.map(card=>card.uid);
    const eligible=revealed.filter(card=>eligibleMonster(card.id,lookup));
    for(const card of eligible.slice(0,3))summonByTeam[team].add(card.uid);
  }
  const allowedPositions=new Set([...summonByTeam[0],...summonByTeam[1]]);
  for(const [uid,position] of Object.entries(positionsByUid)){
    if(!allowedPositions.has(uid)||position!=='atk'&&position!=='def')
      throw Error('Escolha de posição Cyber Jar inválida ou fora das cartas Invocadas.');
  }
  for(const team of [0,1] as const){
    const player=next.core.players[team];
    for(const card of revealedByTeam[team]){
      if(summonByTeam[team].has(card.uid)){
        const position=positionsByUid[card.uid]??'atk';
        player.monsters.push({
          uid:card.uid,id:card.id,position,faceUp:position==='atk',
          entered:next.core.turn,changed:next.core.turn,attacked:0,atkBoost:0,defBoost:0
        });
        summonedUids[team].push(card.uid);
        positions[card.uid]=position;
        setZone(next.core,card.uid,'monsters');
      }else{
        player.hand.push(card);
        addedToHandUids[team].push(card.uid);
        setZone(next.core,card.uid,'hand');
      }
    }
  }
  assertState(next);assertConserved(before,next);
  return {
    status:'resolved',state:next,destroyedUids,tokenUids,revealedUids,
    summonedUids,addedToHandUids,positions,
    handLimitDeferred:next.core.players.some(player=>player.hand.length>6)
  };
}
