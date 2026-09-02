import { describe,expect,it,vi } from 'vitest'
import { clearRoomTypingObservation,observeRoomTyping,registerRoomTypingSender,sendRoomTyping } from './roomAwareness'

describe('room typing awareness transport',()=>{
  it('broadcasts typing through every mounted desk provider and falls back when one is absent',()=>{
    const roomId='10000000-0000-4000-8000-000000000001',deskA=vi.fn(),deskB=vi.fn()
    const removeB=registerRoomTypingSender(roomId,'B',deskB)
    const removeA=registerRoomTypingSender(roomId.toUpperCase(),'A',deskA)
    expect(sendRoomTyping(roomId,true)).toBe(true)
    expect(deskA).toHaveBeenCalledWith(true);expect(deskB).toHaveBeenCalledWith(true)
    removeA();expect(sendRoomTyping(roomId,false)).toBe(true);expect(deskB).toHaveBeenCalledWith(false)
    removeB();expect(sendRoomTyping(roomId,true)).toBe(false)
  })

  it('does not clear a partner who is still typing on the other desk awareness channel',()=>{
    const roomId='20000000-0000-4000-8000-000000000001'
    expect(observeRoomTyping(roomId,'A',{userId:'partner',isTyping:true})).toEqual({userId:'partner',isTyping:true})
    expect(observeRoomTyping(roomId,'B',{userId:null,isTyping:false})).toEqual({userId:'partner',isTyping:true})
    expect(observeRoomTyping(roomId,'A',{userId:'partner',isTyping:false})).toEqual({userId:null,isTyping:false})
    expect(clearRoomTypingObservation(roomId,'A')).toEqual({userId:null,isTyping:false})
    expect(clearRoomTypingObservation(roomId,'B')).toEqual({userId:null,isTyping:false})
  })
})
