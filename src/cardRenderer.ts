import sharp from 'sharp';
import type { Player } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';

// Small bounded cache and sequential image work for the 512 MB hosting plan.
sharp.cache({ memory: 8, files: 0, items: 16 });
sharp.concurrency(1);
export const CARD_WIDTH = 1000;
export const CARD_HEIGHT = 760;
const palette: Record<string, string> = { ametista:'#b59aff', ouro:'#f5cd76', oceano:'#75caff', rubi:'#ff8c9a', esmeralda:'#76dfb7' };
export function xml(value: string) { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)); }
export function wrapText(value: string, width = 39): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.replace(/\s+/g,' ').trim().split(' ')) {
    for (const piece of word.match(new RegExp(`.{1,${width}}`,'gu')) ?? []) {
      if (Array.from(`${line} ${piece}`.trim()).length > width) { lines.push(line); line = piece; }
      else line = `${line} ${piece}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}
function text(x:number,y:number,value:string,size=24,fill='#f2f4ff',weight=400, maxWidth=0) {
  const estimate = Array.from(value).reduce((sum,c) => sum + (/[WM@]/.test(c) ? 1.1 : /[ilI .,]/.test(c) ? .36 : .8),0) * size;
  const fit = maxWidth && estimate > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text${fit} x="${x}" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}" font-weight="${weight}">${xml(value)}</text>`;
}
let queue = Promise.resolve();
let waiting = 0;
export async function renderCard(player: Player, portrait?: Buffer): Promise<Buffer> {
  if (waiting >= 4) throw new Error('O ateliê está ocupado. Tente novamente em alguns segundos.');
  waiting++;
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await draw(player,portrait); }
  finally { waiting--; release(); }
}
async function draw(p: Player, portrait?: Buffer) {
  const color = palette[p.theme] ?? palette.ametista;
  const name = p.character_name || p.username;
  const deck = p.starter_deck && isStarterDeck(p.starter_deck) ? starterDecks[p.starter_deck].name : 'Ainda não escolhido';
  const nameLines = wrapText(name,18);
  const biography = p.biography || 'Toda lenda começa com uma primeira jogada.';
  const bioSize = biography.length > 120 ? 19 : 24;
  const bio = wrapText(biography, biography.length > 120 ? 38 : 30);
  const stats = [['NÍVEL',p.duelist_level.toLocaleString('pt-BR')],['EXPERIÊNCIA',`${p.xp.toLocaleString('pt-BR')} XP`],['CARTEIRA',`${p.dp.toLocaleString('pt-BR')} DP`]];
  const statSVG = stats.map(([label,value],i)=>{
    const x=444+i*166;
    return `<rect x="${x}" y="315" width="154" height="98" rx="14" fill="#171f32" stroke="#2c374e"/>${text(x+16,342,label,13,'#a8b4cb',700)}${text(x+16,385,value,value.length>10?18:25,'#ffffff',700,122)}`;
  }).join('');
  const placeholder = `<circle cx="222" cy="285" r="65" fill="#34425c"/><path d="M100 509 Q105 365 222 365 Q339 365 344 509Z" fill="#34425c"/>${text(118,556,'SEU PERSONAGEM',18,'#99aac4',700)}`;
  const bg = `<svg width="1000" height="760" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#19243a"/><stop offset="1" stop-color="#090e1a"/></linearGradient></defs>
  <rect width="1000" height="760" rx="28" fill="url(#bg)"/><rect x="1" y="1" width="998" height="758" rx="28" fill="none" stroke="#34425b" stroke-width="2"/>
  <path d="M730 0L1000 270M810 0L1000 190M0 600L160 760" stroke="${color}" stroke-opacity=".12" stroke-width="2"/>
  <rect x="40" y="40" width="6" height="34" rx="3" fill="${color}"/>${text(62,65,'ARQUIVO DE DUELISTAS',21,'#e6ecfa',700)}${text(790,65,'SPEED RPG',19,color,700)}
  <rect x="40" y="108" width="364" height="568" rx="20" fill="#111b2c" stroke="#3a4a66"/>
  ${placeholder}<rect x="40" y="650" width="364" height="26" rx="10" fill="${color}" fill-opacity=".2"/>
  ${text(444,139,'IDENTIDADE DO PERSONAGEM',14,color,700)}
  ${nameLines.map((line,i)=>text(444,195+i*46,line,38,'#ffffff',700,490)).join('')}
  ${text(444,286,'DUELISTA  /  PERFIL PESSOAL',14,'#9cabc5',700)}
  ${statSVG}${text(444,458,'ESTILO INICIAL',14,color,700)}${text(444,496,deck,28,'#ffffff',700)}
  <path d="M444 523H944" stroke="#34415a"/>
  ${bio.map((line,i)=>text(444,557+i*(bioSize === 19 ? 23 : 28),line,bioSize,'#c4cfe1',400,500)).join('')}
  <path d="M40 704H960" stroke="#2a3650"/>${text(40,735,'SUA HISTÓRIA. SUA PRÓXIMA JOGADA.',14,'#9cabc5',700)}${text(827,735,'PERFIL • V0.3',13,color,700)}</svg>`;
  const overlays: sharp.OverlayOptions[] = [];
  if (portrait) {
    try {
      const photo = await sharp(portrait,{limitInputPixels:16_000_000,failOn:'error'}).rotate().resize(340,540,{fit:'contain',background:'#111b2c'}).png().toBuffer();
      overlays.push({input:photo,left:52,top:120});
    } catch { /* A damaged legacy portrait never prevents viewing the profile. */ }
  }
  return sharp(Buffer.from(bg)).composite(overlays).png().toBuffer();
}

let welcome: Promise<Buffer> | undefined;
export function renderWelcome(): Promise<Buffer> {
  welcome ??= sharp(Buffer.from(`<svg width="1000" height="590" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#202d48"/><stop offset="1" stop-color="#0b1020"/></linearGradient></defs><rect width="1000" height="590" rx="24" fill="url(#g)"/>
  ${text(45,65,'SPEED RPG  /  PRIMEIRA JOGADA',18,'#75caff',700)}${text(45,130,'Toda lenda tem um começo.',40,'#ffffff',700)}${text(45,174,'Escolha o estilo do seu duelista nos botões abaixo.',23,'#b9c8e0')}
  ${[
    {x:40,c:'#f5cd76',n:'01',title:'GUERREIROS',lines:['Ataques diretos.','Equilíbrio e força.','Prepare sua ofensiva.']},
    {x:354,c:'#b59aff',n:'02',title:'FEITICEIROS',lines:['Controle do campo.','Magias e estratégia.','Pense na próxima jogada.']},
    {x:668,c:'#76dfb7',n:'03',title:'DRAGÕES',lines:['Prepare o terreno.','Monstros poderosos.','Faça sua presença valer.']}
  ].map(d=>`<rect x="${d.x}" y="225" width="292" height="265" rx="18" fill="#152039" stroke="#34445f"/><rect x="${d.x+22}" y="250" width="42" height="4" rx="2" fill="${d.c}"/>${text(d.x+235,265,d.n,18,d.c,700)}${text(d.x+22,315,d.title,25,'#ffffff',700,250)}${d.lines.map((l,i)=>text(d.x+22,365+i*32,l,18,'#c2cfe4',400,248)).join('')}`).join('')}
  ${text(45,548,'UMA ESCOLHA INICIAL. UMA HISTÓRIA PARA CONSTRUIR.',17,'#98abc9',700)}</svg>`)).png().toBuffer().catch(error=>{ welcome=undefined; throw error; });
  return welcome;
}
