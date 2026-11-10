import { createRoot } from 'react-dom/client'
import { AuthGate } from './AuthGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(<AuthGate />)
