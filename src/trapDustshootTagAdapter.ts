import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {shuffleDuel} from './duelRandom';

export const TRAP_DUSTSHOOT_ID='64697231';
type Team=0|1;
export type TrapDustshootTagDuel=TagDuel&{
  trapDustshootActivationIds?:string[];
  trapDustshootPending?:TrapDustshootPlan[];
  trapDustshootResolvedIds?:string[];
};
export type TrapDustshootEvent={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  sourceUid:string;
};
export type TrapDustshootPlan=TrapDustshootEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceSetTurn:number;
  targetHandCountAtActivation:number;
  turn:number;
};
export type TrapDustshootActivation={
  status:'activated';
  state:TrapDustshootTagDuel;
  plan:TrapDustshootPlan;
};
export type PrivateDustshootCard={uid:string;id:string;ownerSeat:number};
export type PrivateTrapDustshootReceipt={
  activationId:string;
  recipientSeat:number;
  targetSeat:number;
  hand:PrivateDustshootCard[];
  selectedCard?:PrivateDustshootCard;
};
export type TrapDustshootResolution={
  status:'resolved'|'negated'|'duplicate';
  state:TrapDustshootTagDuel;
  activationId:string;
  /** Non-enumerable and transient: never serialize into public duel state/logs. */
  privateReceipt?:PrivateTrapDustshootReceipt;
};
export type PrivateTrapDustshootReveal=PrivateTrapDustshootReceipt;

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(team:unknown):team is Team{return team===0||team===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:TrapDustshootTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:TrapDustshootTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:TrapDustshootTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TrapDustshootTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Trap Dustshoot alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Trap Dustshoot alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:TrapDustshootTagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:TrapDustshootTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/deck física do participante não está disponível.');
  return held;
}
function locateSetSource(
  duel:TrapDustshootTagDuel,
  actorSeat:number,
  sourceUid:string
):{ownerSeat:number;setTurn:number}{
  const team=(actorSeat%2) as Team;
  const source=duel.core.players[team].backrow.find(card=>
    card.uid===sourceUid&&card.id===TRAP_DUSTSHOOT_ID
  );
  if(!source)throw new Error('Trap Dustshoot precisa estar na Zona de Magias/Armadilhas da equipe ativa.');
  const ownerSeat=physicalSeat(source.uid);
  if(ownerSeat%2!==team)throw new Error('Trap Dustshoot pertence à equipe adversária.');
  if(source.faceUp)throw new Error('Trap Dustshoot já está com a face para cima.');
  if(!Number.isInteger(source.setTurn)||source.setTurn>=duel.core.turn){
    throw new Error('Trap Dustshoot não pode ser ativada no mesmo turno em que foi Baixada.');
  }
  return {ownerSeat,setTurn:source.setTurn};
}
function samePlan(a:TrapDustshootPlan,b:TrapDustshootPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.targetSeat===b.targetSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceSetTurn===b.sourceSetTurn&&
    a.targetHandCountAtActivation===b.targetHandCountAtActivation&&a.turn===b.turn;
}
function attachPrivateReceipt(
  result:Omit<TrapDustshootResolution,'privateReceipt'>,
  receipt?:PrivateTrapDustshootReceipt
):TrapDustshootResolution{
  const output=result as TrapDustshootResolution;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze(receipt),enumerable:false,configurable:false,writable:false
  });
  return output;
}

/** Activate a previously Set Trap only while the selected opposing physical hand has >=4 cards. */
export function activateTrapDustshoot(
  input:TrapDustshootTagDuel,
  event:TrapDustshootEvent
):TrapDustshootActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||
    typeof event.sourceUid!=='string'||!Number.isInteger(event.actorSeat)||
    event.actorSeat<0||event.actorSeat>3||!Number.isInteger(event.targetSeat)||
    event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de Trap Dustshoot inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('A mão escolhida deve pertencer à equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    !['main','battle'].includes(input.core.phase)||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('Trap Dustshoot exige prioridade aberta da equipe ativa na Main/Battle Phase.');
  }
  if((input.trapDustshootActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Trap Dustshoot já foi registrada.');
  }
  const source=locateSetSource(input,event.actorSeat,event.sourceUid);
  const target=physicalHolder(input,event.targetSeat);
  if(target.hand.length<4)throw new Error('A mão adversária escolhida precisa ter pelo menos quatro cartas.');
  const plan:TrapDustshootPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceSetTurn:source.setTurn,
    targetHandCountAtActivation:target.hand.length,turn:input.core.turn
  });
  const next=structuredClone(input) as TrapDustshootTagDuel;
  next.trapDustshootActivationIds=[...(next.trapDustshootActivationIds??[]),event.activationId];
  next.trapDustshootPending=[...(next.trapDustshootPending??[]),plan];
  const sourceCard=next.core.players[actorTeam].backrow.find(card=>card.uid===event.sourceUid);
  if(!sourceCard)throw new Error('Trap Dustshoot saiu do campo durante a ativação.');
  sourceCard.faceUp=true;
  return {status:'activated',state:next,plan};
}

