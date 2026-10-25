import { useState, useEffect } from 'react'
import './index.css'
import { Navbar } from './components/Navbar'
import { Dashboard } from './features/Dashboard'
import { ToastContainer } from './components/ToastContainer'
import { SettingsModal } from './components/SettingsModal'
import { LoginView } from './components/LoginView'
import { useAuthStore } from './store/authStore'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>()
  const { user, token, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    const handleOpen = (e: any) => {
      setSettingsTab(e.detail?.tab)
      setSettingsOpen(true)
    }
    document.addEventListener('open-settings', handleOpen)
    
    return () => {
      document.removeEventListener('open-settings', handleOpen)
    }
  }, [])

  // If no active session, present clean login view
  if (!token || !user) {
    return <LoginView />
  }

  return (
    <>
      <Navbar />
      <main>
        <Dashboard />
      </main>
      <ToastContainer />
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
        />
      )}
    </>
  )
}

export default App
