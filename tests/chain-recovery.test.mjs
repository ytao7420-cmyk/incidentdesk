import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {abi} from 'genlayer-js';
// Execute the actual transport module with its Vite JSON import adapted for Node.
// No wallet requests or RPC calls occur in these pure regression cases.
const chainURL=new URL('../src/chain.js',import.meta.url);
let source=await readFile(chainURL,'utf8');
source=source.replace("import config from '../public/deployment.json';",'const config={};');
source=source.replace(/from '([^']+)'/g,(whole,path)=>`from '${path.startsWith('.')?new URL(path,chainURL).href:import.meta.resolve(path)}'`);
const {evaluationRevision,verifyAction}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const actor='0x'+'1'.repeat(40),address='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64);
const semantics={scope:'IN_SCOPE',window:'IN_WINDOW',impact:'EXPLICIT_NO_IMPACT',reason:'Official source explicitly states no workflow impact.',citations:[{update_id:'update-a',quote:'Workflows ran normally.'}]};
const changed={...semantics,impact:'REPORTED_IMPACT',reason:'Additional incident explicitly reports failed workflow execution.'};
const pending={hash,actor,address,method:'evaluate',args:['case-one']};
function receipt(items=[semantics]){return {hash,from_address:actor,to_address:address,data:{calldata:{raw:[...abi.calldata.encode(abi.calldata.makeCalldataObject('evaluate',['case-one'],undefined))]}},statusName:'FINALIZED',result_name:'MAJORITY_AGREE',leader_only:false,consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS',result:{status:'return'},eq_outputs:Object.fromEntries(items.map((item,i)=>[String(i),{status:'return',payload:{raw:[...abi.calldata.encode(item)]}}]))}]}};}
const revision=(n,content)=>({number:n,digest:'digest-'+n,scope_digest:'scope',findings:content.map(semantics=>({semantics}))});
const record=state=>({id:'case-one',state,scope_digest:'scope',revisions:[revision(1,[semantics]),revision(2,[semantics,changed])]});
test('late evaluation recovery selects its immutable revision after customer acknowledgement',()=>assert.equal(evaluationRevision(pending,receipt(),record('ACKNOWLEDGED')).number,1));
test('late recovery still works after later challenge/revision and never selects latest by state',()=>assert.equal(evaluationRevision(pending,receipt(),record('CHALLENGED')).digest,'digest-1'));
test('second evaluation binds two exact receipt findings',()=>assert.equal(evaluationRevision(pending,receipt([semantics,changed]),record('ACKNOWLEDGED')).number,2));
test('later revision cannot satisfy a different receipt',()=>assert.throws(()=>evaluationRevision(pending,receipt([changed]),record('REVIEWED')),/absent/));
test('duplicate matching outputs are ambiguous, never automatically attributed to a later revision',()=>{const c=record('ACKNOWLEDGED');c.revisions.push(revision(3,[semantics]));assert.throws(()=>evaluationRevision(pending,receipt(),c),/multiple/);});
test('different actor, contract, hash or calldata cannot be used to clear a pending evaluation',()=>{for(const key of ['from_address','to_address','hash']){const r=receipt();r[key]='0x'+'f'.repeat(key==='hash'?64:40);assert.throws(()=>evaluationRevision(pending,r,record('REVIEWED')),/identity/);}const r=receipt();r.data.calldata.raw=[...abi.calldata.encode(abi.calldata.makeCalldataObject('evaluate',['different-case'],undefined))];assert.throws(()=>evaluationRevision(pending,r,record('REVIEWED')),/calldata/);});
test('missing nondeterministic finding evidence or unsuccessful execution does not verify',()=>{const r=receipt();delete r.consensus_data.leader_receipt[0].eq_outputs;assert.throws(()=>evaluationRevision(pending,r,record('REVIEWED')),/lacks/);const bad=receipt();bad.consensus_data.leader_receipt[0].execution_result='ERROR';assert.throws(()=>evaluationRevision(pending,bad,record('REVIEWED')),/successful/);});
test('mutable REVIEWED state by itself is never considered evaluation proof',()=>assert.throws(()=>verifyAction('evaluate',['case-one'],record('REVIEWED')),/receipt-bound/));
test('CLI forwards explicitly supplied recovery hash and label to the real journal call',async()=>{const cli=await readFile(new URL('../scripts/live-test.mjs',import.meta.url),'utf8');const start=cli.indexOf('const send=')+'const send='.length,end=cli.indexOf(';const id=',start);assert.ok(start>10&&end>start);let got;const journal={transact:(...values)=>{got=values;return 'result';}};const config={address};const opts={'--recover-label':'evaluate-first','--recover-hash':hash};const send=new Function('journal','config','opt','return ('+cli.slice(start,end)+')')(journal,config,key=>opts[key]);assert.equal(send('evaluate-first',{account:{address:actor}},'evaluate',['case-one']),'result');assert.deepEqual(got[3],{recoverLabel:'evaluate-first',recoverHash:hash});assert.equal(got[1].address,address);assert.equal(got[1].method,'evaluate');});
