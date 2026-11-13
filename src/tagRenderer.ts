import {renderDuel} from './duelRenderer';
/** Dedicated 2v2 renderer. Never calls or modifies the original 1v1 playmat. */
import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {azure} from './duelTheme';
import {CARD_BACK_PNG,CARD_BACK_WIDTH,CARD_BACK_HEIGHT} from './cardBackAsset';
import {getCard} from './collection';
import {getCardArt} from './cardArt';
import {atk,def} from './duelEngine';
import {assertTagDuel,tagMemberHand,tagDecisionMember,type TagDuel} from './tagDuel';
let queue=Promise.resolve(),waiting=0;
/** Bounded queue prevents several simultaneous viewers from exhausting host RAM. */
export async function renderTag(s:TagDuel,viewer?:string,provider=getCardArt){
 assertTagDuel(s);if(viewer&&!s.members.some(p=>p.id===viewer))throw Error('Você não participa deste 2v2.');
 if(waiting>=4)throw Error('Campo de equipes ocupado. Atualize em alguns segundos.');waiting++;const previous=queue;let release!:()=>void;queue=new Promise<void>(resolve=>release=resolve);await previous;
 try{return s.mode==='tag-classic'?await drawClassic(s,viewer,provider):await draw(s,viewer,provider);}finally{waiting--;release();}
}
async function draw(s:TagDuel,viewer:string|undefined,provider:typeof getCardArt){
 const hand=viewer?tagMemberHand(s,viewer):[],H=viewer?1260:930,overlays:sharp.OverlayOptions[]=[],wanted=new Set<string>();
 // Private hands are fetched only for that member. Face-down field identities stay hidden even to allies.
 for(const p of s.core.players)for(const c of [...p.monsters.filter(m=>m.faceUp),...p.grave.slice(-1)])wanted.add(c.id);for(const c of hand)wanted.add(c.id);
 const art=new Map<string,Buffer>(),ids=[...wanted];for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async id=>{try{const b=await provider(id);if(b)art.set(id,b);}catch{}}));
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${H}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${azure.ink}"/><stop offset="1" stop-color="${azure.navy}"/></linearGradient><image id="back" width="${CARD_BACK_WIDTH}" height="${CARD_BACK_HEIGHT}" href="data:image/png;base64,${CARD_BACK_PNG}"/></defs><rect width="1200" height="${H}" rx="20" fill="url(#bg)"/><path d="M20 3H1180" stroke="${azure.primary}" stroke-width="6"/>`;
 const T=(x:number,y:number,v:string,size=18,color:string=azure.text,w=1100)=>text(x,y,v,size,color,700,w);
 const rect=(x:number,y:number,w:number,h:number,fill:string=azure.surface,stroke:string=azure.lineMuted)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}"/>`;
 const back=(x:number,y:number,w:number,h:number)=>`<use href="#back" transform="translate(${x} ${y}) scale(${w/CARD_BACK_WIDTH} ${h/CARD_BACK_HEIGHT})"/>`;
 async function image(id:string|undefined,x:number,y:number,w:number,h:number){if(!id){svg+=back(x,y,w,h);return;}svg+=rect(x,y,w,h,azure.card);const bytes=art.get(id);if(bytes)try{overlays.push({input:await sharp(bytes,{limitInputPixels:20_000_000}).resize(w,h,{fit:'contain',background:azure.card}).png().toBuffer(),left:x,top:y});return;}catch{}svg+=T(x+8,y+h/2,getCard(id)!.name,15,azure.text,w-16);}
 svg+=T(34,51,'TAG DUEL / SPEED RPG',29)+T(34,82,'2v2 • CAMPO COMPARTILHADO • MÃOS E DECKS INDIVIDUAIS',14,azure.muted)+T(850,48,`TURNO ${s.core.turn}`,24,azure.primaryBright,310)+T(850,78,s.core.phase==='finished'?'PARTIDA ENCERRADA':s.core.phase==='discard'?'DESCARTE ANTES DA COMPRA':s.core.phase==='battle'?'BATALHA':'FASE PRINCIPAL',13,azure.muted,310);
 for(let team=0;team<2;team++){
  const p=s.core.players[team],y=112+team*360,accent=team===0?azure.primary:'#FF9CA5';
  svg+=rect(24,y,1152,338,azure.deep,accent)+T(42,y+34,p.name.toUpperCase(),22,accent)+T(42,y+83,`${p.lp} PV`,36)+T(42,y+111,'PONTOS DE VIDA DA EQUIPE',11,azure.muted,280);
  const ratio=Math.max(0,Math.min(1,p.lp/4000));svg+=rect(42,y+128,276,8,azure.ink);if(ratio)svg+=rect(42,y+128,276*ratio,8,accent,accent);
  const members=s.members.map((m,i)=>({m,i})).filter(p=>p.m.team===team);for(const [{m,i},slot] of members.map((m,i)=>[m,i] as const)){
   const active=s.active[team]===i,held=active?p:s.reserves[i],acting=tagDecisionMember(s).id===m.id&&s.core.phase!=='finished',my=viewer===m.id,yy=y+164+slot*77;
   svg+=rect(40,yy,280,64,acting?azure.surfaceSelected:azure.surface)+T(52,yy+24,`${acting?'VEZ: ':''}${m.name}${my?' (VOCÊ)':''}`,16,acting?azure.primaryBright:azure.text,258)+T(52,yy+48,`MÃO ${held.hand.length}   /   COMPRAR ${held.deck.length}`,12,azure.muted,258);
  }
  for(let slot=0;slot<3;slot++){
   const x=347+slot*208,m=p.monsters[slot];svg+=rect(x,y+18,190,300,azure.field,azure.lineMuted);
   if(m){await image(m.faceUp?m.id:undefined,x+29,y+32,132,188);svg+=T(x+12,y+245,m.faceUp?getCard(m.id)!.name:'CARTA OCULTA',14,azure.text,166)+T(x+12,y+271,m.faceUp?`${m.position==='atk'?'ATAQUE':'DEFESA'} ${m.position==='atk'?atk(m,s.core):def(m,s.core)}`:'DEFESA BAIXADA',14,azure.primaryBright,166);}else svg+=T(x+28,y+151,'MONSTRO '+(slot+1),17,azure.tertiary,150);
   svg+=T(x+12,y+297,'ZONA '+(slot+1),10,azure.tertiary,166);
  }
  const dx=991;svg+=T(dx,y+40,'CEMITÉRIO',12,azure.muted,160);const last=p.grave.at(-1);if(last)await image(last.id,dx+10,y+57,109,155);else svg+=rect(dx+10,y+57,109,155,azure.ink);svg+=T(dx+8,y+242,`${p.grave.length} CARTAS`,17,azure.text,155)+T(dx,y+279,'DECKS INDIVIDUAIS',9,azure.muted,164);
 }
 svg+=T(32,863,s.core.phase==='finished'?`${s.core.winner?(s.core.winner==='tag-team-0'?'EQUIPE AZUL':'EQUIPE VERMELHA')+' VENCEU':'EMPATE'} • ${s.core.reason}`:`AGUARDANDO ${tagDecisionMember(s).name.toUpperCase()}`,20,azure.primaryBright,1120)+T(32,900,'HOMOLOGAÇÃO • 30 MONSTROS NORMAIS EMPRESTADOS • SEM RECOMPENSAS',13,azure.muted,1120);
 if(viewer){svg+=rect(24,935,1152,302,azure.deep)+T(42,966,'SUA MÃO / SOMENTE VOCÊ',20,azure.primaryBright)+T(755,963,'USE OS MENUS ABAIXO PARA JOGAR',12,azure.muted,400);for(const [i,c] of hand.slice(0,7).entries()){const x=42+i*162;await image(c.id,x,980,139,197);svg+=T(x,1200,`${i+1}. ${getCard(c.id)!.name}`,12,azure.text,148)+T(x,1221,`${getCard(c.id)!.atk} ATQ / ${getCard(c.id)!.defense} DEF`,10,azure.muted,148);}}
 return sharp(Buffer.from(svg+'</svg>')).composite(overlays).png().toBuffer();
}

