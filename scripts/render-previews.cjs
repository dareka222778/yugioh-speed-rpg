#!/usr/bin/env node
// Render offline previews of the approved visual surfaces for QA.
// The image provider never makes HTTP requests; the opponent portraits,
// user's card back and iconography are bundled into the project.
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const {createDuel}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const {renderDuel}=require('../dist/duelRenderer');
const {renderNPC}=require('../dist/npcRenderer');
const {renderDeck}=require('../dist/deckRenderer');
const {classicDeck}=require('../dist/classicDecks');
const {getNPC}=require('../dist/npcContent');

const dir=path.resolve(process.argv[2]??'artifacts/previews');
const noNetwork=async()=>undefined;
const normal=(uid,id,owner=0,position='atk',faceUp=true)=>({uid,id,owner,position,faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
async function run(){
 await fs.mkdir(dir,{recursive:true});
 const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
 const s=createDuel([
  {id:'preview',name:'DUELISTA',cards},
  {id:'npc-demo',name:'Seto Kaiba',cards}
 ],()=>.5);
 s.encounter={npcId:'kaiba'};s.turn=5;s.current=0;s.phase='battle';
 s.players[0].monsters=[normal('m1','91152256'),normal('m2','54652250',0,'def')];
 s.players[1].monsters=[normal('m3','89631139',1),normal('m4','83011277',1,'def',false)];
 s.players[0].backrow=[{uid:'set-trap',id:'12607053',setTurn:3,faceUp:false}];
 s.players[1].backrow=[{uid:'enemy-trap',id:'03819470',setTurn:4,faceUp:false}];
 s.players[0].lp=3200;s.players[1].lp=2400;
 s.log=['Yami Yugi comprou uma carta.','Seto Kaiba revelou um monstro.','A fase de Batalha começou.'];
 const gallery=getNPC('kaiba'),archive=classicDeck('kaiba');
 const heroModel={id:'kaiba',name:gallery.name,index:2,prefix:archive.prefix,year:archive.year,won:false,
   reward:'+200 DP',daily:false,dailyClaimed:false,cards:archive.cards,page:0,view:'hero'};
 const cardModel={...heroModel,view:'card',page:0};
 const deck={name:'Deck Azul · Clássico',slot:1,active:false,errors:[],total:20,extraTotal:0,items:[],revision:1};
 const previews=[
  ['arena-publica.png',await renderDuel(s,undefined,noNetwork)],
  ['arena-privada.png',await renderDuel(s,'preview',noNetwork)],
  ['duelista-kaiba.png',await renderNPC(heroModel)],
  ['carta-individual.png',await renderNPC(cardModel)],
  ['editor-deck.png',await renderDeck({deck,visible:cards.slice(0,6),selected:cards[0],owned:[],page:1,pages:4},noNetwork)]
 ];
 for(const [name,png]of previews){
  const data=await sharp(png).png().toBuffer();
  await fs.writeFile(path.join(dir,name),data);
  const {width,height}=await sharp(data).metadata();
  if(!width||!height)throw new Error('Invalid preview: '+name);
  console.log(`${name} — ${width}×${height}, ${Math.round(data.length/1024)} KiB`);
 }
 const readme='Pré-visualizações de CI geradas sem internet. Artes das cartas podem aparecer como placeholders; imagens reais são obtidas pelo cache do bot em produção. Estes PNGs são amostras, não um teste de uso humano no Discord.\n';
 await fs.writeFile(path.join(dir,'README.txt'),readme);
}
run().catch(err=>{console.error(err);process.exitCode=1;});
