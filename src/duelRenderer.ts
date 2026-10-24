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
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}"><defs>
 <linearGradient id="bg" x2="0" y2="1"><stop stop-color="#282328"/><stop offset=".5" stop-color="#51474a"/><stop offset="1" stop-color="#242128"/></linearGradient>
 <linearGradient id="stone" x2="1" y2="1"><stop stop-color="#928785"/><stop offset=".45" stop-color="#625b60"/><stop offset="1" stop-color="#48434e"/></linearGradient>
 <linearGradient id="gold" x2="0" y2="1"><stop stop-color="#fff0bb"/><stop offset=".3" stop-color="#c7a267"/><stop offset=".6" stop-color="#775630"/><stop offset="1" stop-color="#dfc395"/></linearGradient>
 <linearGradient id="hud" x2="0" y2="1"><stop stop-color="#561f2a"/><stop offset="1" stop-color="#180f1c"/></linearGradient>
 <radialGradient id="back"><stop stop-color="#060403"/><stop offset=".24" stop-color="#160a03"/><stop offset=".63" stop-color="#8f4817"/><stop offset=".85" stop-color="#3b1b08"/><stop offset="1" stop-color="#110905"/></radialGradient>
 <pattern id="grid" width="93" height="93" patternUnits="userSpaceOnUse"><path d="M93 0H0V93M8 8H85V85H8Z" fill="none" stroke="#dfcab5" stroke-opacity=".08"/><path d="M0 46H93M46 0V93" stroke="#0f0d16" stroke-opacity=".12"/></pattern>
 </defs><rect width="1400" height="${height}" fill="url(#bg)"/><rect x="9" y="9" width="1382" height="${height-18}" fill="none" stroke="url(#gold)" stroke-width="6"/><rect x="19" y="19" width="1362" height="${height-38}" fill="none" stroke="#a88c68"/>`;
 function rect(x:number,y:number,w:number,h:number,fill:string,stroke='#aa8b62',r=2){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;}
 let backNumber=0;
 function back(x:number,y:number,w:number,h:number){
  const clip=`vortex-${backNumber++}`,cx=x+w/2,cy=y+h/2;
  let v=rect(x,y,w,h,'#ab662c','#e9b773',3)+rect(x+3,y+3,w-6,h-6,'#271105','#4d2b0e',2)+`<defs><clipPath id="${clip}"><rect x="${x+5}" y="${y+5}" width="${w-10}" height="${h-10}" rx="1"/></clipPath></defs><g clip-path="url(#${clip})"><rect x="${x+5}" y="${y+5}" width="${w-10}" height="${h-10}" fill="url(#back)"/>`;
  // Continuous logarithmic whorls form the classic amber vortex, not orbital rings.
  for(let arm=0;arm<14;arm++){
   const points:string[]=[];for(let n=0;n<=260;n++){const t=n/260*32,r=.035*Math.exp(.135*t),angle=t+arm*Math.PI*2/14;const px=cx+Math.cos(angle)*w*.48*r,py=cy+Math.sin(angle)*h*.49*r;points.push(`${n?'L':'M'}${px.toFixed(2)} ${py.toFixed(2)}`);}
   v+=`<path d="${points.join(' ')}" fill="none" stroke="${arm%3===0?'#e6a451':arm%3===1?'#2a1005':'#b76620'}" stroke-width="${w*(arm%3===0?.009:.025)}" opacity=".83"/>`;
  }
  return v+`<ellipse cx="${cx}" cy="${cy}" rx="${w*.15}" ry="${h*.24}" fill="#090503" transform="rotate(20 ${cx} ${cy})"/><ellipse cx="${cx}" cy="${cy}" rx="${w*.18}" ry="${h*.28}" fill="none" stroke="#a35c27" stroke-width="${w*.012}" transform="rotate(20 ${cx} ${cy})"/></g>`;
 }
 async function image(c:CardRef,x:number,y:number,w:number,h:number,visible:boolean,rotation=0){
  if(!visible){svg+=back(x,y,w,h);return;}
  svg+=rect(x,y,w,h,'#152333','#7592a6',6);
  if(art.has(c.id)){try{overlays.push({input:await sharp(art.get(c.id)!,{limitInputPixels:20_000_000}).rotate(rotation).resize(w-4,h-4,{fit:'contain',background:'#152333'}).png().toBuffer(),left:x+2,top:y+2});return;}catch{}}
  svg+=text(x+7,y+h/2,getCard(c.id)!.name,14,'#ffffff',700,w-14);
 }
 if(hand.length){
  const p=s.players[privateIndex];svg+=rect(16,12,1368,316,'#211920','#bda477',3)+text(36,42,'SUA MÃO',22,'#f0d59c',700)+text(260,41,`${hand.length} CARTAS  •  BARALHO: ${p.deck.length} PARA COMPRAR`,17,'#ddd2c6',700)+text(1010,41,'SÓ VOCÊ VÊ ESTAS CARTAS',13,'#c2ae98',700);
  for(const [i,c] of hand.slice(0,7).entries()){const x=35+i*192;await image(c,x,57,160,211,true);svg+=text(x,290,`${i+1}. ${getCard(c.id)!.name}`,14,'#ffffff',700,178);const info=getCard(c.id)!;svg+=text(x,313,info.kind==='monster'?`ATK ${info.atk} / DEF ${info.defense}`:info.field?'MAGIA DE CAMPO':info.kind==='trap'?'ARMADILHA':'MAGIA',12,'#f0d59c',700,180);}
 }
 const T=(x:number,y:number,v:string,size=16,color='#b8ced9',weight=700,width=1300)=>text(x,y+offset,v,size,color,weight,width);
 svg+=rect(28,24+offset,1344,68,'url(#hud)','#cfac73',3)+T(49,53,'DUEL FIELD',27,'#f5d9a0')+T(49,78,'SPEED RPG  /  DUELO CLÁSSICO',12,'#c4a884');
 svg+=T(420,52,`TURNO ${s.turn}`,22,'#ffffff')+T(420,78,phaseNames[s.phase],15,'#f5d9a0');
 svg+=T(835,52,s.phase==='finished'?'DUELO ENCERRADO':`VEZ DE ${s.players[decisionPlayer(s)].name}`,20,'#f0d59c',700,510)+T(835,78,viewer?'SUA MÃO ESTÁ NO PAINEL ACIMA':'CAMPO PÚBLICO • CARTAS OCULTAS',12,'#c4b9ae',700,510);
 // Mirrored playmat: opposing monsters meet at the center, spells remain behind them.
 svg+=rect(29,105+offset,1342,854,'url(#stone)','#c9b38c',0)+`<rect x="29" y="${105+offset}" width="1342" height="854" fill="url(#grid)"/>`;
 for(const [row,index] of [top,bottom].entries()){
  const p=s.players[index],upper=row===0,my=p.id===viewer,y=upper?112:548,accent=index===s.current?'#f0cb79':'#ad9e8c';
  svg+=rect(36,y+offset,260,156,'url(#hud)',accent,3)+rect(42,y+6+offset,248,144,'none','#7d6150',2)+T(53,y+33,p.name,23,'#ffffff',700,230)+T(53,y+58,viewer?(my?'SEU CAMPO':'ADVERSÁRIO'):'DUELISTA',11,'#d6b481');
  svg+=T(53,y+102,`LP  ${String(p.lp).padStart(4,'0')}`,36,p.lp>1000?'#fff0b1':'#ff879a',700,230);
  const ratio=Math.max(0,Math.min(1,p.lp/4000));svg+=rect(53,y+115+offset,220,8,'#120d13','#806342',0);if(ratio)svg+=rect(53,y+115+offset,220*ratio,8,'url(#gold)','#e8c88a',0);
  svg+=T(53,y+144,`MÃO: ${p.hand.length}   •   BANIDAS: ${p.banished?.length??0}`,12,'#d0bda8',700,230);
  // Field spell, deck, graveyard and Extra Deck remain outside the two main rows.
  svg+=rect(94,y+175+offset,140,207,'#313d39','#bdb99b',1)+T(104,y+195,'MAGIA DE CAMPO',12,'#e0dcc2',700,125);
  if(p.field)await image(p.field,107,y+203+offset,114,153,p.field.faceUp||my);else svg+=T(124,y+288,'CAMPO',17,'#8e9d8e',700,110);
  svg+=T(108,y+374,p.field?.faceUp?'ATIVA':p.field?'BAIXADA':'ZONA DE CAMPO',11,'#d1d1b0',700,120);
  const deckX=1124,graveX=1251;
  svg+=T(1114,y+20,'DECK',13,'#fff0b1',700,108)+T(1240,y+20,'CEMITÉRIO',12,'#f1e8d9',700,120);
  svg+=rect(deckX,y+32+offset,104,147,'#30292b','#d3b17b',1)+rect(graveX,y+32+offset,104,147,'#34323b','#c3beb8',1);
  if(p.deck.length)for(let layer=2;layer>=0;layer--)svg+=back(deckX+layer*2,y+32+offset-layer*2,104,147);else svg+=T(deckX+16,y+112,'VAZIO',15,'#c5b59f',700,90);
  const grave=p.grave.at(-1);if(grave)await image(grave,graveX+3,y+35+offset,98,141,true);else svg+=T(graveX+12,y+112,'VAZIO',15,'#9b96a5',700,90);
  svg+=T(1139,y+207,`${p.deck.length}`,30,'#ffe09c',700,92)+T(1267,y+207,`${p.grave.length}`,30,'#eee8df',700,92)+T(1118,y+230,'PARA COMPRAR',12,'#eee1cc',700,120)+T(1256,y+230,'CARTAS',12,'#eee1cc',700,90);
  svg+=rect(1110,y+255+offset,245,131,'#302738','#c6a6d0',2)+T(1124,y+278,'DECK ADICIONAL',13,'#e1c6ea',700,212);
  if((p.extra?.length??0)>0)svg+=back(1124,y+290+offset,48,67);
  svg+=T(1200,y+327,`${p.extra?.length??0}`,30,'#ffffff',700,100)+T(1200,y+351,'CARTAS',12,'#c8b3ce');
  for(let zone=0;zone<3;zone++){
   const x=338+zone*252,monsterY=y+(upper?215:10),backY=y+(upper?10:215),m=p.monsters[zone],b=p.backrow[zone];
   function socket(zY:number,magic:boolean){
    svg+=rect(x-5,zY-4+offset,206,196,'#40383a','#c9b38e',0)+rect(x,zY+offset,196,188,magic?'#3a4249':'#55484c',magic?'#b6bec7':'#d3b3a1',0);
    svg+=`<path d="M${x+8} ${zY+30+offset}V${zY+8+offset}H${x+31}M${x+165} ${zY+8+offset}H${x+188}V${zY+30+offset}M${x+8} ${zY+158+offset}V${zY+180+offset}H${x+31}M${x+165} ${zY+180+offset}H${x+188}V${zY+158+offset}" fill="none" stroke="${magic?'#c3c9d5':'#dfbea9'}" stroke-width="2"/>`;
   }
   socket(monsterY,false);
   if(m){const visible=m.faceUp||my;await image(m,x+(m.position==='def'?12:45),monsterY+5+offset,m.position==='def'?172:106,m.position==='def'?119:145,visible,m.position==='def'?90:0);svg+=T(x+7,monsterY+164,visible?getCard(m.id)!.name:'Virado para baixo',12,'#ffffff',700,184)+T(x+7,monsterY+182,visible?`${m.faceUp?m.position.toUpperCase():'DEF BAIXADA'}  ${atk(m,s)} / ${def(m,s)}`:'DEF • OCULTA',12,'#f0d59c',700,184);}
   else svg+=T(x+37,monsterY+83,'MONSTRO',18,'#bca7a3',700,142)+T(x+83,monsterY+112,`${zone+1}`,26,'#bca7a3',700,45);
   socket(backY,true);
   if(b){await image(b,x+45,backY+5+offset,106,145,b.faceUp||my);svg+=T(x+7,backY+164,b.faceUp||my?getCard(b.id)!.name:'Virada para baixo',12,'#f1e8f2',700,184)+T(x+7,backY+182,b.faceUp?'ATIVADA':my?'BAIXADA • SÓ VOCÊ VÊ':'OCULTA',10,'#d2c4df',700,184);}
   else svg+=T(x+31,backY+80,'MAGIA /',17,'#acb4c5',700,151)+T(x+19,backY+105,'ARMADILHA',17,'#acb4c5',700,164)+T(x+86,backY+136,`${zone+1}`,24,'#acb4c5',700,35);
  }
 }
 // Central duel line, inspired by engraved playmats rather than dashboard panels.
 svg+=`<path d="M40 ${532+offset}H604L624 ${518+offset}H776L796 ${532+offset}H1360M40 ${536+offset}H604L624 ${550+offset}H776L796 ${536+offset}H1360" fill="none" stroke="#dfc89f" stroke-width="2"/>`+T(657,540,'DUEL',17,'#ffe7b5',700,110);
 svg+=T(35,984,s.log.at(-1)??'',13,'#e6c989',700,1320)+T(35,1007,s.phase==='finished'?`${s.winner?s.players.find(p=>p.id===s.winner)!.name+' venceu':'Duelo encerrado'}: ${s.reason}`:'M1–M3: monstros  •  A1–A3: magias / armadilhas  •  O número no baralho indica as próximas compras.',11,'#cfc1b4',400,1330);
 return sharp(Buffer.from(svg+'</svg>')).composite(overlays).png().toBuffer();
}
