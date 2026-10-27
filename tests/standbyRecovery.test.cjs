const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'standby-recovery-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const database=require('../dist/database'),store=require('../dist/duelStore'),e=require('../dist/duelEngine'),{scheduleStandbyTask}=require('../dist/standbyFlow'),{starterContents}=require('../dist/cardCatalog');
test('REA-P03: real SQLite restart preserves a paid Standby root and receipt replay cannot pay or draw twice',()=>{
 const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));let state=e.createDuel([{id:'wait-a',name:'A',cards},{id:'wait-b',name:'B',cards}],()=>.5);
 state=scheduleStandbyTask(state,{id:'persistent-wait',turn:2,actor:1,optional:false,costLP:100,options:[{id:'gain',label:'Recuperar',operations:[{kind:'gainLP',player:'self',amount:200}]}]});state=e.step(state,'wait-a',{kind:'end'});assert.equal(state.phase,'choice');state.players[0].backrow=[{uid:'jar',id:'83968380',faceUp:false,setTurn:0}];
 database.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('standby','g','c','playing',0,Date.now(),JSON.stringify(state));
 const chosen=store.performDuelAction('standby','wait-b','g',0,0,'standby-choice');assert.equal(chosen.state.phase,'response');assert.equal(chosen.state.players[1].lp,3900);
 const child="const s=require('./dist/duelStore'),e=require('./dist/duelEngine');let r=s.getDuel('standby');for(let n=0;r.state.phase==='response';n++){if(n>20)throw Error('loop');const a=r.state.players[e.decisionPlayer(r.state)].id;const i=e.legalActions(r.state,a).findIndex(x=>x.kind==='pass');r=s.performDuelAction(r.id,a,'g',r.revision,i,'resume-'+n);}console.log(JSON.stringify(r));";
 const resumed=JSON.parse(execFileSync(process.execPath,['-e',child],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',env:{...process.env,DATABASE_PATH:path.join(temp,'game.sqlite')}}));
 assert.equal(resumed.state.players[1].lp,4100);assert.equal(resumed.state.players[1].hand.length,5);assert.equal(resumed.state.standby.completed.length,1);
 const replay=store.performDuelAction('standby','wait-b','g',0,0,'standby-choice');assert.equal(replay.receipt.replayed,true);assert.deepEqual(replay.state,resumed.state);
});
after(()=>{database.db.close();fs.rmSync(temp,{recursive:true,force:true});});
