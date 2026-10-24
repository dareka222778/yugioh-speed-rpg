import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import {atk,def,decisionPlayer,type DuelState,type CardRef} from './duelEngine';
export const phaseNames:Record<string,string>={main:'FASE PRINCIPAL',battle:'BATALHA',response:'RESPOSTA',choice:'ESCOLHA',discard:'DESCARTE',finished:'FINALIZADO'};
let queue=Promise.resolve();let waiting=0;
const cache=new Map<string,Buffer>();
export async function renderDuel(s:DuelState,viewer?:string,provider=getCardArt):Promise<Buffer>{
 // Separate public/private keys: a cached private hand must never reach the arena.
 const key=provider===getCardArt?JSON.stringify([viewer??null,s]):null;
 if(key&&cache.has(key))return cache.get(key)!;
 if(waiting>=4)throw new Error('O campo visual está ocupado. Atualize em alguns segundos.');waiting++;const previous=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await previous;
 try{if(key&&cache.has(key))return cache.get(key)!;const png=await draw(s,viewer,provider);if(key){cache.set(key,png);while(cache.size>8)cache.delete(cache.keys().next().value!);}return png;}finally{waiting--;release();}
}
async function draw(s:DuelState,viewer:string|undefined,provider:typeof getCardArt){
 const privateIndex=s.players.findIndex(p=>p.id===viewer),bottom=privateIndex<0?0:privateIndex,top=1-bottom;
 const hand=privateIndex<0?[]:s.players[privateIndex].hand,offset=hand.length?340:0,height=1020+offset;
 const overlays:sharp.OverlayOptions[]=[],wanted=new Set<string>();
 for(const p of s.players){for(const c of [...p.monsters,...p.backrow,...(p.field?[p.field]:[])])if(c.faceUp||p.id===viewer)wanted.add(c.id);if(p.grave.at(-1))wanted.add(p.grave.at(-1)!.id);}for(const c of hand)wanted.add(c.id);
 const art=new Map<string,Buffer>(),ids=[...wanted];for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async id=>{try{const b=await provider(id);if(b)art.set(id,b);}catch{}}));
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#172b3b"/><stop offset="1" stop-color="#07131e"/></linearGradient><radialGradient id="back"><stop stop-color="#251437"/><stop offset=".45" stop-color="#a05b27"/><stop offset=".7" stop-color="#321c39"/><stop offset="1" stop-color="#110f22"/></radialGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#456274" stroke-opacity=".12"/></pattern></defs><rect width="1400" height="${height}" rx="24" fill="url(#bg)"/><rect width="1400" height="${height}" fill="url(#grid)"/>`;
 function rect(x:number,y:number,w:number,h:number,fill:string,stroke='#365065',r=12){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;}
 function back(x:number,y:number,w:number,h:number){let v=rect(x,y,w,h,'#cda669','#d7bd88',6)+rect(x+4,y+4,w-8,h-8,'url(#back)','#151424',4);for(let i=0;i<8;i++)v+=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w*(.12+i*.035)}" ry="${h*(.12+i*.037)}" fill="none" stroke="${i%2?'#c38c48':'#6f453b'}" stroke-width="1.5" transform="rotate(${i*19} ${x+w/2} ${y+h/2})"/>`;return v+`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w*.12}" ry="${h*.16}" fill="#121225" stroke="#dab475"/>`;}
 async function image(c:CardRef,x:number,y:number,w:number,h:number,visible:boolean,rotation=0){
  if(!visible){svg+=back(x,y,w,h);return;}
  svg+=rect(x,y,w,h,'#152333','#7592a6',6);
  if(art.has(c.id)){try{overlays.push({input:await sharp(art.get(c.id)!,{limitInputPixels:20_000_000}).rotate(rotation).resize(w-4,h-4,{fit:'contain',background:'#152333'}).png().toBuffer(),left:x+2,top:y+2});return;}catch{}}
  svg+=text(x+7,y+h/2,getCard(c.id)!.name,14,'#ffffff',700,w-14);
 }
 if(hand.length){
  const p=s.players[privateIndex];svg+=rect(16,12,1368,316,'#0a1825','#598d99',18)+text(36,42,'SUA MÃO',22,'#8aebcf',700)+text(260,41,`${hand.length} CARTAS  •  BARALHO: ${p.deck.length} PARA COMPRAR`,17,'#c1d6df',700)+text(1010,41,'SÓ VOCÊ VÊ ESTAS CARTAS',13,'#90a7ba',700);
  for(const [i,c] of hand.slice(0,7).entries()){const x=35+i*192;await image(c,x,57,160,211,true);svg+=text(x,290,`${i+1}. ${getCard(c.id)!.name}`,14,'#ffffff',700,178);const info=getCard(c.id)!;svg+=text(x,313,info.kind==='monster'?`ATK ${info.atk} / DEF ${info.defense}`:info.field?'MAGIA DE CAMPO':info.kind==='trap'?'ARMADILHA':'MAGIA',12,'#8aebcf',700,180);}
 }
 const T=(x:number,y:number,v:string,size=16,color='#b8ced9',weight=700,width=1300)=>text(x,y+offset,v,size,color,weight,width);
 svg+=T(28,34,'SPEED RPG  /  ARENA',19,'#d9bc7c')+T(28,73,`TURNO ${s.turn}  •  ${phaseNames[s.phase]}`,26,'#ffffff');
 svg+=T(830,38,s.phase==='finished'?'DUELO ENCERRADO':`AGORA: ${s.players[decisionPlayer(s)].name}`,20,'#8aebcf',700,540)+T(830,72,viewer?'PAINEL PRIVADO • MÃO NO TOPO':'CAMPO PÚBLICO • MÃOS OCULTAS',14,'#9bb4c6',700,540);
 for(const [row,index] of [top,bottom].entries()){
  const p=s.players[index],upper=row===0,my=p.id===viewer,y=upper?110:548,accent=index===s.current?'#bca264':'#446878';
  svg+=rect(20,y+offset,1360,414,'#0b1c2a',accent,18)+T(40,y+31,p.name,22,'#ffffff',700,246)+T(40,y+72,`${p.lp} PV`,32,p.lp>1000?'#8aebcf':'#ff879a',700,242);
  const ratio=Math.max(0,Math.min(1,p.lp/4000));svg+=rect(40,y+85+offset,228,7,'#243c48','#243c48',3);if(ratio)svg+=rect(40,y+85+offset,228*ratio,7,'#69c9ae','#69c9ae',3);
  svg+=T(40,y+117,`MÃO ${p.hand.length}  •  BANIDAS ${p.banished?.length??0}`,13,'#9bb4c6',700,240);
  // A field spell has its own socket; it never occupies one of the three backrow slots.
  svg+=rect(38,y+137+offset,108,183,'#112a2b','#537f72')+T(44,y+155,'CAMPO',12,'#8aebcf',700,94);
  if(p.field)await image(p.field,48,y+165+offset,88,126,p.field.faceUp||my);else svg+=T(50,y+235,'VAZIO',13,'#486c70');
  svg+=T(46,y+309,p.field?.faceUp?'ATIVA':p.field?'BAIXADA':'MAGIA',11,'#8aebcf',700,95);
  svg+=rect(162,y+137+offset,108,183,'#182431','#647b89')+T(167,y+155,'CEMITÉRIO',11,'#b8ced9',700,100);
  const grave=p.grave.at(-1);if(grave)await image(grave,172,y+165+offset,88,126,true);
  svg+=T(177,y+309,`${p.grave.length} CARTAS`,12,'#ffffff',700,90);
  const deckX=1184;if(p.deck.length)for(let layer=2;layer>=0;layer--)svg+=back(deckX+layer*4,y+37+offset-layer*3,112,151);else svg+=rect(deckX,y+37+offset,112,151,'#102632','#4e7d8b')+T(deckX+18,y+120,'VAZIO',16,'#4c7382',700,90);
  svg+=T(1130,y+216,`${p.deck.length} PARA COMPRAR`,21,'#f0d38c',700,240);
  svg+=rect(1120,y+237+offset,238,135,'#171c32','#75688d')+T(1134,y+261,'DECK ADICIONAL',13,'#c9b8f2',700,212);
  if((p.extra?.length??0)>0)svg+=back(1137,y+275+offset,48,65);
  svg+=T(1200,y+311,`${p.extra?.length??0}`,30,'#ffffff',700,100)+T(1200,y+337,'CARTAS',12,'#9bb4c6');
  for(let zone=0;zone<3;zone++){
   const x=302+zone*266,monsterY=y+(upper?213:14),backY=y+(upper?14:213),m=p.monsters[zone],b=p.backrow[zone];
   svg+=rect(x,monsterY+offset,238,191,'#102632','#4e7d8b');
   if(m){const visible=m.faceUp||my;await image(m,x+(m.position==='def'?27:68),monsterY+5+offset,m.position==='def'?184:103,m.position==='def'?127:143,visible,m.position==='def'?90:0);svg+=T(x+8,monsterY+164,visible?getCard(m.id)!.name:'Carta virada para baixo',13,'#ffffff',700,221)+T(x+8,monsterY+183,visible?`${m.faceUp?m.position.toUpperCase():'DEF BAIXADA'}  •  ${atk(m,s)} / ${def(m,s)}`:'DEF • OCULTA',13,'#8aebcf',700,221);}
   else svg+=T(x+40,monsterY+101,`MONSTRO ${zone+1}`,18,'#4c7382',700,190);
   svg+=rect(x,backY+offset,238,191,'#192036','#655e85');
   if(b){await image(b,x+68,backY+5+offset,103,143,b.faceUp||my);svg+=T(x+8,backY+164,b.faceUp||my?getCard(b.id)!.name:'Carta virada para baixo',13,'#ded5f0',700,221)+T(x+8,backY+183,b.faceUp?'ATIVADA':my?'BAIXADA • SÓ VOCÊ VÊ':'OCULTA',11,'#a89bc7',700,221);}
   else svg+=T(x+19,backY+100,`MAGIA / ARMADILHA ${zone+1}`,14,'#766a94',700,211);
  }
 }
 svg+=T(36,541,s.log.at(-1)??'',15,'#e6c989',700,1320)+T(32,994,s.phase==='finished'?`${s.winner?s.players.find(p=>p.id===s.winner)!.name+' venceu':'Duelo encerrado'}: ${s.reason}`:'M1–M3: monstros  •  A1–A3: magias / armadilhas  •  O número no baralho indica as próximas compras.',15,'#9bb4c6',400,1330);
 return sharp(Buffer.from(svg+'</svg>')).composite(overlays).png().toBuffer();
}
