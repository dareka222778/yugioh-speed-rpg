import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const MAGIC_DRAIN_ID='59344077';
export const CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID='58851034';

export type SpellCounterTrapAction={kind:'trap';card:string;target:''};
export type SpellCounterCardKind='spell'|'trap'|'monster';
export type SpellCounterCardLookup=(id:string)=>{kind:SpellCounterCardKind;name?:string}|undefined;
type Team=0|1;
type ResponseRef={kind:'pending'|'chain';actor:Team;card:string;id:string};
type Activation={
 activationId:string;
 sourceUid:string;
 sourceId:string;
 sourceOwnerSeat:number;
 controllerTeam:Team;
 controllerSeat:number;
 turn:number;
 response:ResponseRef;
 costUid?:string;
};
export type LockedSpellName={team:Team;name:string};
export type SpellCounterTrapSession={
 duel:TagDuel;
 pending:Record<string,Activation>;
 resolved:string[];
 lockedSpellNames:LockedSpellName[];
};
export type SpellCounterTrapResolution={
 activationId:string;
 cardId:string;
 sourceActivationNegated:boolean;
 effectApplied:boolean;
 targetActivationNegated:boolean;
 targetDestroyed:boolean;
 opponentPaidToNegate:boolean;
 targetUid:string;
 costUid?:string;
 lockedSpellName?:string;
 sourceSentToGrave:boolean;
};

