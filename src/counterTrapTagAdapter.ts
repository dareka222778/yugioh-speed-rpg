import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';
export const GRYPHON_WING_ID='55608151';
export const TRAP_JAMMER_ID='19252988';
export const HARPIE_FEATHER_DUSTER_ID='18144506';
export type CounterTrapAction={kind:'trap';card:string;target:string};
export type CounterTrapCardKind='spell'|'trap'|'monster';
export type CounterTrapCardLookup=(id:string)=>{kind:CounterTrapCardKind}|undefined;
type Team=0|1;
type ResponseRef={kind:'pending'|'chain';actor:number;card:string;id:string};
type Activation={activationId:string;sourceUid:string;sourceId:string;sourceOwnerSeat:number;controllerTeam:Team;controllerSeat:number;turn:number;response:ResponseRef};
export type CounterTrapSession={duel:TagDuel;pending:Record<string,Activation>;resolved:string[];negatedPendingEffects:string[]};
export type CounterTrapResolution={activationId:string;cardId:string;sourceActivationNegated:boolean;effectApplied:boolean;targetActivationNegated:boolean;targetEffectNegated:boolean;pendingEffectNegated:boolean;destroyedUids:string[];sourceSentToGrave:boolean};
function physicalSeat(uid:string):number{const m=/^m([0-3]):/.exec(uid);if(!m)throw new Error('UID físico 2v2 inválido: '+uid);return Number(m[1]);}
function assertClassicShape(d:TagDuel):void{if(!d||d.mode!=='tag-classic'||!d.core||!Array.isArray(d.core.players)||d.core.players.length!==2||!Array.isArray(d.active)||d.active.length!==2||!Array.isArray(d.members)||d.members.length!==4||!Array.isArray(d.core.chain)||!d.reserves)throw new Error('Estado TagDuel clássico inválido.');}
function inventorySnapshot(d:TagDuel):Map<string,string>{const out=new Map<string,string>();for(const c of tagInventory(d).filter(x=>x.entityKind!=='token')){if(out.has(c.uid))throw new Error('UID físico duplicado: '+c.uid);physicalSeat(c.uid);out.set(c.uid,c.id);}return out;}
function handSnapshot(d:TagDuel):string[]{const out:string[]=[];for(const p of d.core.players)for(const c of p.hand)out.push(c.uid);for(const h of Object.values(d.reserves))for(const c of h.hand)out.push(c.uid);return out.sort();}
function assertSameInventory(before:Map<string,string>,d:TagDuel):void{const after=inventorySnapshot(d);if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);}
function assertPhysicalRules(d:TagDuel):void{
 assertClassicShape(d);const all=inventorySnapshot(d),extra=new Set<string>(),extras=[0,0,0,0];
 for(let team=0;team<2;team++){const p=d.core.players[team];if(p.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');if(p.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');for(const c of p.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}}
 for(const [seat,h] of Object.entries(d.reserves)){for(const c of h.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}if(!/^\d$/.test(seat))throw new Error('Assento físico de reserva inválido.');}
 const main=[0,0,0,0];for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
 for(let seat=0;seat<4;seat++){if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');}
 // The six-card hand limit is checked at End Phase; this adapter never changes hands.
}
function responseFor(id:string,team:Team,core:DuelState,lookup:CounterTrapCardLookup):ResponseRef|undefined{
 const opponent=1-team,last=core.chain.at(-1);
 if(id===GRYPHON_WING_ID){
  if(last&&last.id===HARPIE_FEATHER_DUSTER_ID&&last.actor===opponent&&lookup(last.id)?.kind==='spell')return {kind:'chain',actor:last.actor,card:last.card,id:last.id};
  if(!last&&core.pending.kind==='spell'&&core.pending.id===HARPIE_FEATHER_DUSTER_ID&&core.pending.actor===opponent)return {kind:'pending',actor:core.pending.actor,card:core.pending.card,id:core.pending.id};
  return;
 }
 if(id===TRAP_JAMMER_ID){
  if(core.resume!=='battle'||!last||last.actor!==opponent||lookup(last.id)?.kind!=='trap')return;
  if(!core.players[opponent].backrow.some(c=>c.uid===last.card&&c.faceUp))return;
  return {kind:'chain',actor:last.actor,card:last.card,id:last.id};
 }
 return;
}
function findLink(core:DuelState,r:ResponseRef){if(r.kind!=='chain')return;return core.chain.find(l=>l.actor===r.actor&&l.card===r.card&&l.id===r.id);}
function removeControlled(core:DuelState,team:Team,uid:string){const p=core.players[team],i=p.backrow.findIndex(c=>c.uid===uid);if(i>=0)return p.backrow.splice(i,1)[0];if(p.field?.uid===uid){const f=p.field;p.field=null;return f;}return;}
function moveToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 if(core.players.some(p=>p.grave.some(c=>c.uid===uid)))return false;
 const c=removeControlled(core,controller,uid);if(!c)return false;
 core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:c.uid,id:c.id});return true;
}
function destroyOpponentBackrow(core:DuelState,opponent:Team,lookup:CounterTrapCardLookup):string[]{
 const p=core.players[opponent],cards=[...p.backrow,...(p.field?[p.field]:[])];
 for(const c of cards){const kind=lookup(c.id)?.kind;if(kind!=='spell'&&kind!=='trap')throw new Error('Carta de backrow sem classificação verificável: '+c.id);}
 const moved:string[]=[];for(const c of cards)if(moveToOwnerGrave(core,opponent,c.uid))moved.push(c.uid);return moved;
}
function sourceCard(d:TagDuel,team:Team,uid:string){return d.core.players[team].backrow.find(c=>c.uid===uid);}
export function createCounterTrapSession(duel:TagDuel):CounterTrapSession{assertPhysicalRules(duel);return {duel:structuredClone(duel),pending:{},resolved:[],negatedPendingEffects:[]};}
export function counterTrapActions(duel:TagDuel,lookup:CounterTrapCardLookup):CounterTrapAction[]{
 assertClassicShape(duel);const c=duel.core;if(c.phase!=='response'||(c.priority!==0&&c.priority!==1))return [];
 const team=c.priority as Team,seat=duel.active[team];if(duel.members[seat]?.team!==team)return [];
 return c.players[team].backrow.filter(x=>x.id===GRYPHON_WING_ID||x.id===TRAP_JAMMER_ID)
  .filter(x=>!x.faceUp&&Number.isSafeInteger(x.setTurn)&&x.setTurn<c.turn)
  .filter(x=>!!responseFor(x.id,team,c,lookup)).map(x=>({kind:'trap',card:x.uid,target:''}));
}
export function activateCounterTrap(input:CounterTrapSession,sourceUid:string,activationId:string,lookup:CounterTrapCardLookup):CounterTrapSession{
 if(!activationId||input.pending[activationId]||input.resolved.includes(activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertPhysicalRules(input.duel);const team=input.duel.core.priority;if(team!==0&&team!==1)throw new Error('Equipe sem prioridade de resposta.');
 if(!counterTrapActions(input.duel,lookup).some(a=>a.card===sourceUid))throw new Error('A Armadilha não está legal para a janela de resposta atual.');
 const source=sourceCard(input.duel,team as Team,sourceUid);if(!source||source.faceUp||source.setTurn>=input.duel.core.turn)throw new Error('Armadilha não está Set e liberada para ativação.');
 const response=responseFor(source.id,team as Team,input.duel.core,lookup);if(!response)throw new Error('A Armadilha não corresponde à ativação adversária atual.');
 const owner=physicalSeat(sourceUid);if(owner%2!==team)throw new Error('A Armadilha não pertence fisicamente à equipe controladora.');
 const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input),nsource=sourceCard(next.duel,team as Team,sourceUid);
 if(!nsource)throw new Error('A Armadilha saiu do campo antes do registro.');
 nsource.faceUp=true;next.duel.core.chain.push({actor:team,card:sourceUid,id:source.id,target:''});next.duel.core.priority=1-team;next.duel.core.passes=0;
 next.pending[activationId]={activationId,sourceUid,sourceId:source.id,sourceOwnerSeat:owner,controllerTeam:team as Team,controllerSeat:next.duel.active[team],turn:next.duel.core.turn,response};
 assertSameInventory(before,next.duel);assertPhysicalRules(next.duel);if(JSON.stringify(hands)!==JSON.stringify(handSnapshot(next.duel)))throw new Error('Ativar Armadilha não pode alterar mãos.');
 return next;
}
export function resolveCounterTrap(input:CounterTrapSession,activationId:string,lookup:CounterTrapCardLookup,sourceActivationNegated=false):{session:CounterTrapSession;result:CounterTrapResolution}{
 const a=input.pending[activationId];if(!a||input.resolved.includes(activationId))throw new Error('Ativação de Armadilha ausente ou já resolvida.');
 assertPhysicalRules(input.duel);const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const own=core.chain.findIndex(l=>l.actor===a.controllerTeam&&l.card===a.sourceUid&&l.id===a.sourceId);if(own!==core.chain.length-1)throw new Error('A Armadilha só pode resolver no topo da corrente.');core.chain.pop();
 let effectApplied=false,targetActivationNegated=false,targetEffectNegated=false,pendingEffectNegated=false;const destroyedUids:string[]=[];
 if(!sourceActivationNegated){
  if(a.sourceId===GRYPHON_WING_ID){
   if(a.response.kind==='pending'){
    const p=core.pending;if(core.chain.length===0&&p.kind==='spell'&&p.actor===a.response.actor&&p.card===a.response.card&&p.id===a.response.id&&!core.pendingNegated&&!next.negatedPendingEffects.includes(activationId)){next.negatedPendingEffects.push(activationId);pendingEffectNegated=true;}
   }else{const target=findLink(core,a.response);if(target&&core.chain.at(-1)===target&&!target.negated){target.negated=true;targetEffectNegated=true;}}
   effectApplied=pendingEffectNegated||targetEffectNegated;if(effectApplied)destroyedUids.push(...destroyOpponentBackrow(core,(1-a.controllerTeam) as Team,lookup));
  }else if(a.sourceId===TRAP_JAMMER_ID&&a.response.kind==='chain'){
   const target=findLink(core,a.response);if(target&&core.chain.at(-1)===target&&!target.negated){target.negated=true;targetActivationNegated=true;effectApplied=true;if(moveToOwnerGrave(core,(1-a.controllerTeam) as Team,target.card))destroyedUids.push(target.card);}
  }
 }
 const sourceSentToGrave=moveToOwnerGrave(core,a.controllerTeam,a.sourceUid);delete next.pending[activationId];next.resolved.push(activationId);
 assertSameInventory(before,next.duel);assertPhysicalRules(next.duel);if(JSON.stringify(hands)!==JSON.stringify(handSnapshot(next.duel)))throw new Error('Resolver de Armadilha não pode alterar mãos.');
 return {session:next,result:{activationId,cardId:a.sourceId,sourceActivationNegated,effectApplied,targetActivationNegated,targetEffectNegated,pendingEffectNegated,destroyedUids,sourceSentToGrave}};
}
