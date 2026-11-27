import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {shuffleDuel} from './duelRandom';

export const THE_FORCEFUL_SENTRY_ID='42829885';
type Team=0|1;
type SentryLocation='hand'|'backrow';
export type ForcefulSentryTagDuel=TagDuel&{
  forcefulSentryActivationIds?:string[];
  forcefulSentryPending?:ForcefulSentryPlan[];
  forcefulSentryResolvedIds?:string[];
};
export type ForcefulSentryEvent={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  sourceUid:string;
};
export type ForcefulSentryPlan=ForcefulSentryEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceLocation:SentryLocation;
  sourceSetTurn:number|null;
  targetHandCountAtActivation:number;
  turn:number;
};
export type ForcefulSentryActivation={
  status:'activated';
  state:ForcefulSentryTagDuel;
  plan:ForcefulSentryPlan;
};
export type PrivateSentryCard={uid:string;id:string;ownerSeat:number};
export type PrivateForcefulSentryReceipt={
  activationId:string;
  recipientSeat:number;
  targetSeat:number;
  hand:PrivateSentryCard[];
  selectedCard?:PrivateSentryCard;
};
export type ForcefulSentryResolution={
  status:'resolved'|'negated'|'duplicate';
  state:ForcefulSentryTagDuel;
  activationId:string;
  /** Non-enumerable and transient: never serialize into public duel state/logs. */
  privateReceipt?:PrivateForcefulSentryReceipt;
};
export type PrivateForcefulSentryReveal=PrivateForcefulSentryReceipt;

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(team:unknown):team is Team{return team===0||team===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:ForcefulSentryTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:ForcefulSentryTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:ForcefulSentryTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:ForcefulSentryTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('The Forceful Sentry alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('The Forceful Sentry alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:ForcefulSentryTagDuel):void{
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
function physicalHolder(duel:ForcefulSentryTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/Deck físico do participante não está disponível.');
  return held;
}
function locateSource(
  duel:ForcefulSentryTagDuel,
  actorSeat:number,
  sourceUid:string
):{location:SentryLocation;ownerSeat:number;setTurn:number|null}{
  const team=(actorSeat%2) as Team;
  const holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===THE_FORCEFUL_SENTRY_ID);
  const field=duel.core.players[team].backrow.find(card=>
    card.uid===sourceUid&&card.id===THE_FORCEFUL_SENTRY_ID
  );
  const opposingField=duel.core.players[1-team].backrow.find(card=>
    card.uid===sourceUid&&card.id===THE_FORCEFUL_SENTRY_ID
  );
  if(opposingField)throw new Error('The Forceful Sentry preparada pertence à equipe adversária.');
  if(hand&&field)throw new Error('The Forceful Sentry aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid),setTurn:null};
  if(field){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('The Forceful Sentry preparada pertence à equipe adversária.');
    if(field.faceUp)throw new Error('The Forceful Sentry já está com a face para cima.');
    return {
      location:'backrow',
      ownerSeat,
      setTurn:Number.isInteger(field.setTurn)?field.setTurn:null
    };
  }
  throw new Error('The Forceful Sentry não está na mão ativa nem baixada na Zona de Magias/Armadilhas da equipe.');
}
function samePlan(a:ForcefulSentryPlan,b:ForcefulSentryPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.targetSeat===b.targetSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceLocation===b.sourceLocation&&a.sourceSetTurn===b.sourceSetTurn&&
    a.targetHandCountAtActivation===b.targetHandCountAtActivation&&a.turn===b.turn;
}
function attachPrivateReceipt(
  result:Omit<ForcefulSentryResolution,'privateReceipt'>,
  receipt?:PrivateForcefulSentryReceipt
):ForcefulSentryResolution{
  const output=result as ForcefulSentryResolution;
  if(receipt){
    const safe:PrivateForcefulSentryReceipt={
      ...receipt,
      hand:receipt.hand.map(card=>Object.freeze({...card})),
      ...(receipt.selectedCard?{selectedCard:Object.freeze({...receipt.selectedCard})}:{})
    };
    Object.defineProperty(output,'privateReceipt',{
      value:Object.freeze(safe),enumerable:false,configurable:false,writable:false
    });
  }
  return output;
}

/** Activate from the active seat's hand or a face-down team Spell/Trap Zone in the Main Phase. */
export function activateForcefulSentry(
  input:ForcefulSentryTagDuel,
  event:ForcefulSentryEvent
):ForcefulSentryActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||
    typeof event.sourceUid!=='string'||!Number.isInteger(event.actorSeat)||
    event.actorSeat<0||event.actorSeat>3||!Number.isInteger(event.targetSeat)||
    event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de The Forceful Sentry inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('A mão escolhida deve pertencer à equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('The Forceful Sentry exige prioridade aberta na Main Phase da equipe ativa.');
  }
  if((input.forcefulSentryActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de The Forceful Sentry já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.ownerSeat%2!==actorTeam||
    (source.location==='hand'&&source.ownerSeat!==event.actorSeat)){
    throw new Error('A Magia ativada não pertence à equipe/assento permitido.');
  }
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Magia.');
  }
  const target=physicalHolder(input,event.targetSeat);
  const plan:ForcefulSentryPlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,
    sourceLocation:source.location,sourceSetTurn:source.setTurn,
    targetHandCountAtActivation:target.hand.length,turn:input.core.turn
  });
  const next=structuredClone(input) as ForcefulSentryTagDuel;
  next.forcefulSentryActivationIds=[...(next.forcefulSentryActivationIds??[]),event.activationId];
  next.forcefulSentryPending=[...(next.forcefulSentryPending??[]),plan];
  if(source.location==='hand'){
    const actor=physicalHolder(next,event.actorSeat);
    const index=actor.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===THE_FORCEFUL_SENTRY_ID);
    if(index<0)throw new Error('The Forceful Sentry saiu da mão durante a ativação.');
    const [card]=actor.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('The Forceful Sentry saiu da Zona de Magias/Armadilhas durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

/**
 * Resolve after the chain. Any card in the selected physical hand may be returned
 * to its physical owner's Main Deck (then shuffled), or to the Extra Deck if Fusion.
 * An empty hand resolves without a selection; a non-empty hand requires an exact UID.
 */
export function resolveForcefulSentry(
  input:ForcefulSentryTagDuel,
  plan:ForcefulSentryPlan,
  targetCardUid:string|undefined,
  effectNegated=false
):ForcefulSentryResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||
    !Number.isInteger(plan.actorSeat)||plan.actorSeat<0||plan.actorSeat>3||
    !Number.isInteger(plan.targetSeat)||plan.targetSeat<0||plan.targetSeat>3||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    (plan.sourceLocation==='hand'&&plan.sourceOwnerSeat!==plan.actorSeat)||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    !Number.isInteger(plan.targetHandCountAtActivation)||plan.targetHandCountAtActivation<0||
    plan.turn!==input.core.turn||input.active[plan.actorTeam]!==plan.actorSeat||
    input.core.current!==plan.actorTeam||typeof effectNegated!=='boolean'||
    !(input.forcefulSentryActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de The Forceful Sentry obsoleto ou inválido.');
  }
  const resolved=input.forcefulSentryResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const storedPlan=(input.forcefulSentryPending??[]).find(item=>item.activationId===plan.activationId);
  if(!storedPlan||!samePlan(storedPlan,plan)){
    throw new Error('Plano de The Forceful Sentry não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as ForcefulSentryTagDuel;
  const sourceIndex=next.core.players[plan.actorTeam].backrow.findIndex(card=>card.uid===plan.sourceUid);
  if(sourceIndex>=0){
    const [source]=next.core.players[plan.actorTeam].backrow.splice(sourceIndex,1);
    next.core.players[plan.actorTeam].grave.push(source);
  }else if(!next.core.players[plan.actorTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('The Forceful Sentry não está no campo nem no Cemitério após a ativação.');
  }
  next.forcefulSentryPending=(next.forcefulSentryPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.forcefulSentryResolvedIds=[...resolved,plan.activationId];
  let receipt:PrivateForcefulSentryReceipt|undefined;
  let selectedUid:string|undefined;
  if(!effectNegated){
    const target=physicalHolder(next,plan.targetSeat);
    const hand=target.hand.map(card=>({uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid)}));
    let selected:typeof target.hand[number]|undefined;
    if(targetCardUid===undefined){
      if(target.hand.length>0)throw new Error('Escolha uma carta da mão adversária revelada.');
    }else{
      selected=target.hand.find(card=>card.uid===targetCardUid);
      if(!selected)throw new Error('A carta escolhida saiu da mão adversária antes da resolução.');
      selectedUid=selected.uid;
      const ownerSeat=physicalSeat(selected.uid);
      const owner=physicalHolder(next,ownerSeat);
      target.hand=target.hand.filter(card=>card.uid!==selected!.uid);
      if(getDuelCard(selected.id)?.fusion){
        owner.extra??=[];
        owner.extra.push(selected);
      }else{
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
  }else if(targetCardUid!==undefined){
    throw new Error('Uma ativação negada não pode receber uma seleção de carta.');
  }
  assertSameInventory(before,next);
  const expectedHands=selectedUid?hands.filter(uid=>uid!==selectedUid):hands;
  if(JSON.stringify(expectedHands)!==JSON.stringify(handSnapshot(next))){
    throw new Error('The Forceful Sentry moveu uma carta de mão além da seleção.');
  }
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('The Forceful Sentry publicou informações privadas no log do duelo.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',
    state:next,
    activationId:plan.activationId
  },receipt);
}

/** Only the exact activating physical seat receives the inspected hand and selection. */
export function privateForcefulSentryRevealForSeat(
  resolution:ForcefulSentryResolution,
  viewerSeat:number
):PrivateForcefulSentryReveal|undefined{
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
