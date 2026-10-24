import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import {atk,def,type DuelState,type CardRef} from './duelEngine';
export const phaseNames:Record<string,string>={main:'FASE PRINCIPAL',battle:'BATALHA',response:'RESPOSTA',choice:'ESCOLHA',discard:'DESCARTE',finished:'FINALIZADO'};
let queue=Promise.resolve();let waiting=0;
export async function renderDuel(s:DuelState,viewer?:string,provider=getCardArt):Promise<Buffer>{
 if(waiting>=4)throw new Error('O campo visual está ocupado. Atualize em alguns segundos.');waiting++;const previous=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await previous;
 try{return await draw(s,viewer,provider);}finally{waiting--;release();}
}
async function draw(s:DuelState,viewer:string|undefined,provider:typeof getCardArt){
 const privateIndex=s.players.findIndex(p=>p.id===viewer);const bottom=privateIndex<0?0:privateIndex,top=1-bottom;
 const hand=privateIndex<0?[]:s.players[privateIndex].hand;const height=hand.length?1360:1020;const overlays:sharp.OverlayOptions[]=[];
 const wanted=new Set<string>();for(const p of s.players){for(const m of p.monsters)if(m.faceUp||p.id===viewer)wanted.add(m.id);for(const c of p.backrow)if(c.faceUp||p.id===viewer)wanted.add(c.id);}for(const p of s.players){if(p.field&&(p.field.faceUp||p.id===viewer))wanted.add(p.field.id);const last=p.grave.at(-1);if(last)wanted.add(last.id);}for(const c of hand)wanted.add(c.id);
 const art=new Map<string,Buffer>();const ids=[...wanted];for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async id=>{try{const b=await provider(id);if(b)art.set(id,b);}catch{}}));
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#1c2840"/><stop offset="1" stop-color="#0a101e"/></linearGradient></defs><rect width="1400" height="${height}" rx="26" fill="url(#bg)"/><rect x="1" y="1" width="1398" height="${height-2}" rx="26" fill="none" stroke="#455578"/>`;
 svg+=text(32,42,'ARENA DE DUELOS',20,'#b59aff',700)+text(32,80,`TURNO ${s.turn}  /  ${phaseNames[s.phase]}`,24,'#ffffff',700);
 const acting=s.phase==='response'?s.priority:s.phase==='choice'?s.choice!.actor:s.current;
 svg+=text(670,43,s.phase==='finished'?'DUELO ENCERRADO':`AGUARDANDO: ${s.players[acting].name}`,18,'#76dfb7',700,495)+text(670,78,viewer?'PAINEL PRIVADO / SUA MÃO ABAIXO':'CAMPO PÚBLICO / MÃOS OCULTAS',15,'#a9b7d0',700,495);
 async function image(c:CardRef,x:number,y:number,w:number,h:number,visible:boolean,label:string,rotation=0){
  svg+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${visible?'#28344d':'#211a36'}" stroke="${visible?'#697ba0':'#8871bc'}"/>`;
  if(visible&&art.has(c.id)){try{overlays.push({input:await sharp(art.get(c.id)!,{limitInputPixels:20_000_000}).rotate(rotation).resize(w-8,h-8,{fit:'contain',background:'#28344d'}).png().toBuffer(),left:x+4,top:y+4});}catch{svg+=text(x+8,y+h/2,getCard(c.id)!.name,13,'#ffffff',700,w-16);}}
  else if(visible)svg+=text(x+8,y+h/2,getCard(c.id)!.name,13,'#ffffff',700,w-16);
  else svg+=`<path d="M${x+12} ${y+12}L${x+w-12} ${y+h-12}M${x+w-12} ${y+12}L${x+12} ${y+h-12}" stroke="#665086"/>`+text(x+8,y+h/2,label,12,'#c2b0e6',700,w-16);
 }
 for(const [idx,index]of [top,bottom].entries()){
  const p=s.players[index],upper=idx===0;const my=p.id===viewer;const monsterY=upper?230:555,backY=upper?122:852;
  svg+=`<rect x="24" y="${upper?112:540}" width="1352" height="${upper?388:400}" rx="18" fill="${index===s.current?'#192a3c':'#131e30'}" stroke="#34445e"/>`;
  svg+=text(42,upper?145:580,p.name,23,'#ffffff',700,195)+text(42,upper?187:622,`${p.lp} PV`,32,p.lp>1000?'#76dfb7':'#ff8c9a',700,195);
  svg+=text(42,upper?225:660,`MÃO: ${p.hand.length}`,17,'#b8c6df',700)+text(42,upper?256:691,`DECK: ${p.deck.length}`,17,'#b8c6df',700)+text(42,upper?287:722,`CEMITÉRIO: ${p.grave.length}`,16,'#b8c6df',700,195);
  const grave=p.grave.at(-1);if(grave){await image(grave,42,upper?318:735,72,102,true,'');svg+=text(122,upper?355:774,'CEMITÉRIO',12,'#a8b8d3',700)+text(122,upper?380:799,`${p.grave.length} CARTAS`,15,'#ffffff',700);}
  svg+=`<rect x="1100" y="${upper?122:550}" width="260" height="218" rx="12" fill="#101a2c" stroke="#6a925f"/>`+text(1116,upper?146:574,'MAGIA DE CAMPO',14,'#a8d08d',700);
  if(p.field){await image(p.field,1116,upper?158:586,90,138,p.field.faceUp||my,'CAMPO');svg+=text(1218,upper?205:633,p.field.faceUp||my?getCard(p.field.id)!.name:'Baixada',17,'#ffffff',700,128)+text(1218,upper?235:663,p.field.faceUp?'ATIVA':'OCULTA',12,'#a8b8d3',700);}
  else svg+=text(1143,upper?240:668,'ZONA VAZIA',20,'#405575',700);
  svg+=`<rect x="1100" y="${upper?354:800}" width="260" height="126" rx="12" fill="#211d34" stroke="#7b65a5"/>`+text(1116,upper?381:827,'DECK ADICIONAL',14,'#c9b8ff',700)+text(1116,upper?420:866,`${p.extra?.length??0} CARTA(S)`,24,'#ffffff',700)+text(1116,upper?455:901,`BANIDAS: ${p.banished?.length??0}`,13,'#a8b8d3',700);

  for(let zone=0;zone<3;zone++){
   const x=278+zone*288;const m=p.monsters[zone],b=p.backrow[zone];
   svg+=`<rect x="${x}" y="${monsterY}" width="216" height="244" rx="12" fill="#0d1728" stroke="#34445e" stroke-dasharray="6 6"/>`;
   if(m){const visible=m.faceUp||my;await image(m,x+(m.position==='def'?10:34),monsterY+(m.position==='def'?40:8),m.position==='def'?196:148,m.position==='def'?136:190,visible,'MONSTRO',m.position==='def'?90:0);
    svg+=text(x+10,monsterY+219,visible?getCard(m.id)!.name:'Virado para baixo',15,'#ffffff',700,196)+text(x+10,monsterY+239,visible?`${m.faceUp?m.position.toUpperCase():'DEF BAIXADO'} | ${atk(m,s)} / ${def(m,s)}`:'DEF / IDENTIDADE OCULTA',13,'#a8b8d3',700,196);
   }else svg+=text(x+26,monsterY+125,`MONSTRO ${zone+1}`,17,'#405575',700);
   svg+=`<rect x="${x}" y="${backY}" width="216" height="88" rx="10" fill="#0d1728" stroke="#34445e" stroke-dasharray="5 5"/>`;
   if(b){await image(b,x+8,backY+5,50,76,b.faceUp||my,'BAIXADA');svg+=text(x+68,backY+39,b.faceUp||my?getCard(b.id)!.name:'Carta baixada',15,'#c9b8ff',700,140)+text(x+68,backY+65,b.faceUp?'ATIVADA':'VIRADA PARA BAIXO',11,'#a8b8d3',700,140);}
   else svg+=text(x+30,backY+51,`MAGIA / ARMADILHA ${zone+1}`,13,'#405575',700,175);
  }
 }
 svg+=text(36,523,s.log.at(-1)??'',17,'#c9b8ff',700,1120)+text(32,977,s.phase==='finished'?`${s.winner?s.players.find(p=>p.id===s.winner)!.name+' venceu':'Duelo encerrado'}: ${s.reason}`:'Use o painel privado para jogar. A mão do adversário nunca aparece aqui.',17,'#a8b8d3',400,1136);
 if(hand.length){svg+='<path d="M24 1007H1376" stroke="#425577"/>'+text(32,1040,'SUA MÃO / VISÍVEL APENAS PARA VOCÊ',16,'#b59aff',700);
  for(const [i,c]of hand.slice(0,7).entries()){const x=30+i*166;await image(c,x,1060,148,215,true,'');svg+=text(x,1300,getCard(c.id)!.name,13,'#ffffff',700,150)+text(x,1325,`CARTA ${i+1}`,12,'#879bbd',700);}
 }
 return sharp(Buffer.from(svg+'</svg>')).composite(overlays).png().toBuffer();
}
