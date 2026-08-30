import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),signOut:vi.fn(),offline:vi.fn(),profile:vi.fn()}))
vi.mock('../config/env',()=>({env:{supabaseReady:true}}))
vi.mock('../api/supabase',()=>({supabase:{auth:{getSession:mocks.getSession,onAuthStateChange:mocks.onAuthStateChange,signOut:mocks.signOut,signInWithOAuth:vi.fn(),signInWithPassword:vi.fn(),signUp:vi.fn()}}}))
vi.mock('../api/social',()=>({socialApi:{profile:mocks.profile,offline:mocks.offline,updateProfile:vi.fn()}}))

import { useAuthStore } from './authStore'

describe('auth lifecycle',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});mocks.signOut.mockResolvedValue({error:null});mocks.offline.mockResolvedValue(undefined);useAuthStore.setState({user:null,profile:null,session:null,isAuthenticated:false,isLoading:true,error:null})})
  it('restores a Supabase session and backend profile after refresh',async()=>{
    const session={access_token:'public-user-token',user:{id:'u1',email:'a@example.com',user_metadata:{}}}
    const profile={id:'u1',displayName:'Alex',avatarUrl:null,preferredTheme:'dark',editorFontSize:14,createdAt:'x',updatedAt:'x'}
    mocks.getSession.mockResolvedValue({data:{session},error:null});mocks.profile.mockResolvedValue({profile})
    await useAuthStore.getState().restore()
    expect(useAuthStore.getState()).toMatchObject({isAuthenticated:true,isLoading:false,user:{id:'u1',displayName:'Alex'},profile})
  })
  it('clears local state and marks presence offline on logout',async()=>{
    useAuthStore.setState({isAuthenticated:true,user:{id:'u1',email:'a@example.com',displayName:'Alex',avatarUrl:null}})
    await useAuthStore.getState().logout()
    expect(mocks.offline).toHaveBeenCalledOnce();expect(mocks.signOut).toHaveBeenCalledOnce();expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