/**
 * Resolve after the chain. The chosen monster returns to its physical owner's
 * Main Deck (then shuffled) or Extra Deck if it is a Fusion monster.
 */
export function resolveTrapDustshoot(
  input:TrapDustshootTagDuel,
  plan:TrapDustshootPlan,
  targetCardUid:string|undefined,
  effectNegated=false
):TrapDustshootResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||
    !Number.isInteger(plan.actorSeat)||plan.actorSeat<0||plan.actorSeat>3||
    !Number.isInteger(plan.targetSeat)||plan.targetSeat<0||plan.targetSeat>3||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    !Number.isInteger(plan.sourceSetTurn)||plan.sourceSetTurn>=plan.turn||
    !Number.isInteger(plan.targetHandCountAtActivation)||plan.targetHandCountAtActivation<4||
    plan.turn!==input.core.turn||input.active[plan.actorTeam]!==plan.actorSeat||
    input.core.current!==plan.actorTeam||typeof effectNegated!=='boolean'||
    !(input.trapDustshootActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Trap Dustshoot obsoleto ou inválido.');
  }
  const resolved=input.trapDustshootResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const storedPlan=(input.trapDustshootPending??[]).find(item=>item.activationId===plan.activationId);
  if(!storedPlan||!samePlan(storedPlan,plan)){
    throw new Error('Plano de Trap Dustshoot não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as TrapDustshootTagDuel;
  const sourceZone=next.core.players[plan.actorTeam].backrow.findIndex(card=>card.uid===plan.sourceUid);
  if(sourceZone>=0){
    const [source]=next.core.players[plan.actorTeam].backrow.splice(sourceZone,1);
    next.core.players[plan.actorTeam].grave.push(source);
  }
  next.trapDustshootPending=(next.trapDustshootPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.trapDustshootResolvedIds=[...resolved,plan.activationId];
  let receipt:PrivateTrapDustshootReceipt|undefined;
  let selectedUid:string|undefined;
  if(!effectNegated){
    const target=physicalHolder(next,plan.targetSeat);
    const hand=target.hand.map(card=>({uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid)}));
    const monsters=target.hand.filter(card=>getDuelCard(card.id)?.kind==='monster');
    let selected:typeof target.hand[number]|undefined;
    if(targetCardUid===undefined){
      if(monsters.length>0)throw new Error('Escolha um Monstro da mão adversária revelada.');
    }else{
      selected=target.hand.find(card=>card.uid===targetCardUid);
      if(!selected)throw new Error('O Monstro escolhido saiu da mão adversária antes da resolução.');
      if(getDuelCard(selected.id)?.kind!=='monster')throw new Error('Trap Dustshoot só pode devolver um Monstro da mão.');
      selectedUid=selected.uid;
      const ownerSeat=physicalSeat(selected.uid);
      const owner=physicalHolder(next,ownerSeat);
      target.hand=target.hand.filter(card=>card.uid!==selected!.uid);
      if(getDuelCard(selected.id)?.fusion){owner.extra??=[];owner.extra.push(selected);}
      else{
        owner.deck.push(selected);
        shuffleDuel(owner.deck,next.core);
      }
    }
    receipt={
      activationId:plan.activationId,
      recipientSeat:plan.actorSeat,
      targetSeat:plan.targetSeat,
      hand,
      ...(selected?{selectedCard:{uid:selected.uid,id:selected.id,ownerSeat:physicalSeat(selected.uid)}}:{})
    };
  }
  assertSameInventory(before,next);
  const expectedHands=selectedUid?hands.filter(uid=>uid!==selectedUid):hands;
  if(JSON.stringify(expectedHands)!==JSON.stringify(handSnapshot(next))){
    throw new Error('Trap Dustshoot moveu uma carta de mão além do Monstro escolhido.');
  }
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Trap Dustshoot publicou informações privadas no log do duelo.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',
    state:next,
    activationId:plan.activationId
  },receipt);
}

/** Only the exact activating physical seat receives the inspected hand and selection. */
export function privateTrapDustshootRevealForSeat(
  resolution:TrapDustshootResolution,
  viewerSeat:number
):PrivateTrapDustshootReveal|undefined{
  const receipt=resolution?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||viewerSeat!==receipt.recipientSeat)return undefined;
  return {
    activationId:receipt.activationId,
    recipientSeat:receipt.recipientSeat,
    targetSeat:receipt.targetSeat,
    hand:receipt.hand.map(card=>({...card})),
    ...(receipt.selectedCard?{selectedCard:{...receipt.selectedCard}}:{})
  };
}
