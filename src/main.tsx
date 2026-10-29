import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'
import NotesPage from './pages/NotesPage'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing works on any static host without server rewrites. */}
    <HashRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:bookId" element={<ReaderPage />} />
        <Route path="/notes" element={<NotesPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
