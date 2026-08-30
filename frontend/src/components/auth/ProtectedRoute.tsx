import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export function ProtectedRoute({children}:{children:ReactNode}) {
  const {isAuthenticated,isLoading}=useAuthStore()
  if(isLoading)return <div className="app-loading" role="status">Restoring your coding desk…</div>
  return isAuthenticated?<>{children}</>:<Navigate to="/auth" replace/>
}
