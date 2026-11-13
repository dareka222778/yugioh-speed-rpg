/** Run after the entire test suite, not as a substitute for executing it. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {enabledCardIds,getCardStatus,engineCatalog}=require('../dist/effectRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
for(const id of enabledCardIds){
 assert.equal(getCardStatus(id).stage,'certified');
 assert.ok(cardCertifications[id].suites.length);
 for(const suite of cardCertifications[id].suites)assert.ok(fs.existsSync(suite),`missing certification evidence ${suite}`);
}
console.log(JSON.stringify({registered:engineCatalog.length,certified:enabledCardIds.length,unreleased:engineCatalog.filter(c=>getCardStatus(c.id).stage!=='certified').length,admission:'mechanical fingerprint + explicit test references; full suite must pass'},null,2));
