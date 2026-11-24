import type {TagDuel} from './tagDuel';

export const CHAIN_ENERGY_ID='79323590';
export type ChainEnergyTeam=0|1;
export type ChainEnergyActionKind=
  'normal-summon'|'special-summon'|'set'|'activate'|'discard-cost'|'send-to-grave'|'reveal';
export type ChainEnergySourceZone='hand'|'deck'|'grave'|'extra'|'field'|'banished';
export type ChainEnergyCardType='monster'|'spell'|'trap';
export type ChainEnergyLedger=Readonly<{version:1;processedActionIds:readonly string[]}>;
export type ChainEnergyEvent=Readonly<{
  actionId:string;
  controllerMemberId:string;
  actionKind:ChainEnergyActionKind;
  sourceZone:ChainEnergySourceZone;
  cardType:ChainEnergyCardType;
  cards:readonly Readonly<{id:string;uid:string}>[];
  currentLP:number;
  negatedSourceUids?:readonly string[];
}>;
export type ChainEnergyPlan=Readonly<{
  actionId:string;
  controllerMemberId:string;
  team:ChainEnergyTeam;
  actionKind:Extract<ChainEnergyActionKind,'normal-summon'|'special-summon'|'set'|'activate'>;
  sourceZone:'hand';
  cardCount:number;
  copyCount:number;
  sourceUids:readonly string[];
  perCardPerCopy:500;
  amount:number;
  minimumRemainingLP:1;
  timing:'before-action';
  chainLink:false;
  costType:'shared-team-LP-cost';
}>;
export type ChainEnergyResolution=Readonly<{
  status:'payable'|'insufficient-lp'|'unchanged'|'not-applicable'|'duplicate';
  ledger:ChainEnergyLedger;
  plan:ChainEnergyPlan|null;
}>;

const taxedActions:readonly ChainEnergyActionKind[]=['normal-summon','special-summon','set','activate'];
function assertTeam(value:unknown):asserts value is ChainEnergyTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida para Chain Energy.');
}
function assertNonEmpty(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertCardId(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!/^[0-9]{8}$/.test(value))throw new Error(label+' inválido.');
}
function assertLedger(ledger:ChainEnergyLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedActionIds)||
    ledger.processedActionIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(ledger.processedActionIds).size!==ledger.processedActionIds.length){
    throw new Error('Ledger de Chain Energy inválido.');
  }
}
function nextLedger(ledger:ChainEnergyLedger,actionId:string):ChainEnergyLedger{
  return {version:1,processedActionIds:[...ledger.processedActionIds,actionId]};
}
function assertClassicTag(state:TagDuel):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !state.core.teamRotation||!Array.isArray(state.core.teamRotation.active)||
    state.core.teamRotation.active.length!==2||!state.reserves){
    throw new Error('Chain Energy exige um duelo 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||
    state.members.some((member,index)=>!member.id||member.team!==index%2)||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    state.active[state.cursor%2]!==state.cursor){
    throw new Error('Assentos físicos de Chain Energy inválidos.');
  }
  if(state.core.teamRotation.cursor!==state.cursor||
    state.core.teamRotation.active[0]!==state.active[0]||
    state.core.teamRotation.active[1]!==state.active[1]||
    JSON.stringify(state.core.teamRotation.reserves)!==JSON.stringify(state.reserves)||
    state.core.players.some((player,team)=>player.id!=='tag-team-'+team||
      !Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.hand)||!Array.isArray(player.backrow))||
    state.core.current!==state.cursor%2){
    throw new Error('Rotação, mão privada ou LP compartilhado inconsistente para Chain Energy.');
  }
}
function assertNegatedUids(values:readonly string[]|undefined):Set<string>{
  const ids=values??[];
  if(!Array.isArray(ids)||ids.some(uid=>typeof uid!=='string'||!uid.trim())||
    new Set(ids).size!==ids.length){
    throw new Error('Lista de Chain Energy negadas inválida.');
  }
  return new Set(ids);
}
function assertEvent(event:ChainEnergyEvent):void{
  assertNonEmpty(event?.actionId,'ID da ação');
  assertNonEmpty(event.controllerMemberId,'Participante ativo');
  if(!['normal-summon','special-summon','set','activate','discard-cost','send-to-grave','reveal'].includes(event.actionKind)||
    !['hand','deck','grave','extra','field','banished'].includes(event.sourceZone)||
    !['monster','spell','trap'].includes(event.cardType)||
    !Array.isArray(event.cards)||!Number.isSafeInteger(event.currentLP)||event.currentLP<0){
    throw new Error('Evento de ação de Chain Energy inválido.');
  }
  if((event.actionKind==='normal-summon'||event.actionKind==='special-summon')&&event.cardType!=='monster'){
    throw new Error('Chain Energy recebeu tipo incompatível com Invocação.');
  }
  const seen=new Set<string>();
  for(const card of event.cards){
    assertCardId(card?.id,'Identidade da carta da ação');
    assertNonEmpty(card.uid,'UID físico da carta da ação');
    if(seen.has(card.uid))throw new Error('UID duplicado na mesma ação de mão.');
    seen.add(card.uid);
  }
  assertNegatedUids(event.negatedSourceUids);
}
function assertActiveMember(state:TagDuel,memberId:string):{seat:number;team:ChainEnergyTeam}{
  const seat=state.members.findIndex(member=>member.id===memberId);
  if(seat<0)throw new Error('Participante de Chain Energy não encontrado.');
  const team=state.members[seat].team;
  assertTeam(team);
  if(state.core.current!==team||state.cursor!==seat||state.active[team]!==seat){
    throw new Error('Chain Energy exige a ação do participante físico ativo.');
  }
  return {seat,team};
}
function assertHandCards(
  state:TagDuel,
  seat:number,
  team:ChainEnergyTeam,
  cards:ChainEnergyEvent['cards']
):void{
  if(cards.length===0)throw new Error('Ação de mão sem cartas físicas.');
  for(const card of cards){
    const match=/^m([0-3]):(.+)$/.exec(card.uid);
    if(!match||Number(match[1])!==seat)throw new Error('Carta não pertence à mão privada do participante ativo.');
    const found=state.core.players[team].hand.filter(entry=>entry.uid===card.uid);
    if(found.length!==1||found[0].id!==card.id){
      throw new Error('Carta da ação não corresponde exatamente à mão privada ativa.');
    }
  }
}
function activeChainEnergySources(
  state:TagDuel,
  negated:Set<string>
):string[]{
  const result:string[]=[];
  const seen=new Set<string>();
  for(const team of [0,1] as const){
    for(const card of state.core.players[team].backrow){
      if(card.id!==CHAIN_ENERGY_ID)continue;
      assertNonEmpty(card.uid,'UID físico de Chain Energy');
      if(seen.has(card.uid))throw new Error('UID duplicado de Chain Energy no campo compartilhado.');
      seen.add(card.uid);
      if(card.faceUp===true&&!negated.has(card.uid))result.push(card.uid);
    }
  }
  return result;
}

