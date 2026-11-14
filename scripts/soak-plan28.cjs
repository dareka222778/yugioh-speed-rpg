/** Disjoint seats prevent the current 1v1 cohort from colliding with the tag lobby. */
function plan(current){const match=/^engine-v([1-9]\d?)$/.exec(current);if(!match)throw Error('Unsupported current resolver');const count=Number(match[1]),versions=Array.from({length:count},(_,i)=>'engine-v'+(i+1)),oneVsOne=versions.map((version,i)=>({version,seats:[i*2,i*2+1]})),tagSeats=Array.from({length:4},(_,i)=>count*2+i);return {versions,oneVsOne,tagSeats,playerCount:count*2+4};}
module.exports={plan};