function physicalSeat(uid:string):number{
 const m=/^m([0-3]):/.exec(uid);
 if(!m)throw new Error('UID físico 2v2 inválido: '+uid);
 return Number(m[1]);
}
function assertClassicShape(d:TagDuel):void{
 if(!d||d.mode!=='tag-classic'||!d.core||!Array.isArray(d.core.players)||d.core.players.length!==2||
   !Array.isArray(d.active)||d.active.length!==2||!Array.isArray(d.members)||d.members.length!==4||
   !Array.isArray(d.core.chain)||!d.reserves)throw new Error('Estado TagDuel clássico inválido.');
}
function inventorySnapshot(d:TagDuel):Map<string,string>{
 const out=new Map<string,string>();
 for(const c of tagInventory(d).filter(x=>x.entityKind!=='token')){
  if(out.has(c.uid))throw new Error('UID físico duplicado: '+c.uid);
  physicalSeat(c.uid);
  out.set(c.uid,c.id);
 }
 return out;
}
function handSnapshot(d:TagDuel):string[]{
 const out:string[]=[];
 for(const p of d.core.players)for(const c of p.hand)out.push(c.uid);
 for(const h of Object.values(d.reserves))for(const c of h.hand)out.push(c.uid);
 return out.sort();
}
function assertSameInventory(before:Map<string,string>,d:TagDuel):void{
 const after=inventorySnapshot(d);
 if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);
}
function assertHandsAfter(before:string[],d:TagDuel,removed:string[]):void{
 const expected=before.filter(uid=>!removed.includes(uid)).sort();
 if(JSON.stringify(expected)!==JSON.stringify(handSnapshot(d)))throw new Error('A operação alterou mãos além dos custos explícitos.');
}
function assertPhysicalRules(d:TagDuel):void{
 assertClassicShape(d);
 const all=inventorySnapshot(d),extra=new Set<string>(),extras=[0,0,0,0];
 for(let team=0;team<2;team++){
  const p=d.core.players[team];
  if(p.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
  if(p.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
  for(const c of p.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}
 }
 for(const [seat,h] of Object.entries(d.reserves)){
  for(const c of h.extra??[]){extra.add(c.uid);extras[physicalSeat(c.uid)]++;}
  if(!/^\d$/.test(seat))throw new Error('Assento físico de reserva inválido.');
 }
 const main=[0,0,0,0];
 for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
 for(let seat=0;seat<4;seat++){
  if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
  if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão é limitada a seis na End Phase; este adapter não executa descarte de mão.
}
function holderForSeat(d:TagDuel,seat:number){
 const team=(seat%2) as Team;
 return d.active[team]===seat?d.core.players[team]:d.reserves[String(seat)];
}
function cardName(id:string,lookup:SpellCounterCardLookup):string{
 return lookup(id)?.name||id;
}
function hasSpellInActiveHand(d:TagDuel,team:Team,lookup:SpellCounterCardLookup):boolean{
 const seat=d.active[team],holder=holderForSeat(d,seat);
 return !!holder?.hand.some(c=>physicalSeat(c.uid)===seat&&lookup(c.id)?.kind==='spell');
}
function responseFor(id:string,team:Team,core:DuelState,lookup:SpellCounterCardLookup):ResponseRef|undefined{
 const opponent=(1-team) as Team;
 const last=core.chain.at(-1);
 if(last){
  if(last.negated||lookup(last.id)?.kind!=='spell')return;
  if(id===MAGIC_DRAIN_ID&&last.actor!==opponent)return;
  return {kind:'chain',actor:last.actor as Team,card:last.card,id:last.id};
 }
 const pending=core.pending;
 if(pending.kind!=='spell'||core.pendingNegated||lookup(pending.id)?.kind!=='spell')return;
 if(id===MAGIC_DRAIN_ID&&pending.actor!==opponent)return;
 return {kind:'pending',actor:pending.actor as Team,card:pending.card,id:pending.id};
}
function findLink(core:DuelState,r:ResponseRef){
 if(r.kind!=='chain')return;
 return core.chain.find(l=>l.actor===r.actor&&l.card===r.card&&l.id===r.id);
}
function removeControlled(core:DuelState,team:Team,uid:string){
 const p=core.players[team],i=p.backrow.findIndex(c=>c.uid===uid);
 if(i>=0)return p.backrow.splice(i,1)[0];
 if(p.field?.uid===uid){const f=p.field;p.field=null;return f;}
 return;
}
function moveToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 if(core.players.some(p=>p.grave.some(c=>c.uid===uid)))return false;
 const c=removeControlled(core,controller,uid);
 if(!c)return false;
 core.players[(physicalSeat(uid)%2) as Team].grave.push({uid:c.uid,id:c.id});
 return true;
}
function moveHandToOwnerGrave(d:TagDuel,seat:number,uid:string):void{
 if(physicalSeat(uid)!==seat)throw new Error('O custo deve sair da mão privada do representante ativo.');
 const holder=holderForSeat(d,seat);
 if(!holder)throw new Error('Mão física do representante não encontrada.');
 const i=holder.hand.findIndex(c=>c.uid===uid);
 if(i<0)throw new Error('Carta de custo não está na mão privada do representante ativo.');
 const [card]=holder.hand.splice(i,1);
 d.core.players[(seat%2) as Team].grave.push({uid:card.uid,id:card.id});
}
function sourceCard(d:TagDuel,team:Team,uid:string){
 return d.core.players[team].backrow.find(c=>c.uid===uid);
}
function targetIsCurrent(core:DuelState,r:ResponseRef):boolean{
 if(r.kind==='pending'){
  const p=core.pending;
  return core.chain.length===0&&p.kind==='spell'&&!core.pendingNegated&&p.actor===r.actor&&p.card===r.card&&p.id===r.id;
 }
 const target=findLink(core,r);
 return !!target&&core.chain.at(-1)===target&&!target.negated;
}
function negateTargetActivation(core:DuelState,r:ResponseRef):{negated:boolean;destroyed:boolean}|undefined{
 if(!targetIsCurrent(core,r))return;
 if(r.kind==='pending')core.pendingNegated=true;
 else{
  const target=findLink(core,r);
  if(!target)return;
  target.negated=true;
 }
 return {negated:true,destroyed:moveToOwnerGrave(core,r.actor,r.card)};
}

export function createSpellCounterTrapSession(duel:TagDuel):SpellCounterTrapSession{
 assertPhysicalRules(duel);
 return {duel:structuredClone(duel),pending:{},resolved:[],lockedSpellNames:[]};
}
export function spellCounterTrapActions(duel:TagDuel,lookup:SpellCounterCardLookup):SpellCounterTrapAction[]{
 assertClassicShape(duel);
 const c=duel.core;
 if(c.phase!=='response'||(c.priority!==0&&c.priority!==1))return [];
 const team=c.priority as Team,seat=duel.active[team];
 if(!Number.isSafeInteger(seat)||duel.members[seat]?.team!==team)return [];
 return c.players[team].backrow
  .filter(x=>x.id===MAGIC_DRAIN_ID||x.id===CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID)
  .filter(x=>!x.faceUp&&Number.isSafeInteger(x.setTurn)&&x.setTurn<c.turn)
  .filter(x=>x.id!==CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID||hasSpellInActiveHand(duel,team,lookup))
  .filter(x=>!!responseFor(x.id,team,c,lookup))
  .map(x=>({kind:'trap',card:x.uid,target:''}));
}
export function activateSpellCounterTrap(
 input:SpellCounterTrapSession,
 sourceUid:string,
 activationId:string,
 lookup:SpellCounterCardLookup,
 costDiscardUid?:string
):SpellCounterTrapSession{
 if(!activationId||input.pending[activationId]||input.resolved.includes(activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertPhysicalRules(input.duel);
 const team=input.duel.core.priority;
 if(team!==0&&team!==1)throw new Error('Equipe sem prioridade de resposta.');
 const seat=input.duel.active[team];
 if(!spellCounterTrapActions(input.duel,lookup).some(a=>a.card===sourceUid))throw new Error('A Armadilha não está legal para a janela de resposta atual.');
 const source=sourceCard(input.duel,team as Team,sourceUid);
 if(!source||source.faceUp||source.setTurn>=input.duel.core.turn)throw new Error('Armadilha não está Set e liberada para ativação.');
 const response=responseFor(source.id,team as Team,input.duel.core,lookup);
 if(!response)throw new Error('A Armadilha não corresponde à ativação de Magia atual.');
 const owner=physicalSeat(sourceUid);
 if(owner%2!==team)throw new Error('A Armadilha não pertence fisicamente à equipe controladora.');
 const requiresCost=source.id===CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID;
 if(requiresCost){
  if(!costDiscardUid)throw new Error('Cursed Seal exige descartar uma Magia como custo de ativação.');
  if(physicalSeat(costDiscardUid)!==seat)throw new Error('O custo deve sair da mão privada do representante ativo.');
  const holder=holderForSeat(input.duel,seat);
  const cost=holder?.hand.find(c=>c.uid===costDiscardUid);
  if(!cost||lookup(cost.id)?.kind!=='spell')throw new Error('Cursed Seal exige uma Magia da mão privada do representante ativo.');
 }else if(costDiscardUid){
  throw new Error('Magic Drain não possui custo de ativação.');
 }
 const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input);
 if(costDiscardUid)moveHandToOwnerGrave(next.duel,seat,costDiscardUid);
 const nsource=sourceCard(next.duel,team as Team,sourceUid);
 if(!nsource)throw new Error('A Armadilha saiu do campo antes do registro.');
 nsource.faceUp=true;
 next.duel.core.chain.push({actor:team,card:sourceUid,id:source.id,target:''});
 next.duel.core.priority=1-team;
 next.duel.core.passes=0;
 next.pending[activationId]={
  activationId,sourceUid,sourceId:source.id,sourceOwnerSeat:owner,
  controllerTeam:team as Team,controllerSeat:seat,turn:next.duel.core.turn,response,
  ...(costDiscardUid?{costUid:costDiscardUid}:{})
 };
 assertSameInventory(before,next.duel);
 assertPhysicalRules(next.duel);
 assertHandsAfter(hands,next.duel,costDiscardUid?[costDiscardUid]:[]);
 return next;
}
export function resolveSpellCounterTrap(
 input:SpellCounterTrapSession,
 activationId:string,
 lookup:SpellCounterCardLookup,
 options:{sourceActivationNegated?:boolean;opponentDiscardUid?:string}={}
):{session:SpellCounterTrapSession;result:SpellCounterTrapResolution}{
 const a=input.pending[activationId];
 if(!a||input.resolved.includes(activationId))throw new Error('Ativação de Armadilha ausente ou já resolvida.');
 if(options.opponentDiscardUid&&a.sourceId!==MAGIC_DRAIN_ID)throw new Error('Somente Magic Drain permite o descarte opcional do oponente.');
 if(options.opponentDiscardUid&&options.sourceActivationNegated)throw new Error('Uma Armadilha negada não pode receber escolha de descarte na resolução.');
 assertPhysicalRules(input.duel);
 if(options.opponentDiscardUid&&!targetIsCurrent(input.duel.core,a.response))throw new Error('O alvo da resposta não está mais disponível para Magic Drain.');
 const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const own=core.chain.findIndex(l=>l.actor===a.controllerTeam&&l.card===a.sourceUid&&l.id===a.sourceId);
 if(own!==core.chain.length-1)throw new Error('A Armadilha só pode resolver no topo da corrente.');
 core.chain.pop();
 let effectApplied=false,targetActivationNegated=false,targetDestroyed=false,opponentPaidToNegate=false,lockedSpellName:string|undefined;
 const removedHands:string[]=[];
 if(!options.sourceActivationNegated&&targetIsCurrent(core,a.response)){
  if(a.sourceId===MAGIC_DRAIN_ID){
   if(options.opponentDiscardUid){
    const opponentSeat=next.duel.active[a.response.actor];
    const holder=holderForSeat(next.duel,opponentSeat);
    const cost=holder?.hand.find(c=>c.uid===options.opponentDiscardUid);
    if(!cost||physicalSeat(cost.uid)!==opponentSeat||lookup(cost.id)?.kind!=='spell'){
     throw new Error('O oponente só pode descartar uma Magia da mão privada do representante ativo.');
    }
    moveHandToOwnerGrave(next.duel,opponentSeat,options.opponentDiscardUid);
    removedHands.push(options.opponentDiscardUid);
    opponentPaidToNegate=true;
   }else{
    const negation=negateTargetActivation(core,a.response);
    targetActivationNegated=!!negation?.negated;
    targetDestroyed=!!negation?.destroyed;
    effectApplied=targetActivationNegated;
   }
  }else if(a.sourceId===CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID){
   const negation=negateTargetActivation(core,a.response);
   targetActivationNegated=!!negation?.negated;
   targetDestroyed=!!negation?.destroyed;
   effectApplied=targetActivationNegated;
   if(targetActivationNegated&&targetDestroyed){
    const team=a.response.actor,name=cardName(a.response.id,lookup);
    if(!next.lockedSpellNames.some(x=>x.team===team&&x.name===name))next.lockedSpellNames.push({team,name});
    lockedSpellName=name;
   }
  }
 }
 const sourceSentToGrave=moveToOwnerGrave(core,a.controllerTeam,a.sourceUid);
 delete next.pending[activationId];
 next.resolved.push(activationId);
 assertSameInventory(before,next.duel);
 assertPhysicalRules(next.duel);
 assertHandsAfter(hands,next.duel,removedHands);
 return {session:next,result:{
  activationId,cardId:a.sourceId,sourceActivationNegated:!!options.sourceActivationNegated,
  effectApplied,targetActivationNegated,targetDestroyed,opponentPaidToNegate,targetUid:a.response.card,
  ...(a.costUid?{costUid:a.costUid}:{}),...(lockedSpellName?{lockedSpellName}:{}),sourceSentToGrave
 }};
}
export function canTeamActivateSpell(
 session:SpellCounterTrapSession,
 team:Team,
 cardId:string,
 lookup:SpellCounterCardLookup
):boolean{
 const name=cardName(cardId,lookup);
 return !session.lockedSpellNames.some(lock=>lock.team===team&&lock.name===name);
}
