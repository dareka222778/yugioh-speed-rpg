import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';

export const JAR_ROBBER_ID='33784505';
export const JAR_ROBBER_KONAMI_CID=5674;
export const AVATAR_OF_THE_POT_ID='99284890';
export const AVATAR_OF_THE_POT_KONAMI_CID=5960;
export const POT_OF_GREED_ID='55144522';
export const POT_OF_GREED_KONAMI_CID=4844;

export type PotSynergyTeam=0|1;
export type PotSynergySeat=0|1|2|3;
type PhysicalCard=ReturnType<typeof tagInventory>[number];
type Monster=TagDuel['core']['players'][number]['monsters'][number];
type Backrow=TagDuel['core']['players'][number]['backrow'][number];

export type PotSynergyLookups=Readonly<{
 jarRobber:(id:string)=>boolean;
 avatarOfThePot:(id:string)=>boolean;
 potOfGreed:(id:string)=>boolean;
}>;
export function createExactPotSynergyLookups():PotSynergyLookups{
 return {
  jarRobber:id=>id===JAR_ROBBER_ID,
  avatarOfThePot:id=>id===AVATAR_OF_THE_POT_ID,
  potOfGreed:id=>id===POT_OF_GREED_ID
 };
}

export type PotOfGreedActivation=Readonly<{
 eventId:string;
 sequence:number;
 actorSeat:PotSynergySeat;
 phase:'main1'|'main2';
 sourceUid:string;
 sourceLocation:'hand'|'backrow';
}>;
export type JarRobberResponseEvent=Readonly<{
 kind:'jar-robber-response';
 responseId:string;
 sequence:number;
 potActivation:PotOfGreedActivation;
 jarActorSeat:PotSynergySeat;
 jarSourceUid:string;
 jarSourceLocation:'hand'|'backrow';
 chainIndex:2;
 previousLinkId:string;
}>;
export type AvatarOfThePotActivationEvent=Readonly<{
 kind:'avatar-of-the-pot-activation';
 eventId:string;
 sequence:number;
 actorSeat:PotSynergySeat;
 phase:'main1'|'main2';
 avatarUid:string;
 costUid:string;
}>;
export type PotSynergyEvent=JarRobberResponseEvent|AvatarOfThePotActivationEvent;
export type PotSynergyKind='jar-robber'|'avatar-of-the-pot';

export type PotSynergyPending=Readonly<{
 event:PotSynergyEvent;
 eventId:string;
 kind:PotSynergyKind;
 fingerprint:string;
 recipientSeat:PotSynergySeat;
 sourceUid:string;
 costUid?:string;
 potActivationId?:string;
}>;
export type PotSynergyProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 choiceFingerprint:string;
 potActivationId?:string;
}>;
export type PotSynergyLedger=Readonly<{
 version:1;
 lastSequence:number;
 pending:readonly PotSynergyPending[];
 processed:readonly PotSynergyProcessed[];
}>;
export type PotSynergyPlan=Readonly<{
 eventId:string;
 kind:PotSynergyKind;
 recipientSeat:PotSynergySeat;
 requestedDrawCount:1|3;
 actualDrawCount:number;
 deckCountAtPlan:number;
 handCountAtPlan:number;
 deckOut:boolean;
 negatesEffectOfActivationId?:string;
 negatesActivation:false;
 costUid?:string;
 costCommitted:boolean;
}>;
export type PotSynergyResolution=Readonly<{
 status:'pending-resolution'|'duplicate'|'resolved'|'effect-negated'|'deck-out';
 ledger:PotSynergyLedger;
 plan:PotSynergyPlan|null;
}>;

