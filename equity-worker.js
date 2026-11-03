import {parentPort} from 'node:worker_threads';
import {exactTableEquity} from './exact-equity.js';

parentPort.on('message',({id,input})=>{
 try{parentPort.postMessage({id,result:exactTableEquity(input)});}
 catch(error){parentPort.postMessage({id,error:error.message});}
});
