import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {npcPortraits} from './npcPortraits';
import {getCardArt} from './cardArt';
import {azure} from './duelTheme';
import type {ClassicCard} from './classicDecks';
export const npcThemes:Record<string,{color:string;dark:string;title:string;line:string;ace:string}>={
 joey:{color:'#ffba58',dark:'#793221',title:'CORAÇÃO DE GUERREIRO',line:'Pode apostar: eu vou lutar até o fim.',ace:'74677422'},
 yugi:{color:'#c6a5ff',dark:'#482f83',title:'O CORAÇÃO DAS CARTAS',line:'Cada carta pode abrir um novo caminho.',ace:'46986414'},
 kaiba:{color:'#68dcff',dark:'#125a81',title:'ORGULHO DOS OLHOS AZUIS',line:'Mostre se você está à altura deste duelo.',ace:'89631139'}
};
export type GalleryView='hero'|'deck'|'card'|'loadout'|'playcard';
export type GalleryModel={id:string;name:string;index:number;prefix:string;year:number;won:boolean;reward:string;daily:boolean;dailyClaimed:boolean;cards:ClassicCard[];page:number;view:GalleryView};
function base(m:GalleryModel,height:number){const t=npcThemes[m.id];let lines='';for(let i=-2;i<12;i++)lines+=`<path d="M${i*180} 0L${i*180-440} ${height}" stroke="${t.color}" stroke-opacity=".045" stroke-width="2"/>`;return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${height}"><defs><radialGradient id="glow"><stop stop-color="${t.dark}"/><stop offset="1" stop-color="${azure.deep}"/></radialGradient><linearGradient id="shade"><stop stop-color="#08101f"/><stop offset="1" stop-color="#08101f" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="${height}" fill="${azure.deep}"/><ellipse cx="960" cy="340" rx="650" ry="620" fill="url(#glow)"/>${lines}<path d="M0 7H1280" stroke="${azure.primary}" stroke-width="7"/>${text(50,53,'DUELIST WORLD',21,azure.text,700)}${text(975,53,'CLÁSSICOS  /  DM',17,t.color,700)}<path d="M50 76H1230" stroke="#8fd6ff" stroke-opacity=".32"/>`;}
function svg(bytes:string){return Buffer.from(bytes+'</svg>');}
const rendered=new Map<string,Buffer>(),pending=new Map<string,Promise<Buffer>>();
export async function renderNPC(m:GalleryModel):Promise<Buffer>{
 const key=JSON.stringify(m);const hit=rendered.get(key);if(hit)return hit;if(pending.has(key))return pending.get(key)!;
 const job=render(m).then(b=>{rendered.set(key,b);while(rendered.size>12)rendered.delete(rendered.keys().next().value!);return b;}).finally(()=>pending.delete(key));pending.set(key,job);return job;
}
async function render(m:GalleryModel){
 const t=npcThemes[m.id],layers:sharp.OverlayOptions[]=[];
 if(m.view==='hero'){
  const portrait=(await sharp(Buffer.from(npcPortraits[m.id],'base64')).png().toBuffer()).toString('base64');
  let s=base(m,720);s+=`<path d="M850 76H1210L940 650H580Z" fill="${t.color}" opacity=".065"/><circle cx="968" cy="340" r="242" fill="none" stroke="${t.color}" opacity=".16" stroke-width="2"/><circle cx="968" cy="340" r="215" fill="none" stroke="${t.color}" opacity=".1" stroke-width="20"/>`;
  // Portrait remains clear of the text column; official transparent character art is bundled.
  s+=`<image href="data:image/png;base64,${portrait}" x="680" y="85" width="590" height="590" preserveAspectRatio="xMidYMin meet"/><rect x="0" y="76" width="710" height="644" fill="url(#shade)"/>`;
  s+=text(55,139,`DUELISTA  0${m.index+1} / 03`,18,t.color,700)+text(50,225,m.name,62,'#ffffff',700,665)+text(55,265,t.title,19,t.color,700);
  s+=`<path d="M55 294H520" stroke="${t.color}" stroke-opacity=".45"/>`+text(55,338,t.line,23,'#E6F5FF',400,590);
  s+=text(55,412,'DUELO CLÁSSICO • 4.000 PV',16,azure.primaryBright,700)+text(55,453,'Seu deck × '+m.name.split(' ')[0],30,'#ffffff',700)+text(55,489,'30 cartas • 3 zonas • Recompensas ao vencer',17,azure.muted,400,590);
  s+=`<rect x="50" y="535" width="580" height="83" rx="12" fill="#102D4D" stroke="${t.color}" stroke-opacity=".25"/>`+text(72,565,m.won?'PRIMEIRA VITÓRIA CONCLUÍDA':'PRIMEIRA VITÓRIA',14,t.color,700)+text(72,596,m.won?'Revanche liberada':m.reward,23,'#ffffff',700);
  s+=text(55,659,`${m.prefix} · ${m.year} · 50 cartas no acervo clássico`,18,'#BCD5ED',400)+text(55,691,'Explore o deck completo, inspecione cada carta ou inicie um duelo.',15,azure.tertiary);
  layers.push({input:svg(s),left:0,top:0});
  return sharp({create:{width:1280,height:720,channels:4,background:'#07162B'}}).composite(layers).png().toBuffer();
 }
 const single=m.view==='card'||m.view==='playcard',archive=m.view==='deck'||m.view==='card';
 let s=base(m,single?800:900);s+=text(50,126,m.name,34,'#ffffff',700)+text(50,158,archive?`STARTER DECK ${m.prefix} · ${m.year} · 50/50 cartas`:`DECK DO DESAFIO · ${m.cards.length} cartas`,18,t.color,700);
 if(single){
  const c=m.cards[m.page];let art=await getCardArt(c.id);
  s+=`<rect x="50" y="187" width="400" height="580" rx="12" fill="#173B60" stroke="${t.color}" stroke-opacity=".5"/>`;
  s+=text(510,230,`CARD VIEW  •  ${String(m.page+1).padStart(2,'0')} / ${m.cards.length}`,18,azure.primaryBright,700)+text(510,292,c.name,35,'#ffffff',700,705)+text(510,326,c.englishName,19,'#B0D1EA',400,700);
  s+=text(510,390,c.code+'  ·  '+(c.extra?'DECK ADICIONAL':c.kind==='Monster'?'MONSTRO':c.kind==='Spell'?'MAGIA':'ARMADILHA'),19,t.color,700);
  if(c.kind==='Monster')s+=text(510,442,c.type,20,'#d3def0',400,700)+text(510,494,`NÍVEL ${c.level??'?'}    ATK ${c.atk??'?'}    DEF ${c.defense??'?'}`,26,'#ffffff',700,700);
  s+=`<path d="M510 546H1210" stroke="${t.color}" stroke-opacity=".25"/>`+text(510,586,archive?'ACERVO HISTÓRICO COMPLETO':'CARTA DO DESAFIO ATUAL',18,t.color,700)+text(510,623,archive?'A lista completa ainda não está liberada para duelos.':'Esta carta faz parte da adaptação jogável.',20,'#BCD5ED',400,700)+text(510,659,'Consulte o texto e as regras no botão “Ficha oficial”.',18,'#B0D1EA',400,700)+text(510,743,'◀ ANTERIOR   /   DETALHES DA CARTA   /   PRÓXIMA ▶',18,azure.muted,400,700);
  layers.push({input:svg(s),left:0,top:0});if(art)layers.push({input:await sharp(art).resize(390,568,{fit:'contain',background:'#173B60'}).toBuffer(),left:55,top:193});
 }else{
  const pageCards=m.cards.slice(m.page*10,m.page*10+10);const arts=await Promise.all(pageCards.map(c=>getCardArt(c.id)));
  for(let j=0;j<pageCards.length;j++){const c=pageCards[j],x=50+(j%5)*240,y=190+Math.floor(j/5)*322;
   s+=`<rect x="${x}" y="${y}" width="220" height="306" rx="9" fill="#102D4D" stroke="${t.color}" stroke-opacity=".2"/>`+text(x+10,y+274,`${String(m.page*10+j+1).padStart(2,'0')} · ${c.name}`,16,'#ffffff',700,200)+text(x+10,y+296,c.code+(c.extra?' · FUSÃO':''),13,t.color,400,200);
   if(!arts[j])s+=text(x+28,y+135,'Imagem indisponível',14,'#B0D1EA',400,170);
   if(arts[j])layers.push({input:await sharp(arts[j]!).resize(166,242,{fit:'contain',background:'#102D4D'}).toBuffer(),left:x+27,top:y+8});
  }
  s+=text(50,869,`PÁGINA ${m.page+1} / ${Math.ceil(m.cards.length/10)}   ·   Escolha uma carta no menu para ampliar.`,17,'#BCD5ED',400);
  layers.unshift({input:svg(s),left:0,top:0});
 }
 return sharp({create:{width:1280,height:single?800:900,channels:4,background:'#07162B'}}).composite(layers).png().toBuffer();
}
