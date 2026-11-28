import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {engineCard,getPlayableCard} from './effectRegistry';
import {rulesCardName} from './cardIdentity';
import {randomIndex,shuffleDuel} from './duelRandom';

type Team=0|1;
type Seat=0|1|2|3;
type Counts=Record<Seat,number>;
type Zones=Record<Seat,{deck:number;hand:number}>;

export const DISTURBANCE_STRATEGY_ID='77561728';
export const CONFISCATION_ID='17375316';
export const DRAGGED_DOWN_ID='16435215';
export const MIND_CRUSH_ID='15800838';
export type HandDisruptionEffect='disturbance-strategy'|'confiscation'|'dragged-down'|'mind-crush';
export type HandDisruptionLookup=(cardId:string)=>HandDisruptionEffect|undefined;
export type HandDisruptionEvent={activationId:string;actorSeat:Seat;sourceUid:string;declaredCardId?:string};
export type HandDisruptionPlan=HandDisruptionEvent&{
  actorTeam:Team;
  targetSeat:Seat;
  sourceOwnerSeat:Seat;
  sourceCardId:string;
  effect:HandDisruptionEffect;
  affectedSeats:[Seat,Seat];
  declaredName?:string;
  lpCostPaid:number;
  turn:number;
  activationCurrent:Team;
  cursorAtActivation:number;
};
export type HandDisruptionSession=TagDuel&{
  handDisruptionActivationIds?:string[];
  handDisruptionPending?:HandDisruptionPlan[];
  handDisruptionResolvedIds?:string[];
};
export type HandDisruptionChoices={
  selectedUid?:string;
  actorSelectedUid?:string;
  opponentSelectedUid?:string;
};
export type HandDisruptionReceipt={
  visibility:'public';
  activationId:string;
  effect:HandDisruptionEffect;
  sourceUid:string;
  actorSeat:Seat;
  targetSeat:Seat;
  status:'resolved'|'deckout-pending'|'effect-negated';
  lpCostPaid:number;
  shuffledCount:number;
  drawnCounts:Counts;
  discardedCounts:Counts;
  discardedCardIds:string[];
  selfDiscardedCardIds:string[];
  declaredName?:string;
  revealedHands?:Array<{seat:Seat;cardIds:string[]}>;
  deckOutSeats:Seat[];
};
export type PrivateHandView={
  visibility:'actor-team';
  viewerTeam:Team;
  targetSeat:Seat;
  cards:Array<{uid:string;id:string;name:string}>;
};
export type HandDisruptionActivation={status:'triggered';state:HandDisruptionSession;plan:HandDisruptionPlan};
export type HandDisruptionResolution={
  status:'resolved'|'deckout-pending'|'negated'|'duplicate';
  state:HandDisruptionSession;
  receipt:HandDisruptionReceipt|null;
  privateView?:PrivateHandView;
};

const defaultLookup:HandDisruptionLookup=(id)=>{
  if(id===DISTURBANCE_STRATEGY_ID)return 'disturbance-strategy';
  if(id===CONFISCATION_ID)return 'confiscation';
  if(id===DRAGGED_DOWN_ID)return 'dragged-down';
  if(id===MIND_CRUSH_ID)return 'mind-crush';
  return undefined;
};
export function defaultHandDisruptionEffect(id:string):HandDisruptionEffect|undefined{return defaultLookup(id);}

