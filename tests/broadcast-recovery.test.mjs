import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {abi} from 'genlayer-js';
// The real browser transport is imported with an SDK/provider boundary stub.
// Tests never contact a wallet, HTTP endpoint or blockchain.
const chainURL=new URL('../src/chain.js',import.meta.url),original=await readFile(chainURL,'utf8');
const actor='0x'+'1'.repeat(40),address='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64),key='incidentdesk.pending.v1';
const args=['case-one','revision-digest'];let moduleNumber=0;
class Storage{
  data=new Map();writes=0;failAt=0;readError=false;
  getItem(k){if(this.readError)throw Error('Storage inaccessible');return this.data.get(k)??null;}
  setItem(k,v){if(++this.writes===this.failAt)throw Error('Storage full');this.data.set(k,v);}
  removeItem(k){this.data.delete(k);}
}
const record=()=>({id:args[0],acknowledgements:[{revision_digest:args[1]}],revisions:[]});
function receipt(){return {hash,from_address:actor,to_address:address,value:0,statusName:'FINALIZED',result_name:'MAJORITY_AGREE',leader_only:false,data:{calldata:{raw:[...abi.calldata.encode(abi.calldata.makeCalldataObject('acknowledge',args,undefined))]}},consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS',result:{status:'return'}}]}};}
async function harness(storage=new Storage()){
  const h={storage,sends:0,reads:0,notices:[],send:async()=>hash,transaction:receipt,read:async()=>JSON.stringify(record())};
  h.notify=p=>h.notices.push(p);
  h.wallet={isMetaMask:true,request:async({method})=>method==='eth_chainId'?'0xf22f':[actor]};
  h.reader={getTransaction:async input=>{h.reads++;return h.transaction(input);},readContract:async()=>h.read()};
  globalThis.localStorage=storage;
  globalThis.window={ethereum:h.wallet,addEventListener(){},dispatchEvent(){}};
  globalThis.__incidentCreateClient=options=>options.provider?{writeContract:async input=>{h.sends++;return h.send(input);}}:h.reader;
  let source=original.replace("import {createClient,abi} from 'genlayer-js';","import {abi} from 'genlayer-js'; const createClient=globalThis.__incidentCreateClient;");
  source=source.replace("import config from '../public/deployment.json';",`const config=${JSON.stringify({deployed:true,address,explorer:'https://example.invalid'})};`);
  source=source.replace(/from '([^']+)'/g,(whole,path)=>`from '${path.startsWith('.')?new URL(path,chainURL).href:import.meta.resolve(path)}'`);
  h.api=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+(++moduleNumber)).toString('base64'));
  await h.api.connect();return h;
}
async function lost(){const h=await harness();h.send=async()=>{throw Error('Response lost after node acceptance');};await assert.rejects(h.api.write('acknowledge',args,h.notify),/Broadcast outcome is unknown/);return h;}

