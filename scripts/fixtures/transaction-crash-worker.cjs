/** Isolated fault injector. No production hook is added to the stores. */
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]),job=JSON.parse(fs.readFileSync(file,'utf8'));
if(!fs.existsSync(path.join(path.dirname(file),'.fault-injection-authorized'))||path.resolve(process.env.DATABASE_PATH)!==path.join(path.dirname(file),'isolated.sqlite'))throw Error('Isolated fault-injection fixture required');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
const {db}=require('../../dist/database'),one=require('../../dist/duelStore'),two=require('../../dist/tagStore');
const pause=()=>{fs.writeFileSync(job.marker,job.point,{flag:'wx'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);return 0;};
db.function('m6_crash_barrier',pause);
const tables=job.mode==='1v1'?{state:['duels','id'],events:['duel_transition_events','duel_id'],receipt:['duel_action_receipts','duel_id']}:{state:['tag_sessions','id'],events:['tag_transition_events','session_id'],receipt:['tag_action_receipts','duel_id']};
if(!/^[a-f0-9]+$/.test(job.id))throw Error('Unexpected fixture identifier');
if(job.point!=='after-commit'){const [table,key]=tables[job.point];db.exec(`CREATE TEMP TRIGGER m6_barrier AFTER ${job.point==='state'?'UPDATE':'INSERT'} ON main.${table} WHEN NEW.${key}='${job.id}' BEGIN SELECT m6_crash_barrier(); END`);}
if(job.mode==='1v1')one.performDuelAction(job.id,job.actor,'m6',job.revision,job.action,job.requestId);else two.actTag(job.id,job.actor,'m6',job.revision,job.action,job.requestId);
if(job.point==='after-commit')pause();
throw Error('Crash barrier was not reached');
