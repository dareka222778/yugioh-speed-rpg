import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';

export const SPEAR_CRETIN_ID='58551308';

type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;

type PendingActivation={
  sourceUid:string;
  sourceOwnerSeat:number;
  sourceTeam:Team;
  turn:number;
};
export type SpearCretinMemory={
  pending:Record<string,PendingActivation>;
  resolved:Record<string,true>;
};
export type SpearCretinState=TagDuel&{spearCretin?:SpearCretinMemory};

export type SpearCretinSentEvent={
  kind:'flip-sent-to-grave';
  sourceUid:string;
  turn:number;
  fromZone:'monsters';
  toZone:'grave';
  wasFlipped:boolean;
  cause?:'battle'|'effect'|'other';
};
export type SpearCretinTriggerPlan={
  kind:'spear-cretin-trigger';
  sourceUid:string;
  sourceOwnerSeat:number;
  sourceTeam:Team;
  turn:number;
  activationId:string;
};
export type SpearCretinChoice={uid:string;position:'atk'|'def'};
export type SpearCretinResolutionPlan={
  kind:'spear-cretin-resolution';
  sourceUid:string;
  sourceOwnerSeat:number;
  sourceTeam:Team;
  turn:number;
  activationId:string;
  choices:[SpearCretinChoice|null,SpearCretinChoice|null];
};

const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Spear Cretin sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:SpearCretinState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para Spear Cretin.');

  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Spear Cretin.');

  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.extra??[])||
      (player.extra??[]).length>5||state.active[team]%2!==team)
      throw Error('Zonas 3+3, Extra Deck ou representante ativo inválidos para Spear Cretin.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...(player.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de Deck/mão/Extra deve pertencer ao representante físico ativo.');
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||
      !Array.isArray(held.extra??[])||(held.extra??[]).length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');

  const memory=state.spearCretin;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||
    !memory.pending||typeof memory.pending!=='object'||
    !memory.resolved||typeof memory.resolved!=='object'||
    Object.entries(memory.pending).some(([id,value])=>!validActivationId(id)||!value||
      typeof value.sourceUid!=='string'||!Number.isInteger(value.sourceOwnerSeat)||
      value.sourceOwnerSeat<0||value.sourceOwnerSeat>3||
      (value.sourceTeam!==0&&value.sourceTeam!==1)||
      !Number.isSafeInteger(value.turn))||
    Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)))
    throw Error('Memória de ativações Spear Cretin inválida.');
}

function sourceContext(state:SpearCretinState,uid:string,lookup:Lookup):{
  sourceOwnerSeat:number;sourceTeam:Team
}{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte Spear Cretin ausente.');
  const sourceOwnerSeat=physicalSeat(uid);
  const sourceTeam=(sourceOwnerSeat%2) as Team;
  if(state.members[sourceOwnerSeat]?.team!==sourceTeam)
    throw Error('Proprietário físico da fonte Spear Cretin inválido.');
  const matches=state.core.players[sourceTeam].grave.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].id!==SPEAR_CRETIN_ID)
    throw Error('Spear Cretin deve estar uma única vez no Cemitério de sua equipe.');
  const metadata=lookup(matches[0].id);
  if(!metadata||metadata.kind!=='monster'||metadata.monsterType!=='effect')
    throw Error('Definição de Spear Cretin não admitida.');
  return {sourceOwnerSeat,sourceTeam};
}

function inventorySnapshot(state:SpearCretinState):string{
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)
    throw Error('Inventário físico duplicado antes da resolução Spear Cretin.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:SpearCretinState):void{
  if(inventorySnapshot(after)!==before)
    throw Error('Spear Cretin alterou ou perdeu uma identidade física do inventário.');
}
function pendingActivation(state:SpearCretinState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId Spear Cretin inválido.');
  const pending=state.spearCretin?.pending?.[activationId];
  if(!pending)throw Error('Ativação Spear Cretin ausente, já resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||pending.sourceTeam!==pending.sourceOwnerSeat%2)
    throw Error('Turno ou proprietário físico da ativação Spear Cretin mudou antes da resolução.');
  return pending;
}

function isReviveEligible(
  state:SpearCretinState,
  team:Team,
  uid:string,
  lookup:Lookup
):boolean{
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat%2!==team||state.members[ownerSeat]?.team!==team)return false;
  const matches=state.core.players[team].grave.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].entityKind==='token')return false;
  const card=matches[0];
  const metadata=lookup(card.id);
  if(!metadata||metadata.kind!=='monster')return false;
  if((metadata.monsterType==='fusion'||metadata.monsterType==='ritual')&&!card.properlySummoned)
    return false;
  return true;
}