const isSeat=(value:unknown):value is PotSynergySeat=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;
function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}
function physicalSeat(uid:string):PotSynergySeat|null{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 return match?Number(match[1]) as PotSynergySeat:null;
}
function ownerOfUid(state:TagDuel,uid:string):PotSynergySeat{
 const seat=physicalSeat(uid);
 if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');
 return seat;
}
function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||
  !Array.isArray(state.core.chain)||!state.reserves)throw new Error('Pot synergy exige TagDuel clássico 2v2.');
 assertTagDuel(state);
 if(new Set(state.members.map(member=>member.id)).size!==4||
  state.members.some((member,index)=>!member.id||member.team!==index%2)||
  state.active.some((seat,team)=>!isSeat(seat)||seat%2!==team)||
  state.active[state.cursor%2]!==state.cursor||
  state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.core.players.some((player,team)=>player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
   !Array.isArray(player.hand)||!Array.isArray(player.deck)||!Array.isArray(player.backrow)||!Array.isArray(player.grave))){
  throw new Error('Rotação, assentos físicos, mãos privadas ou zonas compartilhadas inconsistentes.');
 }
}
export function assertPotSynergyRules(state:TagDuel):void{
 assertClassicShape(state);
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const all=tagInventory(state).filter(card=>card.entityKind!=='token');
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(state.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const card of all){
  const seat=ownerOfUid(state,card.uid);
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[seat]++;
  else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // The Field Zone remains separate from the three shared Spell/Trap Zones.
}
function holder(state:TagDuel,seat:PotSynergySeat){
 const team=(seat%2) as PotSynergyTeam;
 const held=state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
 if(!held)throw new Error('Mão/Deck físico do participante não está disponível.');
 return held;
}
function findPhysical(state:TagDuel,uid:string,lookup:(id:string)=>boolean,label:string):PhysicalCard{
 assertText(uid,'UID físico');
 const found=tagInventory(state).filter(card=>card.uid===uid);
 if(found.length!==1)throw new Error('UID físico precisa corresponder a uma única carta.');
 if(!lookup(found[0].id))throw new Error(label+' não corresponde à identidade registrada pelo resolver.');
 ownerOfUid(state,uid);
 return found[0];
}
function findMonster(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:PotSynergyTeam;card:Monster}|null{
 const found:{team:PotSynergyTeam;card:Monster}[]=[];
 for(const team of [0,1] as const)for(const card of state.core.players[team].monsters){
  if(card.uid===uid&&lookup(card.id))found.push({team,card});
 }
 if(found.length>1)throw new Error('UID duplicado de Avatar of the Pot no campo.');
 return found[0]??null;
}
function findBackrow(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:PotSynergyTeam;card:Backrow}|null{
 const found:{team:PotSynergyTeam;card:Backrow}[]=[];
 for(const team of [0,1] as const)for(const card of state.core.players[team].backrow){
  if(card.uid===uid&&lookup(card.id))found.push({team,card});
 }
 if(found.length>1)throw new Error('UID duplicado de Quick-Play/Normal Spell na backrow.');
 return found[0]??null;
}
function assertLookups(lookups:PotSynergyLookups):void{
 if(!lookups||typeof lookups.jarRobber!=='function'||typeof lookups.avatarOfThePot!=='function'||
  typeof lookups.potOfGreed!=='function')throw new Error('Lookups Pot synergy inválidos.');
}
function assertPotActivation(state:TagDuel,pot:PotOfGreedActivation,lookups:PotSynergyLookups):void{
 assertText(pot?.eventId,'ID da ativação Pot of Greed');
 if(!Number.isSafeInteger(pot.sequence)||pot.sequence<1||!isSeat(pot.actorSeat)||
  state.active[pot.actorSeat%2]!==pot.actorSeat||(pot.phase!=='main1'&&pot.phase!=='main2')){
  throw new Error('Ativação Pot of Greed fora da Main Phase/assento ativo.');
 }
 if(pot.sourceLocation==='hand'){
  const source=findPhysical(state,pot.sourceUid,lookups.potOfGreed,'Pot of Greed');
  const inHand=holder(state,pot.actorSeat).hand.some(card=>card.uid===source.uid);
  const activeBackrow=findBackrow(state,source.uid,lookups.potOfGreed);
  if(ownerOfUid(state,source.uid)!==pot.actorSeat||
   (!inHand&&(!activeBackrow||activeBackrow.team!==pot.actorSeat%2||activeBackrow.card.faceUp!==true))){
   throw new Error('Pot of Greed ativado da mão precisa pertencer ao assento físico ativo.');
  }
 }else if(pot.sourceLocation==='backrow'){
  const found=findBackrow(state,pot.sourceUid,lookups.potOfGreed);
  // Normal Spells may be Set and activated in the same turn; Quick-Play restrictions do not apply.
  if(!found||found.team!==pot.actorSeat%2||found.card.faceUp!==true||found.card.setTurn>state.core.turn){
   throw new Error('Pot of Greed ativado da backrow precisa estar face-up e ter sido setado até o turno atual.');
  }
 }else throw new Error('Origem de Pot of Greed inválida.');
}
function assertJarRobberEvent(state:TagDuel,event:JarRobberResponseEvent,lookups:PotSynergyLookups):void{
 assertText(event?.responseId,'ID da resposta Jar Robber');assertPotActivation(state,event.potActivation,lookups);
 if(!Number.isSafeInteger(event.sequence)||event.sequence<=event.potActivation.sequence||
  !isSeat(event.jarActorSeat)||state.active[event.jarActorSeat%2]!==event.jarActorSeat||
  event.responseId===event.potActivation.eventId||event.chainIndex!==2||event.previousLinkId!==event.potActivation.eventId){
  throw new Error('Jar Robber precisa responder diretamente ao Chain Link 1 de Pot of Greed.');
 }
 if(event.jarSourceLocation==='hand'){
  const source=findPhysical(state,event.jarSourceUid,lookups.jarRobber,'Jar Robber');
  const inHand=holder(state,event.jarActorSeat).hand.some(card=>card.uid===source.uid);
  const activeBackrow=findBackrow(state,source.uid,lookups.jarRobber);
  if(event.jarActorSeat!==event.potActivation.actorSeat||ownerOfUid(state,source.uid)!==event.jarActorSeat||
   (!inHand&&(!activeBackrow||activeBackrow.team!==event.jarActorSeat%2||activeBackrow.card.faceUp!==true))){
   throw new Error('Jar Robber da mão só pode ser ativado pelo assento físico ativo no próprio turno.');
  }
 }else if(event.jarSourceLocation==='backrow'){
  const found=findBackrow(state,event.jarSourceUid,lookups.jarRobber);
  if(!found||found.team!==event.jarActorSeat%2||found.card.faceUp!==true||found.card.setTurn>=state.core.turn){
   throw new Error('Jar Robber set precisa estar face-up e ter sido setado em turno anterior.');
  }
 }else throw new Error('Origem de Jar Robber inválida.');
}
function assertAvatarEvent(state:TagDuel,event:AvatarOfThePotActivationEvent,lookups:PotSynergyLookups):void{
 assertText(event?.eventId,'ID da ativação Avatar of the Pot');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!isSeat(event.actorSeat)||
  state.active[event.actorSeat%2]!==event.actorSeat||(event.phase!=='main1'&&event.phase!=='main2')){
  throw new Error('Avatar of the Pot exige assento ativo na Main Phase.');
 }
 const source=findMonster(state,event.avatarUid,lookups.avatarOfThePot);
 if(!source||source.team!==event.actorSeat%2||source.card.faceUp!==true){
  throw new Error('Avatar of the Pot precisa estar face-up no campo da equipe ativa.');
 }
 const cost=findPhysical(state,event.costUid,lookups.potOfGreed,'Pot of Greed');
 if(ownerOfUid(state,cost.uid)!==event.actorSeat||!holder(state,event.actorSeat).hand.some(card=>card.uid===cost.uid)){
  throw new Error('O custo Pot of Greed deve vir da mão privada do assento ativo.');
 }
}
function eventIdOf(event:PotSynergyEvent):string{return event.kind==='jar-robber-response'?event.responseId:event.eventId;}
function eventFingerprint(event:PotSynergyEvent):string{return createHash('sha256').update(JSON.stringify(event)).digest('hex');}
function choiceFingerprint(effectNegated:boolean):string{return createHash('sha256').update(JSON.stringify({effectNegated})).digest('hex');}
function assertLedger(ledger:PotSynergyLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.pending)||ledger.pending.length>1||!Array.isArray(ledger.processed)||
  ledger.pending.some(item=>!item||!item.event||typeof item.eventId!=='string'||!item.eventId.trim()||
   !['jar-robber','avatar-of-the-pot'].includes(item.kind)||!/^[a-f0-9]{64}$/.test(item.fingerprint)||
   !isSeat(item.recipientSeat)||typeof item.sourceUid!=='string'||(item.kind==='avatar-of-the-pot'&&typeof item.costUid!=='string'))||
  ledger.processed.some(item=>!item||typeof item.eventId!=='string'||!item.eventId.trim()||
   !/^[a-f0-9]{64}$/.test(item.fingerprint)||!/^[a-f0-9]{64}$/.test(item.choiceFingerprint))||
  new Set(ledger.processed.map(item=>item.eventId)).size!==ledger.processed.length||
  new Set(ledger.pending.map(item=>item.eventId)).size!==ledger.pending.length){
  throw new Error('Ledger Pot synergy inválido.');
 }
}
export function createPotSynergyLedger():PotSynergyLedger{return {version:1,lastSequence:0,pending:[],processed:[]};}
export function capturePotSynergyEvent(state:TagDuel,ledger:PotSynergyLedger,event:PotSynergyEvent,
 lookups:PotSynergyLookups):PotSynergyResolution{
 assertLedger(ledger);assertPotSynergyRules(state);assertLookups(lookups);
 if(!event||typeof event!=='object')throw new Error('Evento Pot synergy inválido.');
 const eventId=eventIdOf(event);assertText(eventId,'ID do evento Pot synergy');
 const fingerprint=eventFingerprint(event);
 const prior=ledger.processed.find(item=>item.eventId===eventId);
 if(prior){
  if(prior.fingerprint!==fingerprint)throw new Error('ID de evento Pot synergy reutilizado com conteúdo diferente.');
  return {status:'duplicate',ledger,plan:null};
 }
 const pending=ledger.pending.find(item=>item.eventId===eventId);
 if(pending){
  if(pending.fingerprint!==fingerprint)throw new Error('ID de evento Pot synergy pendente reutilizado com conteúdo diferente.');
  return {status:'pending-resolution',ledger,plan:null};
 }
 if(ledger.pending.length)throw new Error('Resolva o evento Pot synergy pendente antes de capturar outro.');
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequence Pot synergy precisa ser estritamente crescente.');
 if(event.kind==='jar-robber-response'){
  assertJarRobberEvent(state,event,lookups);
  if(ledger.processed.some(item=>item.potActivationId===event.potActivation.eventId)){
   throw new Error('Pot of Greed já recebeu resposta Jar Robber nesta janela.');
  }
  const next:PotSynergyLedger={...ledger,lastSequence:event.sequence,pending:[{
   event,eventId,kind:'jar-robber',fingerprint,recipientSeat:event.jarActorSeat,
   sourceUid:event.jarSourceUid,potActivationId:event.potActivation.eventId
  }]};
  return {status:'pending-resolution',ledger:next,plan:null};
 }
 if(event.kind==='avatar-of-the-pot-activation'){
  assertAvatarEvent(state,event,lookups);
  const next:PotSynergyLedger={...ledger,lastSequence:event.sequence,pending:[{
   event,eventId,kind:'avatar-of-the-pot',fingerprint,recipientSeat:event.actorSeat,
   sourceUid:event.avatarUid,costUid:event.costUid
  }]};
  return {status:'pending-resolution',ledger:next,plan:null};
 }
 throw new Error('Tipo de evento Pot synergy desconhecido.');
}
export function resolvePotSynergyEvent(state:TagDuel,ledger:PotSynergyLedger,input:{
 eventId:string;effectNegated:boolean;
},lookups:PotSynergyLookups):PotSynergyResolution{
 assertLedger(ledger);assertPotSynergyRules(state);assertLookups(lookups);
 assertText(input?.eventId,'ID do evento Pot synergy');
 if(typeof input.effectNegated!=='boolean')throw new Error('Estado de negação Pot synergy inválido.');
 const choice=choiceFingerprint(input.effectNegated),prior=ledger.processed.find(item=>item.eventId===input.eventId);
 if(prior){
  if(prior.choiceFingerprint!==choice)throw new Error('Evento Pot synergy resolvido novamente com estado de negação diferente.');
  return {status:'duplicate',ledger,plan:null};
 }
 const pending=ledger.pending.find(item=>item.eventId===input.eventId);
 if(!pending)throw new Error('Evento Pot synergy não está pendente.');
 const recipient=holder(state,pending.recipientSeat);
 const deckCount=recipient.deck.length,handCount=recipient.hand.length;
 let plan:PotSynergyPlan|null=null,status:PotSynergyResolution['status']=input.effectNegated?'effect-negated':'resolved';
 if(pending.kind==='avatar-of-the-pot'){
  const event=pending.event as AvatarOfThePotActivationEvent;
  const grave=state.core.players[event.actorSeat%2].grave;
  if(!grave.some(card=>card.uid===event.costUid)||holder(state,event.actorSeat).hand.some(card=>card.uid===event.costUid)){
   throw new Error('Avatar of the Pot só resolve depois que o custo Pot of Greed foi enviado ao Cemitério.');
  }
  if(!input.effectNegated){
   const actual=Math.min(3,deckCount),deckOut=actual<3;
   plan={eventId:input.eventId,kind:'avatar-of-the-pot',recipientSeat:pending.recipientSeat,
    requestedDrawCount:3,actualDrawCount:actual,deckCountAtPlan:deckCount,handCountAtPlan:handCount,
    deckOut,negatesActivation:false,costUid:pending.costUid,costCommitted:true};
   if(deckOut)status='deck-out';
  }
 }else if(!input.effectNegated){
  plan={eventId:input.eventId,kind:'jar-robber',recipientSeat:pending.recipientSeat,
   requestedDrawCount:1,actualDrawCount:Math.min(1,deckCount),deckCountAtPlan:deckCount,handCountAtPlan:handCount,
   deckOut:deckCount<1,negatesEffectOfActivationId:pending.potActivationId,negatesActivation:false,costCommitted:false};
  if(plan.deckOut)status='deck-out';
 }
 const processed:PotSynergyProcessed={eventId:input.eventId,fingerprint:pending.fingerprint,
  choiceFingerprint:choice,...(pending.potActivationId?{potActivationId:pending.potActivationId}:{})};
 const next:PotSynergyLedger={...ledger,pending:ledger.pending.filter(item=>item.eventId!==input.eventId),
  processed:[...ledger.processed,processed]};
 return {status,ledger:next,plan};
}
