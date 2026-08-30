import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '../../store/authStore'

function renderRoute(){return render(<MemoryRouter initialEntries={['/home']}><Routes><Route path="/auth" element={<div>Sign in desk</div>}/><Route path="/home" element={<ProtectedRoute><div>Private desk</div></ProtectedRoute>}/></Routes></MemoryRouter>)}

describe('ProtectedRoute',()=>{
  beforeEach(()=>useAuthStore.setState({isAuthenticated:false,isLoading:false,user:null,session:null,profile:null,error:null}))
  it('waits for session restoration instead of flashing logged-out UI',()=>{useAuthStore.setState({isLoading:true});renderRoute();expect(screen.getByRole('status')).toHaveTextContent('Restoring')})
  it('redirects logged-out visitors',()=>{renderRoute();expect(screen.getByText('Sign in desk')).toBeInTheDocument()})
  it('renders protected content after authentication restoration',()=>{useAuthStore.setState({isAuthenticated:true});renderRoute();expect(screen.getByText('Private desk')).toBeInTheDocument()})
})
