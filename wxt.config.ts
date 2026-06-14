import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'WhyBuy',
    description:
      'A courtroom-inspired purchase interceptor. The product is on trial before you buy. Argue for it, then let the judge decide.',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'WhyBuy',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: () => ({
    build: {
      target: 'es2022',
    },
  }),
})
