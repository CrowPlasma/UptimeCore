import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: 40, color: 'red', fontFamily: 'monospace'}}>
        <h2>Something went wrong.</h2>
        <pre>{this.state.error?.stack || this.state.error?.message || String(this.state.error)}</pre>
      </div>
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
