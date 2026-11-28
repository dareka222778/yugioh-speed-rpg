const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'token-recovery-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const database=require('../dist/database'),store=require('../dist/duelStore'),e=require('../dist/duelEngine'),{createTokenGroup}=require('../dist/tokens'),{starterContents}=require('../dist/cardCatalog');
test('REA-T01: SQLite restart restores entity policy and a repeated paid Tribute cannot duplicate damage',()=>{
 const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));let s=e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);s.turn=3;s.players[0].monsters=[{uid:'cannon',id:'11384280',owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}];const [token]=createTokenGroup(s,0,1);
 database.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('token-duel','g','c','playing',0,Date.now(),JSON.stringify(s));
 const child="const s=require('./dist/duelStore'),e=require('./dist/duelEngine');const r=s.getDuel('token-duel'),i=e.legalActions(r.state,'a').findIndex(a=>a.kind==='monsterEffect'&&a.tributes.includes(process.argv[1]));console.log(JSON.stringify({index:i,result:s.performDuelAction(r.id,'a','g',r.revision,i,'token-tribute')}));";
 const output=JSON.parse(execFileSync(process.execPath,['-e',child,token.uid],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',env:{...process.env,DATABASE_PATH:path.join(temp,'game.sqlite')}}));assert.equal(output.result.state.players[1].lp,3500);assert.equal(output.result.state.tokenLedger.entries[0].status,'removed');
 const replay=store.performDuelAction('token-duel','a','g',0,output.index,'token-tribute');assert.equal(replay.receipt.replayed,true);assert.equal(replay.state.players[1].lp,3500);assert.equal(store.duelEventsAt('token-duel',1).filter(e=>e.type==='tokenRemoved').length,1);
});
test('token art never starts a network request and token metadata cannot pass deck admission',async()=>{
 const {getCardArt}=require('../dist/cardArt'),{getCard}=require('../dist/collection'),{validateDeck}=require('../dist/decks');const previous=global.fetch;let requests=0;global.fetch=()=>{requests++;throw Error('unexpected network');};
 try{assert.equal((await getCardArt('token:sheep')),undefined);assert.equal(requests,0);assert.equal(getCard('token:sheep').name,'Ficha de Ovelha');assert.ok(validateDeck([{card_key:'token:sheep',quantity:1}],[{card_key:'token:sheep',quantity:1}]).errors.length>0);}finally{global.fetch=previous;}
});
test('token inspector reuses the approved visual template with a local fallback and entity description',async()=>{
 const {renderOwnedCard}=require('../dist/cardInspector'),{cardRulesPT}=require('../dist/cardText');assert.match(cardRulesPT('token:sheep'),/entidade/);
 const image=await renderOwnedCard({id:'token:sheep',deckName:'Campo',inDeck:0,owned:0,index:0,total:1},async()=>undefined);assert.ok(Buffer.isBuffer(image)&&image.length>1000);
});
after(()=>{database.db.close();fs.rmSync(temp,{recursive:true,force:true});});
