const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-inspection-')),filename=path.join(dir,'audit.sqlite');process.env.DATABASE_PATH=filename;
const db=require('../dist/database').db,store=require('../dist/duelStore'),{inspectSerializedSnapshot}=require('../dist/snapshotInspection'),e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),game=()=>e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);
test('REA-R03: version/continuation quarantine reports reasons and hashes without repairing raw saves',()=>{
 const values=[JSON.stringify(game()),'{',JSON.stringify({...game(),resolverVersion:'future'}),JSON.stringify({...game(),phase:'choice',choice:{actor:0,targets:['x'],source:'unknown'}})];
 for(const [i,raw]of values.entries())db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('q'+i,'g','c','playing',3,Date.now(),raw);
 const snapshot=db.prepare('SELECT * FROM duels ORDER BY id').all(),report=path.join(dir,'report.json');execFileSync(process.execPath,['scripts/inspect-saved-duels.cjs','--db',filename,'--out',report],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 const output=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(output.rows.filter(r=>r.status==='quarantined').length,3);assert.ok(output.rows.every(r=>r.sha256.length===64&&r.reason||r.status==='valid'));assert.ok(!JSON.stringify(output).includes('players'));
 assert.deepEqual(db.prepare('SELECT * FROM duels ORDER BY id').all(),snapshot);assert.equal(inspectSerializedSnapshot(values[2]).status,'quarantined');
 for(let i=1;i<4;i++){assert.equal(store.inspectSavedDuel('q'+i).status,'quarantined');assert.throws(()=>store.performDuelAction('q'+i,'a','g',3,0,'invalid-'+i));}
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM npc_results').get().n,0);assert.deepEqual(db.prepare('SELECT * FROM duels ORDER BY id').all(),snapshot);
 assert.throws(()=>execFileSync(process.execPath,['scripts/inspect-saved-duels.cjs','--db',filename,'--out',report],{cwd:path.resolve(__dirname,'..'),stdio:'pipe'}),/failed/);
});
after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
