import { createContext, useContext, useEffect, useState } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadUser = async () => {
    const token = localStorage.getItem('safeband_token')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const res = await client.get('/auth/me')
      setUser(res.data)
    } catch {
      localStorage.removeItem('safeband_token')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
  }, [])

  const login = async (email, password) => {
    const res = await client.post('/auth/login', { email, password })
    localStorage.setItem('safeband_token', res.data.access_token)
    await loadUser()
  }

  const register = async (payload) => {
    const res = await client.post('/auth/register', payload)
    localStorage.setItem('safeband_token', res.data.access_token)
    await loadUser()
  }

  const logout = () => {
    localStorage.removeItem('safeband_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
