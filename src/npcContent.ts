import {starterContents} from './cardCatalog';
export type NPC={id:string;name:string;style:string;description:string;cards:string[];extra:string[];reward:{dp:number;xp:number;cards:string[]}};
const initial=(style:string)=>starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id)) as string[];
// These are themed, playable adaptations, not replicas of official character decks.
const yugi=initial('spellcaster');yugi[0]='46986414';
const kaiba=initial('dragon');kaiba[0]='89631139';kaiba[1]='48305365';
const joey=initial('warrior');joey[0]='74677422';joey[2]='24094653';joey[4]='34460851';
export const npcs:readonly NPC[]=[
 {id:'joey',name:'Joey Wheeler',style:'Guerreiros e Fusão',description:'Ataques diretos, tributos e Espadachim das Chamas.',cards:joey,extra:['45231177'],reward:{dp:150,xp:100,cards:['74677422','24094653','34460851','44287299','45231177']}},
 {id:'yugi',name:'Yugi Muto',style:'Magos',description:'Magos defensivos e o Mago Negro por dois tributos.',cards:yugi,extra:[],reward:{dp:150,xp:100,cards:['46986414']}},
 {id:'kaiba',name:'Seto Kaiba',style:'Dragões',description:'Dragões e o Dragão Branco de Olhos Azuis.',cards:kaiba,extra:[],reward:{dp:200,xp:125,cards:['89631139','86318356']}}
];
export function getNPC(id:string){const npc=npcs.find(n=>n.id===id);if(!npc)throw new Error('Duelista desconhecido. Abra /npc ver.');return npc;}
export function eventDay(now=Date.now()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const value=(type:string)=>parts.find(p=>p.type===type)!.value;return `${value('year')}-${value('month')}-${value('day')}`;}
export function dailyEvent(now=Date.now()){const day=eventDay(now),index=Math.floor(Date.parse(`${day}T12:00:00Z`)/86_400_000);return {day,npc:npcs[index%npcs.length],dp:100,xp:50,cards:[['38199696','17814387','44209392','86318356'][index%4]]};}
