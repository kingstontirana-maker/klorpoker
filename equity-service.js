import {Worker} from 'node:worker_threads';

// One background worker keeps exhaustive enumeration off the game event loop.
let worker,sequence=0;
const pending=new Map();
export function calculateTableEquity(input){
 if(!worker){
  worker=new Worker(new URL('./equity-worker.js',import.meta.url));
  worker.on('message',({id,result,error})=>{const job=pending.get(id);if(!job)return;pending.delete(id);if(!pending.size)worker.unref();if(error)job.reject(Error(error));else job.resolve(result);});
  const failed=error=>{for(const job of pending.values())job.reject(error);pending.clear();worker=undefined;};
  worker.on('error',failed);
  worker.on('exit',code=>{if(code!==0&&worker)failed(Error(`Equity worker exited (${code})`));});
  worker.unref();
 }
 const id=++sequence;worker.ref();
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,input});});
}
