import type { Slot } from '../types'

type TypingSender = (isTyping:boolean) => void
export interface RoomTypingPresence { userId:string|null;isTyping:boolean }

const senders=new Map<string,Map<Slot,TypingSender>>()
const observations=new Map<string,Map<Slot,RoomTypingPresence>>()

export function registerRoomTypingSender(roomId:string,slot:Slot,sender:TypingSender):()=>void{
  const normalized=roomId.toLowerCase(),roomSenders=senders.get(normalized)??new Map<Slot,TypingSender>()
  roomSenders.set(slot,sender);senders.set(normalized,roomSenders)
  return()=>{
    const current=senders.get(normalized)
    if(current?.get(slot)===sender)current.delete(slot)
    if(current&&!current.size)senders.delete(normalized)
  }
}

export function sendRoomTyping(roomId:string,isTyping:boolean):boolean{
  const roomSenders=senders.get(roomId.toLowerCase())
  if(!roomSenders?.size)return false
  roomSenders.forEach(sender=>sender(isTyping))
  return true
}

const aggregate=(roomId:string):RoomTypingPresence=>{
  const values=observations.get(roomId.toLowerCase())?.values()
  if(!values)return {userId:null,isTyping:false}
  for(const value of values)if(value.userId&&value.isTyping)return value
  return {userId:null,isTyping:false}
}

export function observeRoomTyping(roomId:string,slot:Slot,presence:RoomTypingPresence):RoomTypingPresence{
  const normalized=roomId.toLowerCase(),roomObservations=observations.get(normalized)??new Map<Slot,RoomTypingPresence>()
  roomObservations.set(slot,presence);observations.set(normalized,roomObservations)
  return aggregate(normalized)
}

export function clearRoomTypingObservation(roomId:string,slot:Slot):RoomTypingPresence{
  const normalized=roomId.toLowerCase(),roomObservations=observations.get(normalized)
  roomObservations?.delete(slot)
  if(roomObservations&&!roomObservations.size)observations.delete(normalized)
  return aggregate(normalized)
}
