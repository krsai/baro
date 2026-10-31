import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('commonjsHelpers')) return 'vendor-core'
          if (!id.includes('node_modules')) return undefined
          // Load PDF generation only when the user opens a PDF.
          if (/node_modules\/(jspdf|html2canvas|canvg|core-js|dompurify|fast-png|fflate|iobuffer|pako|performance-now|raf|regenerator-runtime|rgbcolor|stackblur-canvas|svg-pathdata|css-line-break|text-segmentation|utrie|base64-arraybuffer)\//.test(id.replaceAll('\\','/'))) return 'vendor-invoice-pdf'
          if (id.includes('@mui/icons-material')) return 'vendor-mui-icons'
          if (id.includes('@mui/x-date-pickers')) return 'vendor-mui-x'
          if (id.includes('@emotion')) return 'vendor-emotion'
          if (id.includes('@mui')) return 'vendor-mui'
          if (
            id.includes('@dnd-kit') ||
            id.includes('@hello-pangea')
          ) {
            return 'vendor-dnd'
          }
          if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router'
          if (id.includes('dayjs') || id.includes('@date-io')) return 'vendor-date'
          if (id.includes('@supabase')) return 'vendor-supabase'
          return 'vendor-core'
        },
      },
    },
  },
})
