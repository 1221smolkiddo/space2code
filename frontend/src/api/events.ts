import type { UserEventEnvelope } from '../types'
import { env } from '../config/env'
import { getAccessToken } from './client'
export function connectUserEvents(onEvent:(event:UserEventEnvelope)=>void,onConnection:(connected:boolean)=>void):()=>void{
 const controller=new AbortController();let stopped=false,lastId:string|undefined
 const run=async()=>{let delay=500;while(!stopped){try{const token=await getAccessToken();const query=lastId?`?after=${encodeURIComponent(lastId)}`:'';const response=await fetch(`${env.apiBaseUrl}/v1/events/stream${query}`,{headers:{authorization:`Bearer ${token}`,accept:'text/event-stream'},signal:controller.signal});if(!response.ok||!response.body)throw new Error('Event stream unavailable');onConnection(true);delay=500;const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(!stopped){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split('\n\n');buffer=blocks.pop()??'';for(const block of blocks){const data=block.split('\n').find(line=>line.startsWith('data: '))?.slice(6);if(data){const event=JSON.parse(data) as UserEventEnvelope;if(event.id===lastId)continue;lastId=event.id;onEvent(event)}}}}catch(error){if(stopped||(error instanceof DOMException&&error.name==='AbortError'))break;onConnection(false);await new Promise(resolve=>setTimeout(resolve,delay));delay=Math.min(delay*2,10_000)}}}
 void run();return()=>{stopped=true;controller.abort()}
}
