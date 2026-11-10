import { createRoot } from 'react-dom/client'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import './preview.css'
import Preview from './Preview'
createRoot(document.getElementById('root')).render(<Preview />)
