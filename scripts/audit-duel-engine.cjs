#!/usr/bin/env node
/** Isolated complete-game stress audit. Never opens the player's production DB.
 * Seeds control loadouts, shuffles, searches and action choices. The private
 * HMAC stream survives JSON restore, allowing exact reproduction by seed.
 */
const {createHash}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const ix=process.argv.indexOf('--games'),games=ix<0?300:Number(process.argv[ix+1]);
if(!Number.isInteger(games)||games<1||games>5000)throw new Error('--games requires an integer from 1 to 5000');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-engine-audit-'));
process.env.DATABASE_PATH=path.join(temp,'audit.sqlite');
const e=require('../dist/duelEngine'),{chooseNPC}=require('../dist/duelStore'),{npcs}=require('../dist/npcContent'),registry=require('../dist/effectRegistry'),integrity=require('../dist/duelIntegrity');

const replayHash=createHash('sha256');
const pool=registry.enabledCardIds.filter(id=>!registry.engineCard(id).fusion),durations=[];let moves=0,reloads=0;const reasons={};const started=performance.now();
try{
 for(let seed=1;seed<=games;seed++){
  let v=seed;const rng=()=>((v=(v*1664525+1013904223)>>>0)/2**32);
  function randomDeck(){const cards=[],counts=new Map();while(cards.length<30){const id=pool[Math.floor(rng()*pool.length)];if((counts.get(id)||0)>=3)continue;cards.push(id);counts.set(id,(counts.get(id)||0)+1);}return {cards,extra:['45231177']};}
  const loads=seed%3===0?[randomDeck(),randomDeck()]:[npcs[seed%npcs.length],npcs[(seed+1)%npcs.length]];
  let s=e.createDuel(loads.map((n,i)=>({id:String(i),name:'Audit '+i,cards:n.cards,extra:n.extra})),rng,seed%2,{randomSeed:createHash('sha256').update('audit:'+seed).digest('hex')}),steps=0;
  const identities=new Map(integrity.duelCards(s).map(c=>[c.uid,c.id]));
  while(s.phase!=='finished'){
   const start=performance.now(),who=s.players[e.decisionPlayer(s)].id,actions=e.legalActions(s,who);assert.ok(actions.length,`no legal action, seed ${seed}`);
   const a=rng()<.15?actions[Math.floor(rng()*actions.length)]:chooseNPC(s,who);assert.ok(a);
   try{s=e.step(s,who,a);}catch(error){error.message+=` [seed ${seed}, move ${steps}, action ${JSON.stringify(a)}]`;throw error;}
   durations.push(performance.now()-start);replayHash.update(JSON.stringify(a)+'\n'+JSON.stringify(s)+'\n');moves++;assert.ok(++steps<4000,`non-terminating seed ${seed}`);
   const cards=integrity.duelCards(s);assert.equal(cards.length,identities.size);for(const c of cards)assert.equal(identities.get(c.uid),c.id);
   if(steps%13===0){s=JSON.parse(JSON.stringify(s));integrity.assertDuelState(s);reloads++;}
  }
  reasons[s.reason]=(reasons[s.reason]||0)+1;
 }
 durations.sort((a,b)=>a-b);const q=p=>Number(durations[Math.min(durations.length-1,Math.floor(durations.length*p))].toFixed(3));
 console.log(JSON.stringify({scope:'Local isolated engine; not Botkeep or Discord latency',deterministicReplay:true,replayDigest:replayHash.digest('hex'),games,moves,serializedRestores:reloads,completed:games,cardIntegrity:'all physical identities preserved',elapsedMs:Number((performance.now()-started).toFixed(1)),decisionMs:{median:q(.5),p95:q(.95),max:q(1)},reasons},null,2));
}finally{require('../dist/database').db.close();fs.rmSync(temp,{recursive:true,force:true});}
