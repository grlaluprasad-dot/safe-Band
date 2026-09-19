import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import AddChild from './pages/AddChild'
import ChildProfile from './pages/ChildProfile'
import PublicScan from './pages/PublicScan'
import AdminDashboard from './pages/AdminDashboard'

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Public - no auth, no navbar-gated content */}
        <Route path="/scan/:qrToken" element={<PublicScan />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/children/new"
          element={
            <ProtectedRoute>
              <AddChild />
            </ProtectedRoute>
          }
        />
        <Route
          path="/children/:childId"
          element={
            <ProtectedRoute>
              <ChildProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
