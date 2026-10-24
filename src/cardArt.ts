import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {getCard} from './collection';
import {archiveCards} from './classicDecks';
const cache=path.join(path.dirname(process.env.DATABASE_PATH??'./data/game.sqlite'),'card-art');
const pending=new Map<string,Promise<Buffer|undefined>>();
const failed=new Map<string,number>();
export async function getCardArt(id:string): Promise<Buffer|undefined> {
  if(!getCard(id)&&!archiveCards.has(id))return;
  try{return await fs.readFile(path.join(cache,`${id}.jpg`));}catch{}
  if((failed.get(id)??0)>Date.now())return;
  if(pending.has(id))return pending.get(id);
  const work=download(id).catch(()=>{failed.set(id,Date.now()+300_000);return undefined;}).finally(()=>pending.delete(id));
  pending.set(id,work);return work;
}
async function download(id:string) {
  const response=await fetch(`https://images.ygoprodeck.com/images/cards/${Number(id)}.jpg`,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok||!response.body)throw new Error('Card image unavailable');
  const chunks:Uint8Array[]=[];let size=0;
  const reader=response.body.getReader();
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw new Error('Image too large');chunks.push(part.value);}}finally{await reader.cancel();}
  const bytes=Buffer.concat(chunks);
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('Invalid JPEG');
  await fs.mkdir(cache,{recursive:true});
  const temp=path.join(cache,`${randomUUID()}.tmp`);
  try{await fs.writeFile(temp,bytes);await fs.rename(temp,path.join(cache,`${id}.jpg`));}finally{await fs.rm(temp,{force:true});}
  return bytes;
}
