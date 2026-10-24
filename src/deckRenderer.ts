import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import type {Deck,DeckItem} from './decks';
export type DeckCanvas={deck:Deck;visible:string[];selected?:string;owned:DeckItem[];page:number;pages:number};
const W=1200,H=1090;
let queue=Promise.resolve();let waiting=0;
export async function renderDeck(view:DeckCanvas,artProvider=getCardArt):Promise<Buffer>{
 if(waiting>=4)throw new Error('O editor visual está ocupado. Tente novamente em alguns segundos.');
 waiting++;const previous=queue;let release!:()=>void;queue=new Promise<void>(r=>{release=r;});await previous;
 try{return await draw(view,artProvider);}finally{waiting--;release();}
}
async function draw(v:DeckCanvas,artProvider:typeof getCardArt){
 const {deck}=v;const overlays:sharp.OverlayOptions[]=[];const art=new Map<string,Buffer>();
 // At most three parallel downloads and six known catalog IDs per view.
 for(let start=0;start<v.visible.length;start+=3)await Promise.all(v.visible.slice(start,start+3).map(async id=>{
  try{const bytes=await artProvider(id);if(bytes)art.set(id,bytes);}catch{/* Readable fallback remains interactive. */}
 }));
 const qty=(id:string)=>deck.items.find(c=>c.card_key===id)?.quantity??0;
 const have=(id:string)=>v.owned.find(c=>c.card_key===id)?.quantity??0;
 const status=deck.active?'DECK ATIVO':deck.errors.length?'RASCUNHO':'PRONTO PARA ATIVAR';
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#19243a"/><stop offset="1" stop-color="#090e1a"/></linearGradient></defs><rect width="1200" height="1090" rx="28" fill="url(#bg)"/><rect x="1" y="1" width="1198" height="1088" rx="28" fill="none" stroke="#3a4862"/>`;
 svg+=text(36,42,'OFICINA DE DECKS',17,'#a99bff',700)+text(36,86,deck.name,34,'#ffffff',700,790);
 svg+=text(917,45,`${deck.total} / 30 CARTAS`,23,'#ffffff',700)+text(917,103,`ADICIONAL: ${deck.extraTotal??0}/6`,13,'#a8b4cb',700)+text(917,77,status,14,deck.errors.length?'#f4c476':'#76dfb7',700,245);
 svg+='<path d="M36 110H1164" stroke="#34415a"/>'+text(36,141,'SUAS CARTAS  /  SELECIONE NO MENU ABAIXO',14,'#a8b4cb',700);
 for(const [i,id] of v.visible.entries()){
  const c=getCard(id)!;const x=36+(i%3)*278,y=160+Math.floor(i/3)*421;const selected=id===v.selected;
  svg+=`<rect x="${x}" y="${y}" width="254" height="400" rx="15" fill="${selected?'#28243e':'#151f31'}" stroke="${selected?'#b59aff':'#334158'}" stroke-width="${selected?3:1}"/>`;
  svg+=`<rect x="${x+16}" y="${y+14}" width="222" height="322" rx="7" fill="#202c42"/>`;
  const bytes=art.get(id);
  if(bytes){try{overlays.push({input:await sharp(bytes,{limitInputPixels:20_000_000}).resize(222,322,{fit:'contain',background:'#202c42'}).png().toBuffer(),left:x+16,top:y+14});}catch{art.delete(id);}}
  if(!art.has(id))svg+=text(x+31,y+166,'IMAGEM INDISPONÍVEL',13,'#a8b4cb',700,195)+text(x+35,y+194,c.id,17,'#ffffff',700);
  svg+=text(x+16,y+361,c.name,17,'#ffffff',700,222)+text(x+16,y+386,`NO DECK ${qty(id)}   /   POSSUI ${have(id)}`,14,selected?'#c9b8ff':'#9cabc5',700,222);
 }
 if(!v.visible.length)svg+=text(80,350,'Escolha seu conjunto inicial com /start.',25,'#a8b4cb',700,720);
 svg+='<rect x="882" y="132" width="282" height="870" rx="18" fill="#111b2c" stroke="#34415a"/>'+text(904,165,'CARTA SELECIONADA',14,'#b59aff',700);
 const selected=v.selected&&getCard(v.selected);
 if(selected){
  svg+=text(904,203,selected.name,22,'#ffffff',700,238);
  const bytes=art.get(selected.id);
  if(bytes){try{overlays.push({input:await sharp(bytes,{limitInputPixels:20_000_000}).resize(238,347,{fit:'contain',background:'#111b2c'}).png().toBuffer(),left:904,top:224});}catch{}}
  else svg+='<rect x="904" y="224" width="238" height="347" rx="10" fill="#202c42"/>'+text(925,400,'SEM IMAGEM',20,'#a8b4cb',700);
  svg+=text(904,612,`${qty(selected.id)} NO DECK`,26,'#ffffff',700)+text(904,645,`${have(selected.id)} cópia(s) na coleção`,17,'#a8b4cb',400,238);
  svg+=text(904,697,selected.fusion?'MONSTRO DE FUSÃO':selected.field?'MAGIA DE CAMPO':selected.kind==='monster'?'MONSTRO NORMAL':selected.kind==='spell'?'MAGIA':'ARMADILHA',17,'#76dfb7',700);
  if(selected.kind==='monster')svg+=text(904,732,`NÍVEL ${selected.level}`,20,'#ffffff',700)+text(904,766,`ATK ${selected.atk} / DEF ${selected.defense}`,19,'#ffffff',700,238);
  svg+=text(904,812,`ID ${selected.id}`,15,'#9cabc5',400);
 }
 svg+=text(904,904,'Use +1 e -1 abaixo.',18,'#c9b8ff',700,238)+text(904,937,'Alterações salvas na hora.',16,'#a8b4cb',400,238)+text(904,971,'A coleção permanece intacta.',15,'#a8b4cb',400,238);
 svg+='<path d="M36 1022H1164" stroke="#34415a"/>'+text(36,1057,`ESPAÇO ${deck.slot}/3   •   PÁGINA ${v.page}/${v.pages}`,16,'#a8b4cb',700)+text(648,1057,'20–30 CARTAS   /   ATÉ 3 CÓPIAS',16,'#a8b4cb',700);
 svg+='</svg>';
 return sharp(Buffer.from(svg)).composite(overlays).png().toBuffer();
}
