import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {continuousTrapsNegated} from './continuousEffects';
export const CURSE_OF_DARKNESS_ID='84970821';
export const CURSE_OF_DARKNESS_KONAMI_CID=5917;
export type CurseTeam=0|1;
export type CurseSeat=0|1|2|3;
export type CurseSourceLookup=(cardId:string)=>boolean;
export type CurseOfDarknessLedger=Readonly<{version:1;processed:readonly Readonly<{eventId:string;fingerprint:string}>[]}>;
export type SpellResolutionEvent=Readonly<{
 eventId:string;spellUid:string;spellCardId:string;activatingSeat:CurseSeat;
 resolved:boolean;activationNegated:boolean;effectNegated:boolean;
 currentLPByTeam:readonly [number,number];negatedSourceUids?:readonly string[];
}>;
export type CurseOfDarknessDamagePlan=Readonly<{
 eventId:string;sourceUid:string;sourceTeam:CurseTeam;spellUid:string;
 activatingSeat:CurseSeat;targetTeam:CurseTeam;damage:number;lpBefore:number;lpAfter:number;
 reason:'spell-resolved';
}>;
export type CurseOfDarknessResolution=Readonly<{
 status:'triggered'|'no-source'|'not-resolved'|'activation-negated'|'duplicate'|'duel-ended';
 ledger:CurseOfDarknessLedger;plans:readonly CurseOfDarknessDamagePlan[];
}>;
type ActiveSource=Readonly<{uid:string;team:CurseTeam}>;
const isSeat=(v:unknown):v is CurseSeat=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=3;
function assertNonEmpty(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}
function assertCardId(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!/^[0-9]{8}$/.test(value))throw new Error(label+' inválido.');
}
function physicalSeat(uid:string):CurseSeat|null{
 const match=/^m([0-3]):(.+)$/.exec(uid);return match?Number(match[1]) as CurseSeat:null;
}
function assertLedger(ledger:CurseOfDarknessLedger):void{
 if(!ledger||ledger.version!==1||!Array.isArray(ledger.processed)||
  ledger.processed.some(item=>!item||typeof item.eventId!=='string'||!item.eventId.trim()||
   typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint))||
  new Set(ledger.processed.map(item=>item.eventId)).size!==ledger.processed.length){
  throw new Error('Ledger Curse of Darkness inválido.');
 }
}
function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||
  !Array.isArray(state.core.teamRotation.active)||state.core.teamRotation.active.length!==2){
  throw new Error('Curse of Darkness exige TagDuel clássico 2v2.');
 }
 assertTagDuel(state);
 if(new Set(state.members.map(member=>member.id)).size!==4||
  state.members.some((member,index)=>!member.id||member.team!==index%2)||
  state.active.some((seat,team)=>!isSeat(seat)||seat%2!==team)||
  state.active[state.cursor%2]!==state.cursor||
  state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.core.players.some((player,team)=>player.id!=='tag-team-'+team||
   !Number.isSafeInteger(player.lp)||player.lp<0||!Array.isArray(player.backrow)||!Array.isArray(player.grave))){
  throw new Error('Rotação, assentos físicos, LP ou zonas compartilhadas inconsistentes.');
 }
}
function ownerOfUid(state:TagDuel,uid:string):CurseSeat{
 const seat=physicalSeat(uid);
 if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');
 return seat;
}
export function assertCurseOfDarknessRules(state:TagDuel):void{
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(state.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const card of tagInventory(state)){
  if(card.entityKind==='token')continue;
  const seat=ownerOfUid(state,card.uid);
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
}
function assertNegatedUids(values:readonly string[]|undefined):Set<string>{
 const ids=values??[];
 if(!Array.isArray(ids)||ids.some(uid=>typeof uid!=='string'||!uid.trim())||new Set(ids).size!==ids.length){
  throw new Error('Lista de fontes negadas inválida.');
 }
 return new Set(ids);
}
function assertEvent(event:SpellResolutionEvent):void{
 assertNonEmpty(event?.eventId,'ID do evento de resolução Spell');
 assertNonEmpty(event?.spellUid,'UID físico da Magia resolvida');
 assertCardId(event?.spellCardId,'Identidade da Magia resolvida');
 if(!isSeat(event.activatingSeat)||typeof event.resolved!=='boolean'||
  typeof event.activationNegated!=='boolean'||typeof event.effectNegated!=='boolean'||
  !Array.isArray(event.currentLPByTeam)||event.currentLPByTeam.length!==2||
  event.currentLPByTeam.some(lp=>!Number.isSafeInteger(lp)||lp<0)){
  throw new Error('Evento de resolução Spell inválido.');
 }
 if(event.resolved&&event.activationNegated)throw new Error('Uma ativação negada não pode ser registrada como resolvida.');
 assertNegatedUids(event.negatedSourceUids);
}
function assertSpellIdentity(state:TagDuel,event:SpellResolutionEvent):void{
 const matches=tagInventory(state).filter(card=>card.uid===event.spellUid&&card.id===event.spellCardId);
 if(matches.length!==1)throw new Error('A Magia resolvida não corresponde a uma única carta física do inventário.');
 if(getDuelCard(event.spellCardId)?.kind!=='spell')throw new Error('O evento precisa identificar uma Carta de Magia real.');
 ownerOfUid(state,event.spellUid);
 const actorTeam=(event.activatingSeat%2) as CurseTeam;
 if(state.active[actorTeam]!==event.activatingSeat)throw new Error('A Magia deve pertencer ao assento físico ativo de sua equipe.');
}
function activeSources(state:TagDuel,lookup:CurseSourceLookup,negated:Set<string>):ActiveSource[]{
 if(typeof lookup!=='function')throw new Error('Lookup de Curse of Darkness inválido.');
 if(continuousTrapsNegated(state.core))return [];
 const sources:ActiveSource[]=[],seen=new Set<string>();
 for(const team of [0,1] as const){
  for(const card of state.core.players[team].backrow){
   if(!lookup(card.id))continue;
   assertNonEmpty(card.uid,'UID físico de Curse of Darkness');
   if(seen.has(card.uid))throw new Error('UID duplicado de Curse of Darkness.');
   seen.add(card.uid);
   if(card.faceUp===true&&card.resolved===true&&!negated.has(card.uid))sources.push({uid:card.uid,team});
  }
 }
 return sources.sort((a,b)=>a.uid.localeCompare(b.uid));
}
function assertCurrentLP(state:TagDuel,values:readonly [number,number]):void{
 if(state.core.players.some((player,team)=>player.lp!==values[team]))throw new Error('Snapshot de LP obsoleto para Curse of Darkness.');
}
function fingerprint(event:SpellResolutionEvent,sources:readonly ActiveSource[]):string{
 const canonical={event:{...event,currentLPByTeam:[...event.currentLPByTeam],negatedSourceUids:[...(event.negatedSourceUids??[])].sort()},
  sources:sources.map(source=>({uid:source.uid,team:source.team}))};
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function resolution(status:CurseOfDarknessResolution['status'],ledger:CurseOfDarknessLedger,plans:readonly CurseOfDarknessDamagePlan[]=[]):CurseOfDarknessResolution{
 return {status,ledger,plans};
}
export function createCurseOfDarknessLedger():CurseOfDarknessLedger{return {version:1,processed:[]};}
/** Plans the mandatory 1000 LP trigger after a Spell Card has actually resolved.
 * A resolved-but-effect-negated Spell still triggers; a negated activation does not.
 * The physical seat that activated the Spell determines the damaged team. */
export function resolveCurseOfDarknessSpell(
 state:TagDuel,ledger:CurseOfDarknessLedger,event:SpellResolutionEvent,lookup:CurseSourceLookup
):CurseOfDarknessResolution{
 assertLedger(ledger);assertEvent(event);assertClassicShape(state);assertCurseOfDarknessRules(state);assertSpellIdentity(state,event);
 const sources=activeSources(state,lookup,assertNegatedUids(event.negatedSourceUids));
 const hash=fingerprint(event,sources),prior=ledger.processed.find(item=>item.eventId===event.eventId);
 if(prior){
  if(prior.fingerprint!==hash)throw new Error('ID de evento reutilizado com conteúdo diferente.');
  return resolution('duplicate',ledger);
 }
 assertCurrentLP(state,event.currentLPByTeam);
 const next:CurseOfDarknessLedger={version:1,processed:[...ledger.processed,{eventId:event.eventId,fingerprint:hash}]};
 if(event.activationNegated)return resolution('activation-negated',next);
 if(!event.resolved)return resolution('not-resolved',next);
 if(sources.length===0)return resolution('no-source',next);
 const targetTeam=(event.activatingSeat%2) as CurseTeam;
 let remaining=state.core.players[targetTeam].lp;
 if(remaining===0)return resolution('duel-ended',next);
 const plans:CurseOfDarknessDamagePlan[]=[];
 for(const source of sources){
  if(remaining===0)break;
  const damage=Math.min(1000,remaining),lpBefore=remaining;remaining-=damage;
  plans.push({eventId:event.eventId,sourceUid:source.uid,sourceTeam:source.team,spellUid:event.spellUid,
   activatingSeat:event.activatingSeat,targetTeam,damage,lpBefore,lpAfter:remaining,reason:'spell-resolved'});
 }
 return resolution(remaining===0?'duel-ended':'triggered',next,plans);
}
