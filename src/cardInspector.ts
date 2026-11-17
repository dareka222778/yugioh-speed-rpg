import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import {getMonsterEffect} from './monsterEffects';
import {azure} from './duelTheme';
import {wrapText} from './cardRenderer';
import {cardRulesPT,racePT,attributePT} from './cardText';
export type OwnedCardCanvas={id:string;deckName:string;inDeck:number;owned:number;index:number;total:number;heading?:string;detail?:string};
/** Branded per-card inspector instead of a plain card-art attachment.
 * Missing art never hides information: a local text fallback is rendered.
 */
let inspectorWaiting=0,inspectorQueue=Promise.resolve();
export async function renderOwnedCard(v:OwnedCardCanvas,provider=getCardArt):Promise<Buffer>{
 if(inspectorWaiting>=4)throw new Error('A consulta visual está ocupada. Tente novamente em alguns segundos.');
 inspectorWaiting++;const previous=inspectorQueue;let release!:()=>void;inspectorQueue=new Promise<void>(r=>{release=r;});await previous;
 try{return await drawOwnedCard(v,provider);}finally{inspectorWaiting--;release();}
}
async function drawOwnedCard(v:OwnedCardCanvas,provider=getCardArt):Promise<Buffer>{
 const card=getCard(v.id);
 if(!card)throw new Error('Carta não habilitada no RPG.');
 const type=card.fusion?'FUSÃO':card.field?'MAGIA DE CAMPO':card.kind==='monster'
  ?getMonsterEffect(card.id)?'MONSTRO DE EFEITO':'MONSTRO NORMAL'
  :card.kind==='spell'?'MAGIA':'ARMADILHA';
 const title=card.name;const longTitle=wrapText(title,32).length>1;
 const groups=wrapText(cardRulesPT(card.id),48).slice(0,5);
 const qty=Math.max(0,Math.min(3,v.inDeck));
 const frame=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720">
 <defs>
 <linearGradient id="bg" x2="1" y2="1"><stop stop-color="${azure.deep}"/><stop offset=".55" stop-color="${azure.navy}"/><stop offset="1" stop-color="#07101E"/></linearGradient>
 <linearGradient id="panel" x2="1" y2=".6"><stop stop-color="${azure.surfaceRaised}"/><stop offset="1" stop-color="${azure.card}"/></linearGradient>
 <linearGradient id="energy" x2="1"><stop stop-color="${azure.line}"/><stop offset="1" stop-color="${azure.primaryBright}"/></linearGradient>
 </defs>
 <rect width="1200" height="720" rx="22" fill="url(#bg)"/>
 <rect x="10" y="10" width="1180" height="700" rx="18" fill="none" stroke="${azure.line}" stroke-width="3"/>
 <path d="M36 32H270M930 32H1164M36 688H270M930 688H1164" stroke="url(#energy)" stroke-width="4"/>
 <rect x="35" y="102" width="440" height="555" rx="16" fill="${azure.deep}" stroke="${azure.lineMuted}"/>
 <rect x="505" y="102" width="657" height="555" rx="16" fill="url(#panel)" stroke="${azure.lineMuted}"/>
 ${text(40,66,v.heading??'MEU DECK     /     CARTA',22,azure.primaryBright,700,850)}
 ${text(930,65,`${v.index+1} / ${v.total}`,20,azure.text,700,240)}
 ${text(531,154,type,17,azure.primaryBright,700,600)}
 ${wrapText(title,32).map((line,i)=>text(531,195+i*34,line,30,azure.text,700,600)).join('')}
 ${text(531,longTitle?264:243,card.kind==='monster'?`${attributePT[card.attribute??'']??'—'}   ·   ${racePT[card.race??'']??'—'}   ·   NÍVEL ${card.level}`:'CARTA JOGÁVEL NO RPG',18,azure.muted,700,590)}
 ${card.kind==='monster'?text(531,longTitle?306:298,`ATK ${card.atk}   /   DEF ${card.defense}`,29,azure.text,700,590):''}
 <path d="M530 323H1135" stroke="${azure.line}" stroke-opacity=".45"/>
 ${text(531,355,'DESCRIÇÃO / EFEITO',17,azure.primaryBright,700,590)}
 ${groups.map((line,i)=>text(531,394+i*28,line,19,azure.text,400,585)).join('')}
 <path d="M530 548H1135" stroke="${azure.line}" stroke-opacity=".35"/>
 ${text(531,585,v.detail??`NO DECK: ${v.inDeck}×    NA COLEÇÃO: ${v.owned}×`,21,azure.text,700,590)}
 ${(v.detail?[]:[0,1,2]).map(i=>`<rect x="${531+i*82}" y="603" width="70" height="11" rx="5" fill="${i<qty?azure.primary:azure.lineMuted}"/>`).join('')}
 ${text(531,645,v.deckName,16,azure.muted,700,585)}${text(531,675,'Regras completas em português na mensagem.',14,azure.tertiary,400,585)}
 <rect x="72" y="138" width="364" height="480" rx="10" fill="${azure.card}" stroke="${azure.line}" stroke-width="2"/>
 </svg>`;
 const layers:sharp.OverlayOptions[]=[{input:Buffer.from(frame),left:0,top:0}];
 try{
  const bytes=await provider(card.id);
  if(bytes){layers.push({input:await sharp(bytes,{limitInputPixels:20_000_000}).resize(358,470,{fit:'contain',background:azure.card}).png().toBuffer(),left:75,top:143});}
  else{
   layers.push({input:Buffer.from(`<svg width="360" height="470" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="470" rx="9" fill="${azure.surface}"/>${text(24,217,'CARTA DO SEU DECK',21,azure.text,700,320)}${text(24,257,card.name,17,azure.primaryBright,700,320)}</svg>`),left:74,top:143});
  }
 }catch{/* Branded board and effect text remain readable if artwork fails. */}
 return sharp({create:{width:1200,height:720,channels:4,background:azure.deep}}).composite(layers).png().toBuffer();
}

