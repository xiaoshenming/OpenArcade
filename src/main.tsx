import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installDiagnosticSink } from './platform/diagnostics'
import './styles.css'

installDiagnosticSink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
