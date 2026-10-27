import type {Card} from './cardCatalog';
import type {DuelState,Monster} from './duelEngine';
import {RULES_PROFILE} from './rulesProfile';
export type TokenPolicy={tributeSummon:boolean;tributeEffect:boolean};
export type TokenRemoval='destroy'|'battle'|'banish'|'return'|'tribute';
type TokenEntry={uid:string;id:string;owner:number;createdTurn:number;policy:TokenPolicy;status:'active'|'removed';cause?:TokenRemoval};
export type TokenEvent={kind:'created'|'removed';uid:string;cause?:TokenRemoval};
export type TokenLedger={next:number;entries:TokenEntry[];events:TokenEvent[]};
const sheep:Readonly<Card>=Object.freeze({id:'token:sheep',konamiId:0,name:'Ficha de Ovelha',englishName:'Sheep Token',kind:'monster',monsterType:'normal',race:'Beast',attribute:'EARTH',level:1,atk:0,defense:0,summary:'Entidade de campo; não integra o inventário.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4818&request_locale=en'});
export function getTokenMetadata(id:string):Card|undefined{return id===sheep.id?{...sheep}:undefined;}
export function createTokenGroup(s:DuelState,controller:0|1,count:number,position:'atk'|'def'='def',policy:TokenPolicy={tributeSummon:false,tributeEffect:true}):Monster[]{
 if(!['engine-v2','engine-v3'].includes(s.resolverVersion??'')||s.phase==='finished'||![0,1].includes(controller)||!Number.isSafeInteger(count)||count<1||count>RULES_PROFILE.monsterZones||!['atk','def'].includes(position)||typeof policy.tributeSummon!=='boolean'||typeof policy.tributeEffect!=='boolean')throw new Error('Criação de fichas inválida.');
 if(s.players[controller].monsters.length+count>RULES_PROFILE.monsterZones)throw new Error('Zonas insuficientes para o grupo completo.');
 if((s.tokenLedger?.next??0)+count>4096)throw new Error('Limite de entidades da partida excedido.');
 const first=s.tokenLedger?.next??0,seat=s.teamRotation?.active[controller];
 const occupied=new Set(s.players.flatMap(p=>[...p.hand,...p.deck,...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.banished??[]]).map(c=>c.uid));
 for(let n=1;n<=count;n++)if(occupied.has(seat===undefined?`token:${first+n}`:`m${seat}:token:${first+n}`))throw new Error('Identidade de ficha já utilizada.');
 const ledger=s.tokenLedger??={next:0,entries:[],events:[]},created:Monster[]=[];
 for(let n=0;n<count;n++){
  const sequence=++ledger.next,seat=s.teamRotation?.active[controller],uid=seat===undefined?`token:${sequence}`:`m${seat}:token:${sequence}`;
  const monster:Monster={uid,id:sheep.id,entityKind:'token',tokenPolicy:{...policy},owner:controller,position,faceUp:true,entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0};
  ledger.entries.push({uid,id:sheep.id,owner:controller,createdTurn:s.turn,policy:{...policy},status:'active'});ledger.events.push({kind:'created',uid});s.players[controller].monsters.push(monster);created.push(monster);
 }
 return created;
}
export function removeToken(s:DuelState,uid:string,cause:TokenRemoval):boolean{
 const p=s.players.find(p=>p.monsters.some(m=>m.uid===uid&&m.entityKind==='token'));if(!p)return false;
 const entry=s.tokenLedger?.entries.find(e=>e.uid===uid&&e.status==='active');if(!entry)throw new Error('Ficha sem registro de criação.');
 p.monsters=p.monsters.filter(m=>m.uid!==uid);entry.status='removed';entry.cause=cause;s.tokenLedger!.events.push({kind:'removed',uid,cause});return true;
}
export function assertTokenLedger(s:DuelState):void{
 const tokens=s.players.flatMap(p=>p.monsters.filter(m=>m.entityKind==='token')),ledger=s.tokenLedger;
 const fail=():never=>{throw new Error('Estado de fichas inválido.');};
 if(ledger===undefined){if(tokens.length)fail();return;}
 if(!ledger||!['engine-v2','engine-v3'].includes(s.resolverVersion??'')||!Number.isSafeInteger(ledger.next)||ledger.next<0||ledger.next>4096||!Array.isArray(ledger.entries)||ledger.entries.length!==ledger.next||!Array.isArray(ledger.events)||ledger.events.length>ledger.next*2)fail();
 const uids=new Set<string>();for(const [index,entry]of ledger.entries.entries()){
  if(!entry||typeof entry.uid!=='string'||!(new RegExp('^(?:m[0-3]:)?token:'+(index+1)+'$')).test(entry.uid)||uids.has(entry.uid)||!getTokenMetadata(entry.id)||![0,1].includes(entry.owner)||!Number.isSafeInteger(entry.createdTurn)||entry.createdTurn<1||entry.createdTurn>s.turn||!entry.policy||typeof entry.policy.tributeSummon!=='boolean'||typeof entry.policy.tributeEffect!=='boolean'||!['active','removed'].includes(entry.status))fail();uids.add(entry.uid);
  const monster=tokens.find(t=>t.uid===entry.uid);
  if(entry.status==='active'&&(!monster||monster.id!==entry.id||monster.owner!==entry.owner||!monster.faceUp||monster.properlySummoned!==undefined||JSON.stringify(monster.tokenPolicy)!==JSON.stringify(entry.policy)||entry.cause!==undefined)||entry.status==='removed'&&(!!monster||!['destroy','battle','banish','return','tribute'].includes(entry.cause??'')))fail();
 }
 if(tokens.some(t=>!uids.has(t.uid)))fail();
 const entries=new Map(ledger.entries.map(e=>[e.uid,e])),created=new Set<string>(),removed=new Set<string>();
 for(const event of ledger.events){const entry=entries.get(event?.uid);if(!entry)fail();if(event.kind==='created'){if(created.has(event.uid)||event.cause!==undefined)fail();created.add(event.uid);}else if(event.kind==='removed'){if(!created.has(event.uid)||removed.has(event.uid)||entry!.status!=='removed'||event.cause!==entry!.cause)fail();removed.add(event.uid);}else fail();}
 if(created.size!==ledger.entries.length||removed.size!==ledger.entries.filter(e=>e.status==='removed').length)fail();
}
export function assertTokenTransition(before:DuelState,after:DuelState):void{
 const previous=before.tokenLedger?.entries??[],next=after.tokenLedger?.entries??[];
 if(next.length<previous.length)throw new Error('Histórico de fichas removido.');
 const oldEvents=before.tokenLedger?.events??[],newEvents=after.tokenLedger?.events??[];
 if(newEvents.length<oldEvents.length||oldEvents.some((e,i)=>e.kind!==newEvents[i].kind||e.uid!==newEvents[i].uid||e.cause!==newEvents[i].cause))throw new Error('Histórico causal de fichas alterado.');
 for(const [i,entry]of previous.entries()){
  const n=next[i];if(!n||n.uid!==entry.uid||n.id!==entry.id||n.owner!==entry.owner||n.createdTurn!==entry.createdTurn||JSON.stringify(n.policy)!==JSON.stringify(entry.policy)||entry.status==='removed'&&JSON.stringify(n)!==JSON.stringify(entry))throw new Error('Identidade de ficha alterada.');
 }
}
