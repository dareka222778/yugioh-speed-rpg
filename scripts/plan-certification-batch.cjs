#!/usr/bin/env node
// A successful review plan does not admit cards. Run the cited regressions and
// existing certification checks before proposing a separate catalog change.
const fs=require('node:fs'),path=require('node:path');
const {planCertificationBatch}=require('../dist/certificationBatch');
const input=process.argv[2];if(!input)throw Error('Usage: node scripts/plan-certification-batch.cjs candidates.json');
const candidates=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(candidates)||candidates.some(c=>!c||typeof c.namespace!=='string'||typeof c.id!=='string'||typeof c.fingerprint!=='string'||!Array.isArray(c.suites)||c.suites.some(s=>typeof s!=='string')))throw Error('Invalid batch schema');
const plan=planCertificationBatch(candidates).map(row=>{const missing=row.suites.filter(s=>!fs.existsSync(path.resolve(__dirname,'..',s)));return {...row,readyForReview:row.readyForReview&&!missing.length,issues:[...row.issues,...missing.map(s=>'suite-not-found:'+s)]};});
console.log(JSON.stringify({kind:'read-only-certification-plan',grantsInventory:false,enablesCards:false,plan},null,2));if(plan.some(row=>!row.readyForReview))process.exitCode=1;
