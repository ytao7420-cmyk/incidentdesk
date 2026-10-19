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
export const getPending=()=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
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
  if(receipt.hash!==pending.hash||String(receipt.from_address??receipt.from).toLowerCase()!==pending.actor.toLowerCase()||String(receipt.to_address??receipt.to).toLowerCase()!==pending.address.toLowerCase())throw Error('Evaluation receipt identity differs from the saved transaction.');
  const expected=abi.calldata.encode(abi.calldata.makeCalldataObject(pending.method,pending.args,undefined));
  const raw=receipt.data?.calldata?.raw;
  if(!Array.isArray(raw)||raw.length!==expected.length||raw.some((byte,i)=>byte!==expected[i]))throw Error('Evaluation receipt calldata differs from the saved call.');
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
async function finish(pending,notify){const receipt=await wait(pending.hash,notify);const record=await readCase(pending.args[0]);let revision;if(pending.method==='evaluate'){revision=evaluationRevision(pending,receipt,record);}else{verifyAction(pending.method,pending.args,record);}localStorage.removeItem(key);notify({phase:'success',message:revision?`Execution and immutable revision ${revision.number} verified from this transaction receipt; current case may have advanced.`:'Execution and exact resulting state verified.',hash:pending.hash});return record;}
export async function write(method,args,notify){ready();if(busy||getPending())throw Error('Resume the pending transaction before another write.');if(!client)throw Error('Connect your wallet first.');if(!['open_case','capture_incident','evaluate','challenge','acknowledge'].includes(method))throw Error('Unsupported action');busy=true;try{const accounts=await wallet.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error('Wallet account changed. Reconnect first.');await network(wallet);notify({phase:'signing',message:'Review the zero-value Studionet transaction in MetaMask.'});const hash=await client.writeContract({address:config.address,functionName:method,args,value:0n,leaderOnly:false});const pending={hash,method,args,address:config.address,actor:address};localStorage.setItem(key,JSON.stringify(pending));return await finish(pending,notify);}catch(e){notify({phase:'error',message:e.message,hash:getPending()?.hash});throw e;}finally{busy=false;}}
export async function resume(notify){ready();const pending=getPending();if(!pending||busy)throw Error('No resumable transaction');if(pending.address!==config.address)throw Error('Pending contract differs; inspect saved transaction.');busy=true;try{return await finish(pending,notify);}finally{busy=false;}}
export async function inspectPending(){const p=getPending();if(!p)return null;const receipt=await reader.getTransaction({hash:p.hash});if(!terminalStatus(receipt))throw Error('This transaction is not terminal. Resume later.');try{assertExecutionSucceeded(receipt);throw Error('Successful transaction must be resumed for state verification.');}catch(e){if(e.message.startsWith('Successful'))throw e;const explicitFailure=executionEvidence(receipt).result==='ERROR'||['CANCELED','CANCELLED'].includes(lifecycleStatus(receipt));if(!explicitFailure)throw Error('Terminal status is ambiguous; keep the saved hash and inspect its receipt before any retry.');return {pending:p,error:e.message};}}
export async function clearFailedPending(){const evidence=await inspectPending();if(!evidence)throw Error('No pending transaction');localStorage.setItem('incidentdesk.last-failed.v1',JSON.stringify(evidence));localStorage.removeItem(key);return evidence;}
