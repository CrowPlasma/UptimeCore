import { useState, useEffect } from 'react'
import './index.css'
import { Navbar } from './components/Navbar'
import { Dashboard } from './features/Dashboard'
import { ToastContainer } from './components/ToastContainer'
import { SettingsModal } from './components/SettingsModal'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const handleOpen = () => setSettingsOpen(true)
    document.addEventListener('open-settings', handleOpen)
    
    return () => {
      document.removeEventListener('open-settings', handleOpen)
    }
  }, [])

  return (
    <>
      <Navbar />
      <main>
        <Dashboard />
      </main>
      <ToastContainer />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

export default App
