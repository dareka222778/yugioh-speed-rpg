export type NPC={id:string;name:string;style:string;description:string;cards:string[];extra:string[];reward:{dp:number;xp:number;cards:string[]}};
// Explicit 30-card adaptations. Repetitions express the real playable counts.
const joey=['74677422','44287299','44287299','34460851','34460851','05053103','05053103','48305365','48305365','91152256','26202165','83011277','54652250','07089711',
 '24094653','24094653','12580477','55144522','83764718','05318639','05318639','66788016','14087893','86318356','44095762','17814387','17814387','56120475','03819470','14315573'];
const yugi=['46986414','50930991','50930991','50930991','93221206','93221206','15025844','15025844','31560081','31560081','28933734','26202165','78010363','83011277','83011277','40640057',
 '55144522','12580477','83764718','14087893','14087893','05318639','66788016','53129443','70368879','44095762','77414722','14315573','62279055','29401950'];
const kaiba=['89631139','89631139','77585513','28279543','97590747','97590747','97590747','48305365','48305365','67724379','67724379','26202165','78010363','83011277','83011277','11384280',
 '55144522','12580477','83764718','05318639','05318639','14087893','66788016','70368879','52097679','56120475','56120475','44095762','77414722','14315573'];
export const npcs:readonly NPC[]=[
 {id:'joey',name:'Joey Wheeler',style:'Guerreiros, Fusão e Truques',description:'Ataques, viradas, correntes rápidas e Espadachim das Chamas.',cards:joey,extra:['45231177'],reward:{dp:150,xp:100,cards:[]}},
 {id:'yugi',name:'Yami Yugi',style:'Magos, Busca e Estratégia',description:'Mago Negro, recuperação de Magias, Sangan e controle do duelo.',cards:yugi,extra:[],reward:{dp:150,xp:100,cards:[]}},
 {id:'kaiba',name:'Seto Kaiba',style:'Dragões, Pressão e Poder',description:'Dragão Branco de Olhos Azuis, Jinzo e Magias decisivas.',cards:kaiba,extra:[],reward:{dp:200,xp:125,cards:[]}}
];
export function getNPC(id:string){const npc=npcs.find(n=>n.id===id);if(!npc)throw new Error('Duelista desconhecido. Abra /npc ver.');return npc;}
export function eventDay(now=Date.now()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const value=(type:string)=>parts.find(p=>p.type===type)!.value;return `${value('year')}-${value('month')}-${value('day')}`;}
export function dailyEvent(now=Date.now()){const day=eventDay(now),index=Math.floor(Date.parse(`${day}T12:00:00Z`)/86_400_000);return {day,npc:npcs[index%npcs.length],dp:100,xp:50,cards:[] as string[]};}
