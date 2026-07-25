import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
			optimizeDeps: { exclude: ['kzg-wasm'] },
			server: {
				proxy: {
					'/api': {
						target: 'https://quick-wandering-shape.ethereum-sepolia.quiknode.pro/6472c8913762e103c23199b1a2a6e422c137701a',
						changeOrigin: true,
						rewrite: (path) => path.replace(/^\/api/, ''),
					},
				},
			},
			plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter({ fallback: 'index.html', precompress: false })
		})
	]
});
