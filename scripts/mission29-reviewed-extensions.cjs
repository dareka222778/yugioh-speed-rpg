/** Permit only the reviewed operational identity substitution in the bootstrap.
 * Restore its prior bytes for the historical preservation hash; every other
 * bootstrap change must still fail that hash. Never normalize archived engines.
 */
const assert=require('node:assert/strict');
const runtimeImport="import {runtimeStatusLine,runtimePingText} from './runtimeStatus';\n";
const baselinePing='`🏓 Pong! Versão ${RELEASE_VERSION} • 130 cartas habilitadas • ${RULES_PROFILE.name} • mão ${RULES_PROFILE.handLimit}, descarte na Fase Final • Adicional ${RULES_PROFILE.extraDeckMax}.`';
const baselineLog='console.log(`Release ${RELEASE_VERSION} | regras ${RULES_VERSION} | mão ${RULES_PROFILE.handLimit}, descarte na Fase Final | Adicional ${RULES_PROFILE.extraDeckMax} | 130 cartas | 1v1 e 2v2`);';
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,'M29 identity substitution must occur exactly once');return text.replace(from,to);}
function strip(file,bytes){
 bytes=require('./mission30-conditional-reviewed.cjs').strip(file,bytes);
 if(file!=='src/index.ts')return bytes;
 let text=bytes.toString('utf8');if(!text.includes(runtimeImport))return bytes;
 assert.ok(text.startsWith("import 'dotenv/config';\n"+runtimeImport),'dotenv must remain first');
 text=replaceOnce(text,runtimeImport,'');
 text=replaceOnce(text,"import {RULES_PROFILE} from './rulesProfile';\n","import {RULES_PROFILE,RULES_VERSION} from './rulesProfile';\nconst RELEASE_VERSION:string=require('../package.json').version;\n");
 text=replaceOnce(text,'content: runtimePingText()', 'content: '+baselinePing);
 text=replaceOnce(text,'console.log(runtimeStatusLine());',baselineLog);
 return Buffer.from(text,'utf8');
}
module.exports={strip,runtimeImport};
