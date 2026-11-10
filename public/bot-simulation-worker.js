import {runSimulation} from './bot-simulation.js';
self.onmessage=({data})=>{
 try{self.postMessage({result:runSimulation(data)});}
 catch(error){self.postMessage({error:error.message});}
};