test('complete intent is durably saved before SDK send can broadcast',async()=>{
  const h=await harness();h.send=async input=>{const p=JSON.parse(h.storage.getItem(key));assert.equal(p.state,'prepared');assert.equal(p.hash,null);assert.equal(p.actor,actor);assert.equal(p.address,address);assert.equal(p.chainId,61999);assert.equal(p.value,'0');assert.equal(p.leaderOnly,false);assert.deepEqual(p.args,args);assert.equal(input.functionName,p.method);assert.equal(input.value,0n);throw Error('Lost response');};
  await assert.rejects(h.api.write('acknowledge',args,h.notify),/outcome is unknown/);assert.equal(h.sends,1);assert.equal(h.api.getPending().hash,null);
});
test('lost RPC response prevents another click and survives module reload without resending',async()=>{
  const h=await lost();await assert.rejects(h.api.write('acknowledge',args,h.notify),/saved transaction intent/);assert.equal(h.sends,1);
  const reload=await harness(h.storage);await assert.rejects(reload.api.write('acknowledge',args,reload.notify),/saved transaction intent/);assert.equal(reload.sends,0);
});
test('storage failure prevents the SDK from receiving any send request',async()=>{
  const h=await harness();h.storage.failAt=1;await assert.rejects(h.api.write('acknowledge',args,h.notify),/Storage full/);assert.equal(h.sends,0);
});
test('corrupt or inaccessible stored journal blocks new writes',async()=>{
  for(const raw of ['{broken','null','[]']){const h=await harness();h.storage.data.set(key,raw);assert.equal(h.api.getPending().state,'unreadable');await assert.rejects(h.api.write('acknowledge',args,h.notify),/saved transaction intent/);assert.equal(h.sends,0);}
  const h=await harness();h.storage.readError=true;await assert.rejects(h.api.write('acknowledge',args,h.notify),/saved transaction intent/);assert.equal(h.sends,0);
});
test('unknown broadcast cannot be resumed or cleared as a failed transaction',async()=>{
  const h=await lost();await assert.rejects(h.api.resume(h.notify),/unknown/);await assert.rejects(h.api.clearFailedPending(),/cannot be cleared/);assert.equal(h.reads,0);assert.ok(h.api.getPending());
});
test('manual recovery rejects wrong hash, sender, destination, calldata, value or validator mode',async()=>{
  const h=await lost();
  const changes=[r=>r.hash='0x'+'f'.repeat(64),r=>r.from_address='0x'+'f'.repeat(40),r=>r.to_address='0x'+'f'.repeat(40),r=>r.data.calldata.raw=[1,2,3],r=>r.value=1,r=>r.leader_only=true];
  for(const change of changes){h.transaction=()=>{const r=receipt();change(r);return r;};await assert.rejects(h.api.recover(hash,h.notify),/identity|calldata|value|validator/);assert.equal(h.api.getPending().hash,null);}
  assert.equal(h.sends,1);
});
test('matching manual hash recovery verifies execution and state without a replacement broadcast',async()=>{
  const h=await lost();const result=await h.api.recover(hash,h.notify);assert.deepEqual(result,record());assert.equal(h.api.getPending(),null);assert.equal(h.sends,1);assert.ok(h.notices.some(p=>p.message.includes('Recovered hash matches')));
});
test('a recovered failed transaction stays recorded until explicit verified failure clearing',async()=>{
  const h=await lost();h.transaction=()=>{const r=receipt();r.consensus_data.leader_receipt[0].execution_result='ERROR';r.consensus_data.leader_receipt[0].result={status:'rollback'};return r;};
  await assert.rejects(h.api.recover(hash,h.notify),/not successful/);assert.equal(h.api.getPending().hash,hash);
  await h.api.clearFailedPending();assert.equal(h.api.getPending(),null);assert.equal(JSON.parse(h.storage.getItem('incidentdesk.last-failed.v1')).pending.hash,hash);assert.equal(h.sends,1);
});
test('hash persistence failure preserves pre-send intent and exposes returned hash for recovery',async()=>{
  const h=await harness();h.storage.failAt=2;await assert.rejects(h.api.write('acknowledge',args,h.notify),/outcome is unknown/);assert.equal(h.api.getPending().hash,null);assert.equal(h.notices.at(-1).hash,hash);assert.equal(h.sends,1);
  await assert.rejects(h.api.write('acknowledge',args,h.notify),/saved transaction intent/);
});
test('explicit wallet rejection is retained diagnostically and releases its unbroadcast intent',async()=>{
  const h=await harness();h.send=async()=>{throw Object.assign(Error('User rejected request'),{code:4001});};
  await assert.rejects(h.api.write('acknowledge',args,h.notify),/User rejected/);assert.equal(h.api.getPending(),null);assert.equal(JSON.parse(h.storage.getItem('incidentdesk.last-rejected.v1')).intent.hash,null);
});
test('unclassified rejection text is still ambiguous and cannot unlock resending',async()=>{
  const h=await harness();h.send=async()=>{throw Error('User rejected or RPC disconnected');};
  await assert.rejects(h.api.write('acknowledge',args,h.notify),/outcome is unknown/);assert.ok(h.api.getPending());
});
test('recovery RPC failure retains hashless intent and permits another read-only recovery attempt',async()=>{
  const h=await lost();h.transaction=()=>{throw Error('RPC unavailable');};await assert.rejects(h.api.recover(hash,h.notify),/RPC unavailable/);assert.equal(h.api.getPending().hash,null);
  h.transaction=receipt;await h.api.recover(hash,h.notify);assert.equal(h.sends,1);
});
test('wrong saved network and malformed recovery hash are rejected before RPC access',async()=>{
  const h=await lost();await assert.rejects(h.api.recover('0x12',h.notify),/complete/);const p=h.api.getPending();p.chainId=1;h.storage.setItem(key,JSON.stringify(p));
  await assert.rejects(h.api.recover(hash,h.notify),/network/);assert.equal(h.reads,0);assert.equal(h.sends,1);
});
test('state read-back failure retains known hash; resume later reads without resending',async()=>{
  const h=await harness();h.read=async()=>{throw Error('Read unavailable');};await assert.rejects(h.api.write('acknowledge',args,h.notify),/Read unavailable/);assert.equal(h.api.getPending().hash,hash);
  h.read=async()=>JSON.stringify(record());await h.api.resume(h.notify);assert.equal(h.api.getPending(),null);assert.equal(h.sends,1);
});
test('legacy saved hashes remain resumable with full transaction identity verification',async()=>{
  const h=await harness();h.storage.setItem(key,JSON.stringify({hash,actor,address,method:'acknowledge',args}));await h.api.resume(h.notify);assert.equal(h.sends,0);assert.equal(h.api.getPending(),null);
});
test('wrong receipt identity cannot clear a known failed transaction',async()=>{
  const h=await lost();const p={...h.api.getPending(),hash};h.storage.setItem(key,JSON.stringify(p));h.transaction=()=>{const r=receipt();r.from_address='0x'+'f'.repeat(40);r.consensus_data.leader_receipt[0].execution_result='ERROR';return r;};
  await assert.rejects(h.api.clearFailedPending(),/identity/);assert.equal(h.api.getPending().hash,hash);
});
test('caller argument mutation after intent save does not change the signed call',async()=>{
  const h=await harness(),mutable=[...args];h.notify=p=>{if(p.phase==='signing')mutable[0]='different-case';};h.send=async input=>{assert.deepEqual(input.args,args);return hash;};
  await h.api.write('acknowledge',mutable,h.notify);assert.equal(h.sends,1);
});
