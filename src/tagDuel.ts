import {rulesFor} from './rulesProfile';
/** Four-seat coordination over the shared rules core. Normal-lab sessions retain
 * their original format. Classic sessions rotate inside the actual turn transition
 * and route returns to physical owners, including inactive partners. */
import {createHash} from 'node:crypto';
import {createDuel,step,legalActions,decisionPlayer,timeoutDuel,type DuelState,type Action,type CardRef} from './duelEngine';
import {assertDuelState,duelCards} from './duelIntegrity';
import {getEffect,getPlayableCard,enabledCardIds} from './effectRegistry';
type Held={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
export type TagMember={id:string;name:string;team:0|1};
export type TagDuel={version:1;mode:'tag-normal-lab'|'tag-classic';members:[TagMember,TagMember,TagMember,TagMember];active:[number,number];cursor:number;reserves:Record<string,Held>;core:DuelState};
export const tagNormalCardIds=enabledCardIds.filter(id=>getEffect(id)?.kind==='normal');
const teamId=(i:number)=>`tag-team-${i}`;
export function tagInventory(s:TagDuel){return s.mode==='tag-classic'?duelCards(s.core):[...duelCards(s.core),...Object.values(s.reserves).flatMap(p=>[...p.deck,...p.hand,...p.extra??[]])];}
export function assertTagDuel(s:TagDuel){
 if(!s||s.version!==1||!['tag-normal-lab','tag-classic'].includes(s.mode)||!Array.isArray(s.members)||s.members.length!==4||new Set(s.members.map(p=>p.id)).size!==4||s.members.some((p,i)=>!p.id||!p.name||p.team!==i%2)||!Number.isInteger(s.cursor)||s.cursor<0||s.cursor>3||!Array.isArray(s.active)||s.active.length!==2||s.active.some((i,t)=>!Number.isInteger(i)||i<0||i>3||i%2!==t)||!s.reserves)throw Error('Estado 2v2 inválido.');
 assertDuelState(s.core);if(s.core.players.some((p,i)=>p.id!==teamId(i))||s.core.current!==s.cursor%2||s.active[s.cursor%2]!==s.cursor&&s.core.teamRotation?.overflowReturn?.seat!==s.cursor)throw Error('Rotação 2v2 inválida.');
 if(s.mode==='tag-classic'&&(!s.core.teamRotation||JSON.stringify([s.active,s.cursor,s.reserves])!==JSON.stringify([s.core.teamRotation.active,s.core.teamRotation.cursor,s.core.teamRotation.reserves])))throw Error('Estado de equipes fora de sincronia.');
 const keys=Object.keys(s.reserves);if(keys.length!==2||keys.some(k=>!/^\d$/.test(k)||Number(k)>3||s.active.includes(Number(k))))throw Error('Reservas 2v2 inválidas.');
 for(const held of Object.values(s.reserves))if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand))throw Error('Mão/deck de reserva inválido.');
 const all=tagInventory(s);if(new Set(all.map(c=>c.uid)).size!==all.length||all.some(c=>typeof c.uid!=='string'||!c.uid||!getPlayableCard(c.id)&&c.entityKind!=='token'||s.mode==='tag-normal-lab'&&(c.entityKind==='token'||getEffect(c.id)?.kind!=='normal')))throw Error('Carta não admitida neste formato ou identidade física inválida.');
}
export function createTagDuel(players:[{id:string;name:string;cards:string[];extra?:string[]},{id:string;name:string;cards:string[];extra?:string[]},{id:string;name:string;cards:string[];extra?:string[]},{id:string;name:string;cards:string[];extra?:string[]}],options:{seed?:string;first?:number;classic?:boolean}={}):TagDuel{
 if(!Array.isArray(players)||players.length!==4||new Set(players.map(p=>p.id)).size!==4||players.some(p=>!p.id||!p.name||!Array.isArray(p.cards)||p.cards.some(id=>!getPlayableCard(id)||!options.classic&&getEffect(id)?.kind!=='normal')))throw Error(options.classic?'Informe quatro duelistas distintos com cartas habilitadas.':'Informe quatro duelistas distintos; esta etapa 2v2 aceita somente monstros normais.');
 const first=options.first??0;if(!Number.isInteger(first)||first<0||first>3)throw Error('Primeiro participante inválido.');
 const seed=(pair:number)=>options.seed===undefined?{}:{randomSeed:createHash('sha256').update(options.seed+':'+pair).digest('hex')};
 const pairs=[createDuel([players[0],players[1]],Math.random,0,seed(0)),createDuel([players[2],players[3]],Math.random,0,seed(1))];
 const held=players.map((_,index)=>{const p=pairs[Math.floor(index/2)].players[index%2];return {deck:p.deck.map(c=>({...c,uid:`m${index}:${c.uid}`})),hand:p.hand.map(c=>({...c,uid:`m${index}:${c.uid}`})),extra:(p.extra??[]).map(c=>({...c,uid:`m${index}:${c.uid}`}))};});
 const active:[number,number]=first%2===0?[first,(first+1)%4]:[(first+1)%4,first];
 const core=pairs[0];core.current=first%2;core.priority=core.current;
 for(let t=0;t<2;t++){core.players[t].id=teamId(t);core.players[t].name=t?'Equipe Vermelha':'Equipe Azul';core.players[t].deck=held[active[t]].deck;core.players[t].hand=held[active[t]].hand;core.players[t].extra=held[active[t]].extra;}
 core.log=['Laboratório 2v2: equipes com campo compartilhado; somente monstros normais.'];
 const reserves:Record<string,Held>={};for(let i=0;i<4;i++)if(!active.includes(i))reserves[i]=held[i];
 if(options.classic){core.teamRotation={version:1,cursor:first,active,reserves:reserves as NonNullable<DuelState['teamRotation']>['reserves']};core.log=['Duelo 2v2 clássico: efeitos compartilhados por equipe; mãos/decks por participante.'];}
 const game:TagDuel={version:1,mode:options.classic?'tag-classic':'tag-normal-lab',members:players.map((p,i)=>({id:p.id,name:p.name.slice(0,32),team:i%2})) as TagDuel['members'],active,cursor:first,reserves,core};assertTagDuel(game);return game;
}
export function tagDecisionMember(s:TagDuel){return s.members[s.active[decisionPlayer(s.core)]];}
export function tagActions(s:TagDuel,member:string):Action[]{assertTagDuel(s);return tagDecisionMember(s).id===member?legalActions(s.core,teamId(decisionPlayer(s.core))):[];}
export function tagMemberHand(s:TagDuel,member:string){assertTagDuel(s);const index=s.members.findIndex(p=>p.id===member);if(index<0)throw Error('Você não participa deste 2v2.');const team=index%2;return structuredClone(s.active[team]===index?s.core.players[team].hand:s.reserves[index].hand);}
export function stepTagDuel(input:TagDuel,member:string,action:Action):TagDuel{
 assertTagDuel(input);if(input.core.phase==='finished')throw Error('Duelo 2v2 encerrado.');if(tagDecisionMember(input).id!==member)throw Error('Aguarde a vez do participante ativo.');
 const before=new Map(tagInventory(input).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id])),s=structuredClone(input),team=decisionPlayer(s.core);
 const normalTurnEnds=s.mode==='tag-normal-lab'&&(action.kind==='end'&&(rulesFor(s.core).handCheck==='before-draw'||s.core.players[s.core.current].hand.length<=rulesFor(s.core).handLimit)||action.kind==='discard'&&!s.core.handFlow&&s.core.players[s.core.current].hand.length===rulesFor(s.core).handLimit+1);
 if(normalTurnEnds){
  // The Normal laboratory has no responses. Swap only just before the actual
  // incoming draw, including after the outgoing member's final discard.
  if(!tagActions(input,member).some(a=>JSON.stringify(a)===JSON.stringify(action)))throw Error('Encerramento inválido.');
  const incoming=(s.cursor+1)%4,t=incoming%2;
  if(s.active[t]!==incoming){const p=s.core.players[t];s.reserves[s.active[t]]={deck:p.deck,hand:p.hand};const next=s.reserves[incoming];p.deck=next.deck;p.hand=next.hand;delete s.reserves[incoming];s.active[t]=incoming;}
  // Cursor advances only after the outgoing member finishes any End Phase discard.
 }
 s.core=step(s.core,teamId(team),action);if(s.mode==='tag-normal-lab'&&s.core.turn>input.core.turn)s.cursor=(input.cursor+1)%4;if(s.core.teamRotation){s.cursor=s.core.teamRotation.cursor;s.active=s.core.teamRotation.active;s.reserves=s.core.teamRotation.reserves;}assertTagDuel(s);const after=tagInventory(s).filter(c=>c.entityKind!=='token');
 if(after.length!==before.size||after.some(c=>before.get(c.uid)!==c.id))throw Error('Falha de conservação 2v2.');return s;
}
export function timeoutTagDuel(input:TagDuel){assertTagDuel(input);const s=structuredClone(input);s.core=timeoutDuel(s.core);assertTagDuel(s);return s;}
export function publicTagDuel(s:TagDuel){assertTagDuel(s);return {mode:s.mode,turn:s.core.turn,phase:s.core.phase,acting:tagDecisionMember(s).name,winner:s.core.winner,reason:s.core.reason,members:s.members.map((p,i)=>({id:p.id,name:p.name,team:p.team,active:s.active[p.team]===i,handCount:tagMemberHand(s,p.id).length,deckCount:s.active[p.team]===i?s.core.players[p.team].deck.length:s.reserves[i].deck.length})),teams:s.core.players.map(p=>({name:p.name,lp:p.lp,monsters:p.monsters.map(m=>({id:m.faceUp?m.id:null,position:m.position,faceUp:m.faceUp})),graveCount:p.grave.length,backrow:p.backrow.map(c=>({id:c.faceUp?c.id:null,faceUp:c.faceUp})),field:p.field?{id:p.field.faceUp?p.field.id:null,faceUp:p.field.faceUp}:null})),log:[...s.core.log]};}
