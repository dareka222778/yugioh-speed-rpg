'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),proof=require('../docs/evidence/mission31-target-ai-review.json');
function strip(file,bytes){if(file!=='src/duelStore.ts')return bytes;assert.equal(crypto.createHash('sha256').update(fs.readFileSync(proof.module)).digest('hex'),proof.moduleSHA256,'Reviewed target utility changed');let text=bytes.toString('utf8');for(const hook of proof.hooks[file]){if(!text.includes(hook))continue;assert.equal(text.split(hook).length,2,'Exactly one reviewed NPC hook');text=text.replace(hook,'');}return Buffer.from(text);}
module.exports={strip};
