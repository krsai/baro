import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
          if (
            id.includes('react-dnd') ||
            id.includes('dnd-core') ||
            id.includes('html5-backend') ||
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
