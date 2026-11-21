const {historicalNormalBatch4}=require('../dist/historicalNormalBatch4'),reviews=require('../docs/evidence/mission4-individual-reviews.json');
require('./helpers/normalCertification.cjs').registerNormalCertification(historicalNormalBatch4,{reviews,reportFile:'artifacts/certification-executions-mission4.json'});