/** A FLIP trigger requires that Spear Cretin was flipped and later sent from the field to its owner's GY. */
export function planSpearCretinTrigger(
  state:SpearCretinState,
  event:SpearCretinSentEvent,
  sourceUid:string,
  activationId:string,
  lookup:Lookup=cardLookup
):SpearCretinTriggerPlan{
  assertState(state);
  if(!event||event.kind!=='flip-sent-to-grave'||event.sourceUid!==sourceUid||
    event.turn!==state.core.turn||event.fromZone!=='monsters'||
    event.toZone!=='grave'||event.wasFlipped!==true||!validActivationId(activationId))
    throw Error('Spear Cretin exige envio do campo ao Cemitério depois de ter sido virado.');
  if(state.spearCretin?.pending?.[activationId]||state.spearCretin?.resolved?.[activationId])
    throw Error('activationId Spear Cretin já utilizado.');
  const source=sourceContext(state,sourceUid,lookup);
  return {
    kind:'spear-cretin-trigger',sourceUid,
    sourceOwnerSeat:source.sourceOwnerSeat,sourceTeam:source.sourceTeam,
    turn:state.core.turn,activationId
  };
}

/** Registers the trigger after the source reaches its owner's GY; no Graveyard choice is made here. */
export function registerSpearCretinTrigger(
  input:SpearCretinState,
  plan:SpearCretinTriggerPlan,
  lookup:Lookup=cardLookup
):SpearCretinState{
  assertState(input);
  if(!plan||plan.kind!=='spear-cretin-trigger'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||physicalSeat(plan.sourceUid)!==plan.sourceOwnerSeat||
    plan.sourceTeam!==plan.sourceOwnerSeat%2||
    input.spearCretin?.pending?.[plan.activationId]||input.spearCretin?.resolved?.[plan.activationId])
    throw Error('Plano de trigger Spear Cretin obsoleto ou inválido.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.sourceOwnerSeat!==plan.sourceOwnerSeat||source.sourceTeam!==plan.sourceTeam)
    throw Error('Proprietário físico do trigger Spear Cretin mudou.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as SpearCretinState;
  const pending={...(next.spearCretin?.pending??{})};
  pending[plan.activationId]={
    sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    sourceTeam:plan.sourceTeam,turn:plan.turn
  };
  next.spearCretin={pending,resolved:{...(next.spearCretin?.resolved??{})}};
  synchronizeCardLifetimes(next.core);
  assertState(next);
  assertConserved(before,next);
  return next;
}

/** Choices are made at resolution, independently from each team's own shared GY. */
export function getSpearCretinCandidates(
  state:SpearCretinState,
  activationId:string,
  team:Team,
  lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  pendingActivation(state,activationId);
  if(team!==0&&team!==1)throw Error('Equipe inválida na escolha Spear Cretin.');
  if(state.core.players[team].monsters.length>=3)return [];
  return state.core.players[team].grave
    .filter(card=>isReviveEligible(state,team,card.uid,lookup))
    .map(card=>card.uid);
}

export function planSpearCretinResolution(
  state:SpearCretinState,
  activationId:string,
  choices:[SpearCretinChoice|null,SpearCretinChoice|null],
  lookup:Lookup=cardLookup
):SpearCretinResolutionPlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  if(!Array.isArray(choices)||choices.length!==2)
    throw Error('Spear Cretin exige uma escolha independente por equipe.');
  const normalized: [SpearCretinChoice|null,SpearCretinChoice|null]=[null,null];
  for(const team of [0,1] as const){
    const candidates=getSpearCretinCandidates(state,activationId,team,lookup);
    const choice=choices[team];
    if(candidates.length===0){
      if(choice!==null&&choice!==undefined)
        throw Error('Equipe sem Zona de Monstro ou monstro elegível não pode escolher uma carta.');
      normalized[team]=null;
      continue;
    }
    if(!choice||!candidates.includes(choice.uid)||
      (choice.position!=='atk'&&choice.position!=='def'))
      throw Error('Cada equipe com opção legal deve escolher 1 monstro do próprio Cemitério.');
    normalized[team]={uid:choice.uid,position:choice.position};
  }
  return {
    kind:'spear-cretin-resolution',sourceUid:pending.sourceUid,
    sourceOwnerSeat:pending.sourceOwnerSeat,sourceTeam:pending.sourceTeam,
    turn:pending.turn,activationId,choices:normalized
  };
}

/** Resolves both teams atomically; face-down Defense is an explicit Spear Cretin exception. */
export function resolveSpearCretinResolution(
  input:SpearCretinState,
  plan:SpearCretinResolutionPlan,
  effectNegated=false,
  lookup:Lookup=cardLookup
):{
  status:'both'|'partial'|'no-summons'|'negated';
  state:SpearCretinState;
  summoned:Array<{team:Team;uid:string;ownerSeat:number;position:'atk'|'def';faceUp:boolean}>;
}{
  assertState(input);
  if(!plan||plan.kind!=='spear-cretin-resolution')
    throw Error('Plano de resolução Spear Cretin inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.sourceOwnerSeat!==pending.sourceOwnerSeat||
    plan.sourceTeam!==pending.sourceTeam||plan.turn!==pending.turn||
    !Array.isArray(plan.choices)||plan.choices.length!==2)
    throw Error('Plano de escolhas Spear Cretin não corresponde ao trigger pendente.');

  const before=inventorySnapshot(input);
  const candidates: [string[],string[]]=[
    effectNegated?[]:getSpearCretinCandidates(input,plan.activationId,0,lookup),
    effectNegated?[]:getSpearCretinCandidates(input,plan.activationId,1,lookup)
  ];
  if(!effectNegated){
    for(const team of [0,1] as const){
      const choice=plan.choices[team];
      if(candidates[team].length===0){
        if(choice!==null)throw Error('Plano Spear Cretin contém escolha sem monstro/zona legal.');
      }else if(!choice||!candidates[team].includes(choice.uid)||
        (choice.position!=='atk'&&choice.position!=='def'))
        throw Error('Escolha Spear Cretin ficou ausente ou obsoleta antes da resolução.');
    }
  }

  const next=structuredClone(input) as SpearCretinState;
  const pendingMap={...(next.spearCretin?.pending??{})};
  delete pendingMap[plan.activationId];
  next.spearCretin={
    pending:pendingMap,
    resolved:{...(next.spearCretin?.resolved??{}),[plan.activationId]:true as const}
  };
  if(effectNegated){
    assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,summoned:[]};
  }

  const summoned:Array<{team:Team;uid:string;ownerSeat:number;position:'atk'|'def';faceUp:boolean}>=[];
  for(const team of [0,1] as const){
    const choice=plan.choices[team];
    if(!choice)continue;
    const grave=next.core.players[team].grave;
    const index=grave.findIndex(card=>card.uid===choice.uid);
    if(index<0||next.core.players[team].monsters.length>=3)
      throw Error('Cemitério ou Zona de Monstro mudou antes da resolução Spear Cretin.');
    const [ref]=grave.splice(index,1);
    const ownerSeat=physicalSeat(ref.uid);
    const faceUp=choice.position==='atk';
    const monster:Monster={
      ...ref,owner:ownerSeat,faceUp,position:choice.position,
      entered:pending.turn,changed:pending.turn,attacked:0,atkBoost:0,defBoost:0
    };
    next.core.players[team].monsters.push(monster);
    summoned.push({team,uid:monster.uid,ownerSeat,position:choice.position,faceUp});
  }
  synchronizeCardLifetimes(next.core);
  assertState(next);
  assertConserved(before,next);
  return {
    status:summoned.length===2?'both':summoned.length===1?'partial':'no-summons',
    state:next,summoned
  };
}
