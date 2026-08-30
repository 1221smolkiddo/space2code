import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { env } from '../config/env'
import { supabase } from '../api/supabase'
import { socialApi } from '../api/social'
import { ApiError } from '../api/client'
import { useThemeStore } from './themeStore'
import type { Profile } from '../types'

export interface AuthUser { id:string;email:string;displayName:string|null;avatarUrl:string|null }
interface AuthState { user:AuthUser|null;profile:Profile|null;session:Session|null;isAuthenticated:boolean;isLoading:boolean;error:string|null;restore:()=>Promise<void>;loginWithGoogle:()=>Promise<void>;loginWithEmail:(email:string,password:string)=>Promise<void>;signupWithEmail:(email:string,password:string,displayName:string)=>Promise<void>;logout:()=>Promise<void>;updateProfile:(data:Partial<Pick<Profile,'displayName'|'avatarUrl'|'preferredTheme'|'editorFontSize'>>)=>Promise<void>;clearError:()=>void }
let authSubscription: { unsubscribe:()=>void } | null=null
const message=(error:unknown)=>error instanceof ApiError||error instanceof Error?error.message:'Authentication failed. Please try again.'
const authUser=(session:Session,profile:Profile|null):AuthUser=>({id:session.user.id,email:session.user.email??'',displayName:profile?.displayName??String(session.user.user_metadata.display_name??session.user.user_metadata.full_name??'Coder'),avatarUrl:profile?.avatarUrl??(typeof session.user.user_metadata.avatar_url==='string'?session.user.user_metadata.avatar_url:null)})
async function loadProfile(){const {profile}=await socialApi.profile();useThemeStore.getState().hydrate(profile.preferredTheme,profile.editorFontSize);return profile}

export const useAuthStore=create<AuthState>((set,get)=>({
 user:null,profile:null,session:null,isAuthenticated:false,isLoading:true,error:null,
 restore:async()=>{if(!env.supabaseReady){set({isLoading:false,error:'Supabase public configuration is missing.'});return}set({isLoading:true,error:null});try{const{data,error}=await supabase.auth.getSession();if(error)throw error;const session=data.session;const profile=session?await loadProfile():null;set({session,profile,user:session?authUser(session,profile):null,isAuthenticated:Boolean(session),isLoading:false});authSubscription?.unsubscribe();authSubscription=supabase.auth.onAuthStateChange((_event,next)=>{queueMicrotask(async()=>{try{const nextProfile=next?await loadProfile():null;set({session:next,profile:nextProfile,user:next?authUser(next,nextProfile):null,isAuthenticated:Boolean(next),isLoading:false,error:null})}catch(error){set({isLoading:false,error:message(error)})}})}).data.subscription}catch(error){set({isLoading:false,error:message(error),session:null,user:null,profile:null,isAuthenticated:false})}},
 loginWithGoogle:async()=>{if(!env.supabaseReady){set({error:'Supabase public configuration is missing.'});return}set({isLoading:true,error:null});const{error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/home`}});if(error){set({isLoading:false,error:error.message});throw error}},
 loginWithEmail:async(email,password)=>{set({isLoading:true,error:null});const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error){set({isLoading:false,error:error.message});throw error}const profile=await loadProfile();set({session:data.session,profile,user:authUser(data.session,profile),isAuthenticated:true,isLoading:false})},
 signupWithEmail:async(email,password,displayName)=>{set({isLoading:true,error:null});const{data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName}}});if(error){set({isLoading:false,error:error.message});throw error}if(!data.session){set({isLoading:false,error:'Check your email to confirm your account, then log in.'});return}await loadProfile();const updated=(await socialApi.updateProfile({displayName})).profile;set({session:data.session,profile:updated,user:authUser(data.session,updated),isAuthenticated:true,isLoading:false})},
 logout:async()=>{set({isLoading:true});await socialApi.offline().catch(()=>undefined);await supabase.auth.signOut();authSubscription?.unsubscribe();authSubscription=null;set({user:null,profile:null,session:null,isAuthenticated:false,isLoading:false,error:null})},
 updateProfile:async(data)=>{const previous=get().profile;if(!previous)return;const optimistic={...previous,...data};set({profile:optimistic,user:get().session?authUser(get().session!,optimistic):get().user});try{const{profile}=await socialApi.updateProfile(data);set({profile,user:get().session?authUser(get().session!,profile):get().user});useThemeStore.getState().hydrate(profile.preferredTheme,profile.editorFontSize)}catch(error){set({profile:previous,user:get().session?authUser(get().session!,previous):get().user,error:message(error)});throw error}},
 clearError:()=>set({error:null}),
}))
