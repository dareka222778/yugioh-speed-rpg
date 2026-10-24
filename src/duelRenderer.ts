import sharp from 'sharp';
import {CARD_BACK_PNG,CARD_BACK_WIDTH,CARD_BACK_HEIGHT} from './cardBackAsset';
import {outlineText as text} from './fontPaths';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import {azure,duelistAccents} from './duelTheme';
import {npcPortraits} from './npcPortraits';
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
 // Only encounter NPCs have bundled character art. Never infer portraits
 // from player names or request hidden card images to decorate the HUD.
 const npcIndex=s.encounter?s.players.findIndex(p=>p.id.startsWith('npc-')):-1;
 const portrait=s.encounter&&npcIndex>=0?npcPortraits[s.encounter.npcId]:undefined;
 const overlays:sharp.OverlayOptions[]=[],wanted=new Set<string>();
 for(const p of s.players){for(const c of [...p.monsters,...p.backrow,...(p.field?[p.field]:[])])if(c.faceUp||p.id===viewer)wanted.add(c.id);if(p.grave.at(-1))wanted.add(p.grave.at(-1)!.id);}for(const c of hand)wanted.add(c.id);
 const art=new Map<string,Buffer>(),ids=[...wanted];for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async id=>{try{const b=await provider(id);if(b)art.set(id,b);}catch{}}));
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}">
 <defs>
 <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${azure.deep}"/><stop offset=".48" stop-color="${azure.navy}"/><stop offset="1" stop-color="#030A18"/></linearGradient>
 <linearGradient id="stone" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#163F67"/><stop offset=".53" stop-color="#102C4B"/><stop offset="1" stop-color="#091C34"/></linearGradient>
 <linearGradient id="gold" x2="1" y2="0"><stop stop-color="#087BCC"/><stop offset=".42" stop-color="${azure.primary}"/><stop offset=".75" stop-color="${azure.primaryBright}"/><stop offset="1" stop-color="#1389CB"/></linearGradient>
 <linearGradient id="hud" x2="1" y2="1"><stop stop-color="#173F65"/><stop offset=".6" stop-color="#0D2948"/><stop offset="1" stop-color="#091D37"/></linearGradient>
 <radialGradient id="arenaGlow"><stop stop-color="#3EC7FF" stop-opacity=".13"/><stop offset="1" stop-color="#3EC7FF" stop-opacity="0"/></radialGradient>
 <filter id="energy"><feGaussianBlur stdDeviation="5"/></filter>
 <image id="card-back-image" width="${CARD_BACK_WIDTH}" height="${CARD_BACK_HEIGHT}" href="data:image/png;base64,${CARD_BACK_PNG}"/>
 <pattern id="grid" width="92" height="92" patternUnits="userSpaceOnUse"><path d="M92 0H0V92M12 12H80V80H12Z" fill="none" stroke="#9DDFFF" stroke-opacity=".065"/><path d="M0 46H92M46 0V92" stroke="#A1E6FF" stroke-opacity=".035"/></pattern>
 </defs>
 <rect width="1400" height="${height}" fill="url(#bg)"/>
 <rect x="11" y="11" width="1378" height="${height-22}" rx="20" fill="none" stroke="#227AB9" stroke-width="3"/>
 <rect x="18" y="18" width="1364" height="${height-36}" rx="16" fill="none" stroke="#94DBFF" stroke-opacity=".35"/>
 <path d="M28 42V28H260M1140 28H1372V42M28 ${height-54}V${height-28}H260M1140 ${height-28}H1372V${height-54}" fill="none" stroke="${azure.primary}" stroke-opacity=".8" stroke-width="4"/>`;
 function rect(x:number,y:number,w:number,h:number,fill:string,stroke='#aa8b62',r=2){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;}
 function back(x:number,y:number,w:number,h:number,rotation=0){
  // Reuse the uploaded pixels for every back; rotate the same portrait asset for DEF.
  const sideways=Math.abs(rotation)%180===90,pw=sideways?h:w,ph=sideways?w:h;
  const scale=Math.min(pw/CARD_BACK_WIDTH,ph/CARD_BACK_HEIGHT),rw=CARD_BACK_WIDTH*scale,rh=CARD_BACK_HEIGHT*scale;
  const cx=x+w/2,cy=y+h/2;
  return `<g transform="translate(${cx} ${cy}) rotate(${rotation})"><use href="#card-back-image" transform="translate(${-rw/2} ${-rh/2}) scale(${scale})"/></g>`;
 }
 async function image(c:CardRef,x:number,y:number,w:number,h:number,visible:boolean,rotation=0){
  if(!visible){svg+=back(x,y,w,h,rotation);return;}
  svg+=rect(x,y,w,h,azure.card,azure.line,8);
  if(art.has(c.id)){try{overlays.push({input:await sharp(art.get(c.id)!,{limitInputPixels:20_000_000}).rotate(rotation).resize(w-4,h-4,{fit:'contain',background:azure.card}).png().toBuffer(),left:x+2,top:y+2});return;}catch{}}
  svg+=text(x+7,y+h/2,getCard(c.id)!.name,14,'#ffffff',700,w-14);
 }
 if(hand.length){
  const p=s.players[privateIndex];svg+=rect(28,17,1344,304,'url(#hud)',azure.line,15)+text(48,48,'SUAS CARTAS',25,azure.text,700)+text(315,45,`${hand.length} NA MÃO   /   ${p.deck.length} NO DECK`,17,azure.muted,700)+text(1030,45,'VISÍVEL SÓ PARA VOCÊ',13,azure.primaryBright,700);
  for(const [i,c] of hand.slice(0,7).entries()){const x=36+i*192;svg+=rect(x-4,56,173,249,i%2===0?'#143655':'#11304E','#356E98',9);
 await image(c,x,62,160,209,true);svg+=text(x,288,`${i+1}. ${getCard(c.id)!.name}`,14,azure.text,700,165);
 const info=getCard(c.id)!;svg+=text(x,310,info.kind==='monster'?`ATK ${info.atk} / DEF ${info.defense}`:info.field?'MAGIA DE CAMPO':info.kind==='trap'?'ARMADILHA':'MAGIA',12,azure.primaryBright,700,169);}
 }
 const T=(x:number,y:number,v:string,size=16,color='#b8ced9',weight=700,width=1300)=>text(x,y+offset,v,size,color,weight,width);
 svg+=rect(29,24+offset,1342,68,'url(#hud)',azure.line,12)+T(50,53,'DUEL ARENA',27,azure.text)+T(50,78,'SPEED RPG   •   ERA CLÁSSICA',12,azure.primaryBright);
 svg+=T(430,52,`TURNO ${s.turn}`,22,azure.text)+T(430,78,phaseNames[s.phase],15,azure.primaryBright);
 svg+=T(828,52,s.phase==='finished'?'DUELO ENCERRADO':`AÇÃO: ${s.players[decisionPlayer(s)].name}`,20,azure.text,700,515)+T(828,78,viewer?'VISÃO PRIVADA   •   CARTAS REVELADAS':'VISÃO PÚBLICA   •   INFORMAÇÕES PROTEGIDAS',12,azure.muted,700,515);
 // Mirrored playmat: opposing monsters meet at the center, spells remain behind them.
 svg+=rect(29,105+offset,1342,854,'url(#stone)','#3C96CB',12)+`<rect x="29" y="${105+offset}" width="1342" height="854" fill="url(#grid)"/><ellipse cx="700" cy="${531+offset}" rx="520" ry="320" fill="url(#arenaGlow)"/>`;
 for(const [row,index] of [top,bottom].entries()){
  const p=s.players[index],upper=row===0,my=p.id===viewer,y=upper?112:548,accent=index===decisionPlayer(s)?azure.primary:azure.lineMuted;
  svg+=rect(36,y+offset,260,156,'url(#hud)',accent,11)+rect(42,y+6+offset,248,144,'none','#235579',8)+T(53,y+33,p.name,22,azure.text,700,npcIndex===index?160:230)+T(53,y+58,viewer?(my?'VOCÊ':'ADVERSÁRIO'):'DUELISTA',11,azure.primaryBright);
  if(portrait&&index===npcIndex){try{
   const npcPng=await sharp(Buffer.from(portrait,'base64')).resize(75,136,{fit:'contain'}).png().toBuffer();
   overlays.push({input:npcPng,left:220,top:y+offset+5});
  }catch{/* Character HUD remains legible without external images. */}}
  svg+=T(53,y+102,`LP ${String(p.lp).padStart(4,'0')}`,35,p.lp>1000?azure.text:azure.danger,700,230);
  const ratio=Math.max(0,Math.min(1,p.lp/4000));svg+=rect(53,y+115+offset,220,8,azure.deep,azure.lineMuted,4);if(ratio)svg+=rect(53,y+115+offset,220*ratio,8,'url(#gold)',azure.primary,4);
  svg+=T(53,y+144,`MÃO: ${p.hand.length}  •  BANIDAS: ${p.banished?.length??0}`,12,azure.muted,700,230);
  // Field spell, deck, graveyard and Extra Deck remain outside the two main rows.
  svg+=rect(94,y+175+offset,140,207,'#173B53','#469BCA',1)+T(104,y+195,'MAGIA DE CAMPO',12,'#B6E0F5',700,125);
  if(p.field)await image(p.field,107,y+203+offset,114,153,p.field.faceUp||my);else svg+=T(124,y+288,'CAMPO',17,'#8e9d8e',700,110);
  svg+=T(108,y+374,p.field?.faceUp?'ATIVA':p.field?'BAIXADA':'ZONA DE CAMPO',11,'#A6D5E9',700,120);
  const deckX=1124,graveX=1251;
  svg+=T(1114,y+20,'DECK',13,'#C4EFFF',700,108)+T(1240,y+20,'CEMITÉRIO',12,'#f1e8d9',700,120);
  svg+=rect(deckX,y+32+offset,104,147,'#142A47','#579ECF',1)+rect(graveX,y+32+offset,104,147,'#132B48','#4387BD',1);
  if(p.deck.length)for(let layer=2;layer>=0;layer--)svg+=back(deckX+layer*2,y+32+offset-layer*2,104,147);else svg+=T(deckX+16,y+112,'VAZIO',15,'#c5b59f',700,90);
  const grave=p.grave.at(-1);if(grave)await image(grave,graveX+3,y+35+offset,98,141,true);else svg+=T(graveX+12,y+112,'VAZIO',15,'#9b96a5',700,90);
  svg+=T(1139,y+207,`${p.deck.length}`,30,'#C4EFFF',700,92)+T(1267,y+207,`${p.grave.length}`,30,'#ECF8FF',700,92)+T(1118,y+230,'PARA COMPRAR',12,'#B4D3E9',700,120)+T(1256,y+230,'CARTAS',12,'#B4D3E9',700,90);
  svg+=rect(1110,y+255+offset,245,131,'#102C50','#377ECA',2)+T(1124,y+278,'DECK ADICIONAL',13,'#D2E9FF',700,212);
  if((p.extra?.length??0)>0)svg+=back(1124,y+290+offset,48,67);
  svg+=T(1200,y+327,`${p.extra?.length??0}`,30,'#ffffff',700,100)+T(1200,y+351,'CARTAS',12,'#B9D8F1');
  for(let zone=0;zone<3;zone++){
   const x=338+zone*252,monsterY=y+(upper?215:10),backY=y+(upper?10:215),m=p.monsters[zone],b=p.backrow[zone];
   function socket(zY:number,magic:boolean){
    svg+=rect(x-5,zY-4+offset,206,196,'#123451','#3E8FBE',0)+rect(x,zY+offset,196,188,magic?'#143657':'#20476B',magic?'#549FD7':'#4284AE',0);
    svg+=`<path d="M${x+8} ${zY+30+offset}V${zY+8+offset}H${x+31}M${x+165} ${zY+8+offset}H${x+188}V${zY+30+offset}M${x+8} ${zY+158+offset}V${zY+180+offset}H${x+31}M${x+165} ${zY+180+offset}H${x+188}V${zY+158+offset}" fill="none" stroke="${magic?'#8ACFF1':'#8ACFF1'}" stroke-width="2"/>`;
   }
   socket(monsterY,false);
   if(m){const visible=m.faceUp||my;await image(m,x+(m.position==='def'?12:45),monsterY+5+offset,m.position==='def'?172:106,m.position==='def'?119:145,visible,m.position==='def'?90:0);svg+=T(x+7,monsterY+164,visible?getCard(m.id)!.name:'Virado para baixo',12,'#ffffff',700,184)+T(x+7,monsterY+182,visible?`${m.faceUp?m.position.toUpperCase():'DEF BAIXADA'}  ${atk(m,s)} / ${def(m,s)}`:'DEF • OCULTA',12,'#BCEBFF',700,184);}
   else svg+=T(x+37,monsterY+83,'MONSTRO',18,'#7EB4D8',700,142)+T(x+83,monsterY+112,`${zone+1}`,26,'#7EB4D8',700,45);
   socket(backY,true);
   if(b){await image(b,x+45,backY+5+offset,106,145,b.faceUp||my);svg+=T(x+7,backY+164,b.faceUp||my?getCard(b.id)!.name:'Virada para baixo',12,'#f1e8f2',700,184)+T(x+7,backY+182,b.faceUp?'ATIVADA':my?'BAIXADA • SÓ VOCÊ VÊ':'OCULTA',10,'#d2c4df',700,184);}
   else svg+=T(x+31,backY+80,'MAGIA /',17,'#91C7EA',700,151)+T(x+19,backY+105,'ARMADILHA',17,'#91C7EA',700,164)+T(x+86,backY+136,`${zone+1}`,24,'#91C7EA',700,35);
  }
 }
 // Phase-specific feedback is part of the board itself, not a separate
 // Discord message that the player might miss on mobile.
 const phaseSignal=s.phase==='response'?'JANELA DE RESPOSTA':
  s.phase==='choice'?'ESCOLHA O ALVO':
  s.phase==='battle'?'BATALHA EM ANDAMENTO':
  s.phase==='finished'?'RESULTADO DO DUELO':
  s.phase==='discard'?'DESCARTE OBRIGATÓRIO':'FASE PRINCIPAL';
 const phaseAccent=s.phase==='finished'?azure.success:s.phase==='response'?azure.warning:azure.primary;
 svg+=rect(553,504+offset,296,58,'url(#hud)',phaseAccent,15);
 svg+=T(580,528,phaseSignal,17,azure.text,700,255);
 svg+=T(580,551,s.phase==='response'?`CORRENTE  •  ${s.chain.length+1} ELO(S)`:`TURNO ${s.turn}  •  4.000 PV INICIAIS`,12,phaseAccent,700,255);
 // Center energy line separates the two duelists without stealing focus from card art.
 svg+=`<path d="M40 ${532+offset}H604L624 ${518+offset}H776L796 ${532+offset}H1360M40 ${536+offset}H604L624 ${550+offset}H776L796 ${536+offset}H1360" fill="none" stroke="#71C4F3" stroke-width="2"/>`+T(657,540,'DUEL',17,'#E3F7FF',700,110);
 svg+=T(40,984,s.log.at(-1)??'',15,'#BEEDFF',700,1320)+T(35,1007,s.phase==='finished'?`${s.winner?s.players.find(p=>p.id===s.winner)!.name+' venceu':'Duelo encerrado'}: ${s.reason}`:'M1–M3: monstros  •  A1–A3: magias / armadilhas  •  O número no baralho indica as próximas compras.',11,'#9FC4E4',400,1330);
 return sharp(Buffer.from(svg+'</svg>')).composite(overlays).png().toBuffer();
}
