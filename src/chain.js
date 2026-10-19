// SDK transport and recoverable pending-write pattern adapted from ReleaseProof.
import {createClient,abi} from 'genlayer-js';
import {canonical} from '../lib/model.js';
import {studionet} from 'genlayer-js/chains';
import config from '../public/deployment.json';
import {assertExecutionSucceeded,terminalStatus,executionEvidence,lifecycleStatus} from '../lib/receipt.js';
const reader=createClient({chain:studionet});
const providers=new Map();let wallet,client,address='',busy=false;
const key='incidentdesk.pending.v1';
if(typeof window!=='undefined'){window.addEventListener('eip6963:announceProvider',e=>{if(e.detail?.info?.rdns&&e.detail?.provider?.request)providers.set(e.detail.info.rdns,e.detail.provider);});window.dispatchEvent(new Event('eip6963:requestProvider'));}
export const deployment=config;
export const getAddress=()=>address;
// A missing journal is different from unreadable storage: uncertainty must block sends.
export const getPending=()=>{try{const raw=localStorage.getItem(key);if(raw===null)return null;const saved=JSON.parse(raw);return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{state:'unreadable'};}catch{return {state:'unreadable'};}};
const actions={open_case:6,capture_incident:3,evaluate:1,challenge:3,acknowledge:2};
function savePending(pending){const raw=JSON.stringify(pending);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('Could not persist the transaction intent. New writes remain blocked.');}
function validatePending(pending){
  if(!pending||pending.state==='unreadable')throw Error('The saved transaction record cannot be read. Restore browser storage before continuing; new writes are blocked.');
  if(!/^0x[\da-f]{40}$/i.test(pending.actor??'')||pending.address?.toLowerCase()!==config.address?.toLowerCase())throw Error('Pending actor or contract differs; inspect the saved transaction.');
  if(pending.chainId!==undefined&&pending.chainId!==61999)throw Error('Pending network differs from Studionet.');
  if(!Object.hasOwn(actions,pending.method)||!Array.isArray(pending.args)||pending.args.length!==actions[pending.method]||pending.args.some(v=>typeof v!=='string'))throw Error('Saved call is invalid; inspect the transaction intent.');
  if((pending.value!==undefined&&pending.value!=='0')||(pending.leaderOnly!==undefined&&pending.leaderOnly!==false))throw Error('Saved transaction is not a zero-value full-validator call.');
  if(pending.hash&&!/^0x[\da-f]{64}$/i.test(pending.hash))throw Error('Saved transaction hash is invalid.');
  return pending;
}
function isWalletRejection(error){const seen=new Set();for(let item=error;item&&typeof item==='object'&&!seen.has(item);item=item.cause??item.data?.originalError){seen.add(item);if(item.code===4001)return true;}return false;}
function samePending(pending){if(canonical(getPending())!==canonical(pending))throw Error('The saved transaction changed in another tab. Inspect it before continuing.');}
// Recovery never trusts a user-entered hash by itself. Check the RPC transaction's
// sender, destination, exact ABI call and value before associating it with intent.
export function verifyTransactionIdentity(pending,receipt){
  if(!/^0x[\da-f]{64}$/i.test(pending.hash??'')||String(receipt?.hash??'').toLowerCase()!==pending.hash.toLowerCase()||String(receipt?.from_address??receipt?.from).toLowerCase()!==pending.actor.toLowerCase()||String(receipt?.to_address??receipt?.to).toLowerCase()!==pending.address.toLowerCase())throw Error('Transaction receipt identity differs from the saved intent.');
  const expected=abi.calldata.encode(abi.calldata.makeCalldataObject(pending.method,pending.args,undefined)),raw=receipt.data?.calldata?.raw;
  if(!Array.isArray(raw)||raw.length!==expected.length||raw.some((byte,i)=>byte!==expected[i]))throw Error('Transaction receipt calldata differs from the saved call.');
  if(receipt.value!==undefined){let value;try{value=BigInt(receipt.value);}catch{throw Error('Transaction value cannot be verified.');}if(value!==0n)throw Error('Transaction value differs from the zero-value intent.');}
  if(receipt.leader_only!==undefined&&receipt.leader_only!==false)throw Error('Transaction does not use the saved full-validator mode.');
  return receipt;
}
export const txURL=hash=>/^0x[\da-f]{64}$/i.test(hash??'')?`${config.explorer}/tx/${hash}`:'';
function ready(){if(!config.deployed||!/^0x[\da-f]{40}$/i.test(config.address??''))throw Error('Live deployment is not configured yet.');}
async function network(p){if(Number(await p.request({method:'eth_chainId'}))!==61999){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]});}catch(e){if(e.code!==4902&&e?.data?.originalError?.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0xf22f',chainName:'GenLayer Studionet',nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18},rpcUrls:[config.rpc],blockExplorerUrls:[config.explorer]}]});}}if(Number(await p.request({method:'eth_chainId'}))!==61999)throw Error('Select GenLayer Studionet 61999.');}
export async function connect(){window.dispatchEvent(new Event('eip6963:requestProvider'));await new Promise(r=>setTimeout(r,100));wallet=providers.get('io.metamask');if(!wallet){const list=Array.isArray(window.ethereum?.providers)?window.ethereum.providers:[window.ethereum];wallet=list.find(p=>p?.isMetaMask&&!p?.isSubWallet&&!p?.isSubwallet);}if(!wallet)throw Error('Enable MetaMask for this site.');const accounts=await wallet.request({method:'eth_requestAccounts'});if(!accounts?.[0])throw Error('Select an account.');await network(wallet);address=accounts[0];client=createClient({chain:studionet,account:address,provider:wallet});return address;}
export async function readCase(id){ready();return JSON.parse(await reader.readContract({address:config.address,functionName:'get_case',args:[id]}));}
async function wait(hash,notify){for(let n=0;n<90;n++){let r;try{r=await reader.getTransaction({hash});}catch(e){if(n===89)throw e;}notify({phase:'pending',message:`Waiting for validator consensus${r?.statusName?' · '+r.statusName:''}`,hash});if(r&&terminalStatus(r))return assertExecutionSucceeded(r);await new Promise(r=>setTimeout(r,4000));}throw Error('Still pending. Resume the recorded transaction rather than sending another.');}
// An evaluation returns null, but its successful leader receipt records every
// nondeterministic finding. Match those exact outputs against immutable history,
// never the mutable case state or simply the latest revision. Ambiguous repeated
// outputs fail closed and retain the pending hash for inspection.
export function evaluationRevision(pending,receipt,record){
  assertExecutionSucceeded(receipt);
  verifyTransactionIdentity(pending,receipt);
  const entries=receipt.consensus_data?.leader_receipt;
  const leader=(Array.isArray(entries)?entries:[entries]).filter(r=>r?.mode==='leader').at(-1);
  const blocks=leader?.eq_outputs;
  if(!blocks||typeof blocks!=='object')throw Error('Evaluation receipt lacks independently executed findings.');
  const keys=Object.keys(blocks).sort((a,b)=>Number(a)-Number(b));
  if(!keys.length||keys.some((k,i)=>k!==String(i)))throw Error('Evaluation receipt finding sequence is incomplete.');
  const json=value=>value instanceof Map?Object.fromEntries([...value].map(([k,v])=>[k,json(v)])):Array.isArray(value)?value.map(json):typeof value==='bigint'?Number(value):value;
  const findings=keys.map(k=>{const block=blocks[k];if(block.status!=='return'||!Array.isArray(block.payload?.raw))throw Error('Evaluation finding did not return successfully.');return json(abi.calldata.decode(Uint8Array.from(block.payload.raw)));});
  const candidates=(record.revisions??[]).filter(r=>canonical(r.findings.map(f=>f.semantics))===canonical(findings));
  if(candidates.length!==1)throw Error(candidates.length?'Evaluation receipt matches multiple immutable revisions; retain the hash for manual inspection.':'Evaluation receipt findings are absent from immutable revision history.');
  const revision=candidates[0];
  if(record.id!==pending.args[0]||revision.scope_digest!==record.scope_digest)throw Error('Evaluation revision scope differs.');
  if(pending.verifiedRevisionDigest&&pending.verifiedRevisionDigest!==revision.digest)throw Error('Evaluation revision differs from its previously verified digest.');
  return revision;
}

export function verifyAction(method,args,record){if(record.id!==args[0])throw Error('Read-back case mismatch');if(method==='open_case'&&(record.customer!==args[1].toLowerCase()||record.scope.feature!==args[3]))throw Error('Opened scope differs');if(method==='capture_incident'&&!record.evidence.some(e=>e.projection.incident_id===args[1]&&e.sha256===args[2]))throw Error('Snapshot missing after transaction');if(method==='challenge'&&!record.challenges.some(c=>c.base_digest===args[1]&&c.reason===args[2]))throw Error('Challenge missing');if(method==='evaluate')throw Error('Evaluate requires receipt-bound immutable revision verification.');if(method==='acknowledge'&&!record.acknowledgements.some(a=>a.revision_digest===args[1]))throw Error('Acknowledgement missing');return record;}
async function finish(pending,notify){
  const receipt=await wait(pending.hash,notify);verifyTransactionIdentity(pending,receipt);
  const record=await readCase(pending.args[0]);let revision;
  if(pending.method==='evaluate')revision=evaluationRevision(pending,receipt,record);else verifyAction(pending.method,pending.args,record);
  samePending(pending);localStorage.removeItem(key);
  notify({phase:'success',message:revision?`Execution and immutable revision ${revision.number} verified from this transaction receipt; current case may have advanced.`:'Execution and exact resulting state verified.',hash:pending.hash});return record;
}
export async function write(method,args,notify){
  ready();if(busy||getPending())throw Error('Resolve the saved transaction intent before another write.');
  if(!client)throw Error('Connect your wallet first.');
  if(!Object.hasOwn(actions,method)||!Array.isArray(args)||args.length!==actions[method]||args.some(v=>typeof v!=='string'))throw Error('Unsupported action or arguments');
  busy=true;let intent,knownHash,enteredSdk=false;
  try{
    const accounts=await wallet.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error('Wallet account changed. Reconnect first.');await network(wallet);
    if(getPending())throw Error('Another transaction intent already exists. Resolve it first.');
    intent={version:2,state:'prepared',intentId:crypto.randomUUID(),createdAt:new Date().toISOString(),chainId:61999,method,args:[...args],address:config.address,actor:address,value:'0',leaderOnly:false,hash:null};
    savePending(intent); // Must succeed before the SDK can request a signature or broadcast.
    notify({phase:'signing',message:'Intent saved. Review the zero-value Studionet transaction in MetaMask.'});
    samePending(intent);
    enteredSdk=true;knownHash=await client.writeContract({address:config.address,functionName:method,args:intent.args,value:0n,leaderOnly:false});
    if(!/^0x[\da-f]{64}$/i.test(knownHash??''))throw Error('The wallet did not return a valid transaction hash.');
    samePending(intent);const pending={...intent,state:'submitted',hash:knownHash};savePending(pending);
    return await finish(pending,notify);
  }catch(e){
    // EIP-1193 4001 explicitly means the user rejected the wallet request.
    // Other SDK errors may occur after the node accepted the transaction.
    if(enteredSdk&&!knownHash&&isWalletRejection(e)){
      samePending(intent);localStorage.setItem('incidentdesk.last-rejected.v1',JSON.stringify({intent,message:e.message}));localStorage.removeItem(key);
    }
    const saved=getPending(),uncertain=intent&&saved&&!saved.hash;
    const message=uncertain?'Broadcast outcome is unknown; no replacement will be sent. Recover the transaction hash from wallet activity or the explorer. '+e.message:e.message;
    notify({phase:'error',message,hash:knownHash??saved?.hash});throw Error(message,{cause:e});
  }finally{busy=false;}
}
export async function resume(notify){
  ready();if(busy)throw Error('A transaction check is already running.');const pending=validatePending(getPending());
  if(!pending.hash)throw Error('Broadcast outcome is unknown. Supply its transaction hash for verified recovery; no replacement will be sent.');
  busy=true;try{return await finish(pending,notify);}finally{busy=false;}
}
export async function recover(hash,notify){
  ready();if(busy)throw Error('A transaction check is already running.');const intent=validatePending(getPending());
  if(intent.hash)throw Error('A hash is already saved. Resume that transaction.');
  if(!/^0x[\da-f]{64}$/i.test(hash??''))throw Error('Enter a complete 0x transaction hash.');
  busy=true;try{
    const pending={...intent,state:'submitted',hash};
    const receipt=await reader.getTransaction({hash});verifyTransactionIdentity(pending,receipt);
    samePending(intent);savePending(pending);
    notify({phase:'pending',message:'Recovered hash matches the saved sender, contract and exact call. Checking execution and state.',hash});
    return await finish(pending,notify);
  }finally{busy=false;}
}
export async function inspectPending(){
  const p=validatePending(getPending());if(!p.hash)throw Error('Unknown broadcast cannot be cleared. Recover and verify its transaction hash first.');
  const receipt=await reader.getTransaction({hash:p.hash});verifyTransactionIdentity(p,receipt);
  if(!terminalStatus(receipt))throw Error('This transaction is not terminal. Resume later.');
  try{assertExecutionSucceeded(receipt);throw Error('Successful transaction must be resumed for state verification.');}
  catch(e){if(e.message.startsWith('Successful'))throw e;const explicitFailure=executionEvidence(receipt).result==='ERROR'||['CANCELED','CANCELLED'].includes(lifecycleStatus(receipt));if(!explicitFailure)throw Error('Terminal status is ambiguous; keep the saved hash and inspect its receipt before any retry.');return {pending:p,error:e.message};}
}
export async function clearFailedPending(){
  if(busy)throw Error('A transaction check is already running.');busy=true;
  try{const evidence=await inspectPending();samePending(evidence.pending);localStorage.setItem('incidentdesk.last-failed.v1',JSON.stringify(evidence));localStorage.removeItem(key);return evidence;}finally{busy=false;}
}
