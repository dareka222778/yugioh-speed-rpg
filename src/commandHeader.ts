import sharp from 'sharp';
import {outlineText as text} from './fontPaths';
import {azure} from './duelTheme';
export async function renderCommandHeader(title:string,subtitle:string,stats:{label:string;value:string}[]){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="300"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${azure.navy}"/><stop offset="1" stop-color="${azure.deep}"/></linearGradient></defs><rect width="1080" height="300" rx="20" fill="url(#bg)"/><path d="M0 0H1080" stroke="${azure.primary}" stroke-width="8"/><path d="M760 0L1060 300M890 0L1190 300" stroke="${azure.line}" opacity=".12" stroke-width="35"/>${text(36,62,title,32,azure.text,700,1000)}${text(36,101,subtitle,18,azure.muted,400,990)}${stats.slice(0,3).map((s,i)=>{const x=36+i*336;return `<rect x="${x}" y="139" width="310" height="113" rx="12" fill="${azure.surface}" stroke="${azure.lineMuted}"/>${text(x+20,175,s.label.toUpperCase(),14,azure.primaryBright,700,270)}${text(x+20,224,s.value,31,azure.text,700,270)}`;}).join('')}</svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