function validSeat(value:unknown):value is Seat{
  return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
}
function validTeam(value:unknown):value is Team{return value===0||value===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128&&!/[\u0000-\u001f]/.test(value);
}
function physicalSeat(uid:string):Seat{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]) as Seat;
}
function activeSeats(duel:TagDuel):[Seat,Seat]{
  if(!validSeat(duel.active[0])||!validSeat(duel.active[1]))throw new Error('Participantes ativos inválidos.');
  return [duel.active[0],duel.active[1]];
}
function physicalHolder(duel:TagDuel,seat:Seat){
  const team=(seat%2) as Team;
  const holder=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!holder)throw new Error('Deck privado do participante não está disponível.');
  return holder;
}
function zeroCounts():Counts{return {0:0,1:0,2:0,3:0};}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Efeito de mão alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('Efeito de mão alterou a identidade física: '+uid);
}
function zoneCounts(duel:TagDuel):Zones{
  const result={} as Zones;
  for(const seat of [0,1,2,3] as Seat[]){
    const holder=physicalHolder(duel,seat);
    result[seat]={deck:holder.deck.length,hand:holder.hand.length};
  }
  return result;
}
function assertPrivateZones(duel:TagDuel):void{
  for(const seat of [0,1,2,3] as Seat[]){
    const holder=physicalHolder(duel,seat),prefix='m'+seat+':';
    if(holder.deck.some(card=>!card.uid.startsWith(prefix))||holder.hand.some(card=>!card.uid.startsWith(prefix))){
      throw new Error('Efeito de mão cruzou Deck/mão privado do assento '+seat+'.');
    }
  }
}
function assertPhysicalRules(duel:HandDisruptionSession):void{
  if(duel.mode!=='tag-classic')throw new Error('Interrupção de mão exige TagDuel clássico.');
  assertTagDuel(duel);
  const rules=rulesFor(duel.core);
  if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
    throw new Error('Perfil de regras não corresponde ao Speed RPG clássico.');
  }
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
  }
  const extraUids=new Set<string>();
  for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
  const counts=[0,1,2,3].map(()=>({main:0,extra:0}));
  for(const uid of inventorySnapshot(duel).keys()){
    const seat=physicalSeat(uid);
    if(extraUids.has(uid))counts[seat].extra++;
    else counts[seat].main++;
  }
  for(let seat=0;seat<4;seat++){
    if(counts[seat].main<rules.mainDeckMin||counts[seat].main>rules.mainDeckMax){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(counts[seat].extra>rules.extraDeckMax)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  assertPrivateZones(duel);
}
function findSource(
  duel:HandDisruptionSession,actorSeat:Seat,sourceUid:string,lookup:HandDisruptionLookup
):{sourceCardId:string;sourceOwnerSeat:Seat;effect:HandDisruptionEffect}{
  const team=(actorSeat%2) as Team;
  const source=duel.core.players[team].backrow.find(card=>card.uid===sourceUid);
  if(!source)throw new Error('Carta ativada não está na Spell/Trap Zone da equipe.');
  if(source.faceUp!==true)throw new Error('Carta ativada precisa estar com a face para cima.');
  const ownerSeat=physicalSeat(source.uid);
  if(ownerSeat!==actorSeat)throw new Error('A carta ativada deve pertencer à mão privada do participante ativo.');
  const effect=lookup(source.id);
  if(!effect)throw new Error('Carta não pertence à família de interrupção de mão admitida.');
  const metadata=getPlayableCard(source.id);
  const expectedKind=(effect==='disturbance-strategy'||effect==='mind-crush')?'trap':'spell';
  if(!metadata||metadata.kind!==expectedKind)throw new Error('Tipo da carta ativada não corresponde ao efeito registrado.');
  if((effect==='disturbance-strategy'||effect==='mind-crush')&&source.setTurn>=duel.core.turn){
    throw new Error('Armadilha não pode ser ativada no mesmo turno em que foi Baixada.');
  }
  return {sourceCardId:source.id,sourceOwnerSeat:ownerSeat,effect};
}
function samePlan(a:HandDisruptionPlan,b:HandDisruptionPlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.targetSeat===b.targetSeat&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceCardId===b.sourceCardId&&a.effect===b.effect&&
    JSON.stringify(a.affectedSeats)===JSON.stringify(b.affectedSeats)&&
    a.declaredCardId===b.declaredCardId&&a.declaredName===b.declaredName&&a.lpCostPaid===b.lpCostPaid&&
    a.turn===b.turn&&a.activationCurrent===b.activationCurrent&&a.cursorAtActivation===b.cursorAtActivation;
}
function assertPlanBase(input:HandDisruptionSession,plan:HandDisruptionPlan):void{
  if(!plan||!validActivationId(plan.activationId)||!validSeat(plan.actorSeat)||!validSeat(plan.targetSeat)||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.targetSeat%2===plan.actorTeam||!validSeat(plan.sourceOwnerSeat)||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||typeof plan.sourceCardId!=='string'||!plan.sourceCardId||
    !['disturbance-strategy','confiscation','dragged-down','mind-crush'].includes(plan.effect)||
    !Array.isArray(plan.affectedSeats)||plan.affectedSeats.length!==2||
    !validSeat(plan.affectedSeats[0])||!validSeat(plan.affectedSeats[1])||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    !validTeam(plan.activationCurrent)||!Number.isInteger(plan.cursorAtActivation)||
    plan.cursorAtActivation<0||plan.cursorAtActivation>3||
    !(input.handDisruptionActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de interrupção de mão obsoleto ou inválido.');
  }
  const stored=(input.handDisruptionPending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan))throw new Error('Plano de interrupção de mão não corresponde ao registro imutável.');
  const active=activeSeats(input);
  if(active[0]!==plan.affectedSeats[0]||active[1]!==plan.affectedSeats[1]||
    input.active[plan.actorTeam]!==plan.actorSeat||active[1-plan.actorTeam]!==plan.targetSeat||
    input.cursor!==plan.cursorAtActivation||input.core.current!==plan.activationCurrent){
    throw new Error('Rotação 2v2 mudou antes da resolução de interrupção de mão.');
  }
  if(plan.effect==='mind-crush'){
    const declared=plan.declaredCardId?engineCard(plan.declaredCardId):undefined;
    if(!declared||!plan.declaredName||rulesCardName(declared)!==plan.declaredName){
      throw new Error('Nome declarado de Mind Crush não corresponde ao plano.');
    }
  }
}
function moveToGrave(duel:HandDisruptionSession,ownerSeat:Seat,card:{uid:string;id:string}):void{
  duel.core.players[ownerSeat%2].grave.push({uid:card.uid,id:card.id});
}
function finishSource(duel:HandDisruptionSession,plan:HandDisruptionPlan):void{
  for(const team of [0,1] as Team[]){
    const index=duel.core.players[team].backrow.findIndex(card=>card.uid===plan.sourceUid);
    if(index>=0){
      const [card]=duel.core.players[team].backrow.splice(index,1);
      moveToGrave(duel,physicalSeat(card.uid),card);
      return;
    }
  }
  const alreadyInGrave=duel.core.players.some(player=>player.grave.some(card=>card.uid===plan.sourceUid));
  if(!alreadyInGrave)throw new Error('Carta ativada desapareceu antes de ir ao Cemitério.');
}
function baseReceipt(plan:HandDisruptionPlan):HandDisruptionReceipt{
  return {
    visibility:'public',activationId:plan.activationId,effect:plan.effect,sourceUid:plan.sourceUid,
    actorSeat:plan.actorSeat,targetSeat:plan.targetSeat,status:'resolved',lpCostPaid:plan.lpCostPaid,
    shuffledCount:0,drawnCounts:zeroCounts(),discardedCounts:zeroCounts(),
    discardedCardIds:[],selfDiscardedCardIds:[],deckOutSeats:[]
  };
}
function assertZoneCounts(
  before:Zones,after:Zones,plan:HandDisruptionPlan,receipt:HandDisruptionReceipt
):void{
  for(const seat of [0,1,2,3] as Seat[]){
    let expectedDeck=before[seat].deck,expectedHand=before[seat].hand;
    if(plan.effect==='disturbance-strategy'&&seat===plan.targetSeat){
      // Return N, shuffle, then draw N: hand and Deck sizes are unchanged.
    }else if(plan.effect==='confiscation'&&seat===plan.targetSeat){
      expectedHand-=receipt.discardedCounts[seat];
    }else if(plan.effect==='dragged-down'&&plan.affectedSeats.includes(seat)){
      expectedDeck-=receipt.drawnCounts[seat];
      expectedHand-=receipt.discardedCounts[seat];
      expectedHand+=receipt.drawnCounts[seat];
    }else if(plan.effect==='mind-crush'){
      expectedHand-=receipt.discardedCounts[seat];
    }
    if(after[seat].deck!==expectedDeck||after[seat].hand!==expectedHand){
      throw new Error('Efeito de mão alterou Deck/mão de um assento não autorizado: '+seat+'.');
    }
  }
}
function assertUnchangedZones(before:Zones,after:Zones):void{
  for(const seat of [0,1,2,3] as Seat[]){
    if(before[seat].deck!==after[seat].deck||before[seat].hand!==after[seat].hand){
      throw new Error('Efeito negado alterou Deck/mão do assento '+seat+'.');
    }
  }
}

/** Registers one of the four historical hand-disruption effects. */
export function activateHandDisruption(
  input:HandDisruptionSession,event:HandDisruptionEvent,lookup:HandDisruptionLookup=defaultLookup
):HandDisruptionActivation{
  assertPhysicalRules(input);
  if(input.core.phase==='finished')throw new Error('Duelo encerrado.');
  if(!event||!validActivationId(event.activationId)||!validSeat(event.actorSeat)||
    typeof event.sourceUid!=='string'||!event.sourceUid){
    throw new Error('Evento de interrupção de mão inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(input.active[actorTeam]!==event.actorSeat)throw new Error('Somente o participante ativo da equipe pode ativar a carta.');
  if((input.handDisruptionActivationIds??[]).includes(event.activationId))throw new Error('Esta ativação já foi registrada.');
  const source=findSource(input,event.actorSeat,event.sourceUid,lookup);
  const targetSeat=input.active[1-actorTeam] as Seat;
  const actorHolder=physicalHolder(input,event.actorSeat),targetHolder=physicalHolder(input,targetSeat);
  if(source.effect==='disturbance-strategy'&&targetHolder.hand.length===0)throw new Error('Disturbance Strategy exige mão adversária não vazia.');
  if(source.effect==='confiscation'&&(input.core.players[actorTeam].lp<=1000||targetHolder.hand.length===0)){
    throw new Error('Confiscation exige mais de 1000 LP e uma carta na mão adversária.');
  }
  if(source.effect==='dragged-down'&&(actorHolder.hand.length===0||targetHolder.hand.length===0)){
    throw new Error('Dragged Down exige ao menos uma carta em cada mão ativa.');
  }
  let declaredName:string|undefined;
  if(source.effect==='mind-crush'){
    if(typeof event.declaredCardId!=='string')throw new Error('Mind Crush exige declarar um nome de carta.');
    const declared=engineCard(event.declaredCardId);
    if(!declared)throw new Error('Nome declarado de Mind Crush não existe no catálogo histórico.');
    declaredName=rulesCardName(declared);
  }else if(event.declaredCardId!==undefined){
    throw new Error('Somente Mind Crush recebe nome declarado.');
  }
  const lpCostPaid=source.effect==='confiscation'?1000:0;
  const plan:HandDisruptionPlan=Object.freeze({
    ...event,actorTeam,targetSeat,sourceOwnerSeat:source.sourceOwnerSeat,sourceCardId:source.sourceCardId,
    effect:source.effect,affectedSeats:Object.freeze(activeSeats(input)) as unknown as [Seat,Seat],
    ...(declaredName?{declaredName}:{}),lpCostPaid,turn:input.core.turn,
    activationCurrent:input.core.current as Team,cursorAtActivation:input.cursor
  });
  const next=structuredClone(input) as HandDisruptionSession;
  if(lpCostPaid)next.core.players[actorTeam].lp-=lpCostPaid;
  next.handDisruptionActivationIds=[...(next.handDisruptionActivationIds??[]),event.activationId];
  next.handDisruptionPending=[...(next.handDisruptionPending??[]),plan];
  assertPhysicalRules(next);
  return {status:'triggered',state:next,plan};
}

/** Resolves only the active pair; partner hands/Decks remain private and untouched. */
export function resolveHandDisruption(
  input:HandDisruptionSession,plan:HandDisruptionPlan,choices:HandDisruptionChoices={},effectNegated=false
):HandDisruptionResolution{
  assertPhysicalRules(input);
  if(plan&&typeof plan.activationId==='string'&&(input.handDisruptionResolvedIds??[]).includes(plan.activationId)){
    return {status:'duplicate',state:input,receipt:null};
  }
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean'||!choices||typeof choices!=='object'||Array.isArray(choices)){
    throw new Error('Escolhas ou estado de negação inválidos.');
  }
  if(effectNegated&&Object.keys(choices).length)throw new Error('Efeito negado não pode conter escolhas.');
  const before=inventorySnapshot(input),beforeZones=zoneCounts(input);
  const logBefore=JSON.stringify(input.core.log),randomBefore=input.core.random?.counter??0;
  const next=structuredClone(input) as HandDisruptionSession;
  const receipt=baseReceipt(plan);
  let privateView:PrivateHandView|undefined;

  if(!effectNegated&&plan.effect==='disturbance-strategy'){
    const target=physicalHolder(next,plan.targetSeat),count=target.hand.length;
    target.deck.push(...target.hand.splice(0,target.hand.length));
    shuffleDuel(target.deck,next.core);
    target.hand.push(...target.deck.splice(0,count));
    receipt.shuffledCount=count;
    receipt.drawnCounts[plan.targetSeat]=count;
  }

  if(!effectNegated&&plan.effect==='confiscation'){
    const target=physicalHolder(next,plan.targetSeat);
    privateView={
      visibility:'actor-team',viewerTeam:plan.actorTeam,targetSeat:plan.targetSeat,
      cards:target.hand.map(card=>({
        uid:card.uid,id:card.id,name:engineCard(card.id)?.englishName??card.id
      }))
    };
    if(typeof choices.selectedUid!=='string')throw new Error('Confiscation exige selecionar uma carta da mão adversária.');
    const index=target.hand.findIndex(card=>card.uid===choices.selectedUid);
    if(index<0)throw new Error('Carta escolhida para Confiscation não está mais na mão adversária.');
    const [discarded]=target.hand.splice(index,1);
    moveToGrave(next,plan.targetSeat,discarded);
    receipt.discardedCounts[plan.targetSeat]=1;
    receipt.discardedCardIds.push(discarded.id);
  }

  if(!effectNegated&&plan.effect==='dragged-down'){
    const actor=physicalHolder(next,plan.actorSeat),target=physicalHolder(next,plan.targetSeat);
    if(typeof choices.actorSelectedUid!=='string'||typeof choices.opponentSelectedUid!=='string'){
      throw new Error('Dragged Down exige uma escolha de cada jogador.');
    }
    const actorIndex=actor.hand.findIndex(card=>card.uid===choices.opponentSelectedUid);
    const targetIndex=target.hand.findIndex(card=>card.uid===choices.actorSelectedUid);
    if(actorIndex<0||targetIndex<0)throw new Error('Dragged Down recebeu escolhas da mão errada ou obsoletas.');
    receipt.revealedHands=[
      {seat:plan.actorSeat,cardIds:actor.hand.map(card=>card.id)},
      {seat:plan.targetSeat,cardIds:target.hand.map(card=>card.id)}
    ];
    const [fromTarget]=target.hand.splice(targetIndex,1);
    const [fromActor]=actor.hand.splice(actorIndex,1);
    moveToGrave(next,plan.targetSeat,fromTarget);
    moveToGrave(next,plan.actorSeat,fromActor);
    receipt.discardedCounts[plan.targetSeat]=1;
    receipt.discardedCounts[plan.actorSeat]=1;
    receipt.discardedCardIds.push(fromTarget.id,fromActor.id);
    for(const seat of plan.affectedSeats){
      const holder=physicalHolder(next,seat),drawn=holder.deck.splice(0,Math.min(1,holder.deck.length));
      holder.hand.push(...drawn);
      receipt.drawnCounts[seat]=drawn.length;
      if(drawn.length===0)receipt.deckOutSeats.push(seat);
    }
    if(receipt.deckOutSeats.length)receipt.status='deckout-pending';
  }

  if(!effectNegated&&plan.effect==='mind-crush'){
    const target=physicalHolder(next,plan.targetSeat),actor=physicalHolder(next,plan.actorSeat);
    const matching=target.hand.filter(card=>{
      const metadata=engineCard(card.id);
      return !!metadata&&rulesCardName(metadata)===plan.declaredName;
    });
    receipt.declaredName=plan.declaredName;
    if(matching.length){
      const matched=new Set(matching.map(card=>card.uid));
      const discarded=target.hand.filter(card=>matched.has(card.uid));
      target.hand=target.hand.filter(card=>!matched.has(card.uid));
      for(const card of discarded)moveToGrave(next,plan.targetSeat,card);
      receipt.discardedCounts[plan.targetSeat]=discarded.length;
      receipt.discardedCardIds.push(...discarded.map(card=>card.id));
    }else if(actor.hand.length){
      const index=randomIndex(next.core.random,actor.hand.length);
      const [discarded]=actor.hand.splice(index,1);
      moveToGrave(next,plan.actorSeat,discarded);
      receipt.discardedCounts[plan.actorSeat]=1;
      receipt.selfDiscardedCardIds.push(discarded.id);
    }
  }

  finishSource(next,plan);
  next.handDisruptionPending=(next.handDisruptionPending??[]).filter(item=>item.activationId!==plan.activationId);
  next.handDisruptionResolvedIds=[...(next.handDisruptionResolvedIds??[]),plan.activationId];
  assertSameInventory(before,next);
  if(effectNegated)assertUnchangedZones(beforeZones,zoneCounts(next));
  else assertZoneCounts(beforeZones,zoneCounts(next),plan,receipt);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore)throw new Error('Efeito de mão publicou informação privada no log.');
  if((next.core.random?.counter??0)<randomBefore)throw new Error('Fluxo de sorteio retrocedeu.');
  return {
    status:receipt.status==='effect-negated'?'negated':receipt.status==='deckout-pending'?'deckout-pending':'resolved',
    state:next,receipt,...(privateView?{privateView}:{})
  };
}
