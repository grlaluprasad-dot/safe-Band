import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (adminOnly && !user.is_admin) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
