import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),signOut:vi.fn(),offline:vi.fn(),profile:vi.fn(),signUp:vi.fn(),assertPasswordIsSafe:vi.fn()}))
vi.mock('../config/env',()=>({env:{supabaseReady:true}}))
vi.mock('../api/supabase',()=>({supabase:{auth:{getSession:mocks.getSession,onAuthStateChange:mocks.onAuthStateChange,signOut:mocks.signOut,signInWithOAuth:vi.fn(),signInWithPassword:vi.fn(),signUp:mocks.signUp}}}))
vi.mock('../api/social',()=>({socialApi:{profile:mocks.profile,offline:mocks.offline,updateProfile:vi.fn()}}))
vi.mock('../security/passwordSecurity',()=>({assertPasswordIsSafe:mocks.assertPasswordIsSafe}))

import { useAuthStore } from './authStore'

describe('auth lifecycle',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.assertPasswordIsSafe.mockResolvedValue(undefined);mocks.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});mocks.signOut.mockResolvedValue({error:null});mocks.offline.mockResolvedValue(undefined);useAuthStore.setState({user:null,profile:null,session:null,isAuthenticated:false,isLoading:true,error:null})})
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
  it('checks password safety before email signup and fails closed',async()=>{
    const unsafe=new Error('This password appears in known data breaches.')
    mocks.assertPasswordIsSafe.mockRejectedValue(unsafe)
    await expect(useAuthStore.getState().signupWithEmail('a@example.com','CompromisedPass7','Alex')).rejects.toBe(unsafe)
    expect(mocks.signUp).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({isLoading:false,error:unsafe.message})
  })
})