/**
 * Returns the shared-team LP cost before a card is played from the active
 * member's private hand. This is a cost (not effect damage) and does not start
 * a Chain Link. It never mutates LP, hand, Deck or field state.
 */
export function createChainEnergyLedger():ChainEnergyLedger{
  return {version:1,processedActionIds:[]};
}
export function resolveChainEnergy(
  state:TagDuel,
  ledger:ChainEnergyLedger,
  event:ChainEnergyEvent
):ChainEnergyResolution{
  assertLedger(ledger);assertEvent(event);
  if(ledger.processedActionIds.includes(event.actionId)){
    return {status:'duplicate',ledger,plan:null};
  }
  assertClassicTag(state);
  const {seat,team}=assertActiveMember(state,event.controllerMemberId);
  if(state.core.players[team].lp!==event.currentLP){
    throw new Error('Snapshot de LP obsoleto para Chain Energy.');
  }
  const next=nextLedger(ledger,event.actionId);
  if(event.sourceZone!=='hand'||!taxedActions.includes(event.actionKind)){
    return {status:'not-applicable',ledger:next,plan:null};
  }
  assertHandCards(state,seat,team,event.cards);
  const sources=activeChainEnergySources(state,assertNegatedUids(event.negatedSourceUids));
  if(sources.length===0)return {status:'unchanged',ledger:next,plan:null};
  const amount=500*event.cards.length*sources.length;
  if(!Number.isSafeInteger(amount))throw new Error('Custo de Chain Energy excede o limite seguro.');
  if(event.currentLP<=amount)return {status:'insufficient-lp',ledger:next,plan:null};
  return {
    status:'payable',
    ledger:next,
    plan:{
      actionId:event.actionId,controllerMemberId:event.controllerMemberId,team,
      actionKind:event.actionKind as ChainEnergyPlan['actionKind'],sourceZone:'hand',
      cardCount:event.cards.length,copyCount:sources.length,sourceUids:sources,
      perCardPerCopy:500,amount,minimumRemainingLP:1,timing:'before-action',
      chainLink:false,costType:'shared-team-LP-cost'
    }
  };
}