export function tagImageLayout(s:TagDuel){return s.mode==='tag-classic'?{width:1400,fieldHeight:1240,handHeight:340}:{width:1200,fieldHeight:930,handHeight:330};}
async function drawClassic(s:TagDuel,viewer:string|undefined,provider:typeof getCardArt){
 const core=structuredClone(s.core),member=viewer?s.members.find(p=>p.id===viewer):undefined,seat=viewer?s.members.findIndex(p=>p.id===viewer):-1;
 if(member){const p=core.players[member.team];p.hand=tagMemberHand(s,viewer!);if(s.active[member.team]!==seat){p.deck=s.reserves[seat].deck;p.extra=s.reserves[seat].extra??[];}}
 const field=await renderDuel(core,member?core.players[member.team].id:undefined,provider),layout=tagImageLayout(s),overlays:sharp.OverlayOptions[]=[];
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="220"><rect width="1400" height="220" fill="${azure.deep}"/>${text(28,43,'TAG DUEL / EQUIPES CLÁSSICAS',27,azure.text,700,1300)}${text(28,74,'CAMPO E PV POR EQUIPE • DECKS, MÃOS E ADICIONAIS INDIVIDUAIS',14,azure.muted,700,1300)}`;
 for(const [i,m] of s.members.entries()){const active=s.active[m.team]===i,held=active?s.core.players[m.team]:s.reserves[i],x=28+i*346,acting=s.core.phase!=='finished'&&tagDecisionMember(s).id===m.id;svg+=`<rect x="${x}" y="94" width="326" height="106" rx="8" fill="${acting?azure.surfaceSelected:azure.surface}" stroke="${m.team===0?azure.primary:'#FF9CA5'}"/>${text(x+12,124,m.name+(viewer===m.id?' (VOCÊ)':''),20,azure.text,700,302)}${text(x+12,151,(m.team===0?'EQUIPE AZUL':'EQUIPE VERMELHA')+(acting?' • SUA VEZ':''),11,azure.muted,700,300)}${text(x+12,181,`MÃO ${held.hand.length}  /  DECK ${held.deck.length}  /  EXTRA ${held.extra?.length??0}`,12,azure.primaryBright,700,300)}`;}
 overlays.push({input:await sharp(Buffer.from(svg+'</svg>')).png().toBuffer(),left:0,top:0});
 if(member){overlays.push({input:await sharp(field).extract({left:0,top:340,width:1400,height:1020}).png().toBuffer(),left:0,top:220},{input:await sharp(field).extract({left:0,top:0,width:1400,height:340}).png().toBuffer(),left:0,top:layout.fieldHeight});}else overlays.push({input:field,left:0,top:220});
 return sharp({create:{width:1400,height:layout.fieldHeight+(member?layout.handHeight:0),channels:4,background:azure.ink}}).composite(overlays).png().toBuffer();
}
