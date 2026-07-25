import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia } from '@reown/appkit/networks';
import { browser } from '$app/environment';

// Note: live account state lives in `store.svelte.ts` (updated via wagmi's
// `watchAccount`). This module only owns the Wagmi/AppKit adapter setup.
let wagmiAdapter: WagmiAdapter | null = null;

// Only init on client
if (browser) {
	const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'PLACEHOLDER';

	wagmiAdapter = new WagmiAdapter({
		networks: [sepolia],
		projectId
	});

	// Initialise the AppKit modal (return value intentionally unused — account
	// state is tracked in `store.svelte.ts` via `watchAccount`).
	createAppKit({
		adapters: [wagmiAdapter],
		networks: [sepolia],
		defaultNetwork: sepolia,
		projectId,
		metadata: {
			name: 'blobchan',
			description: 'On-chain 4chan via EIP-4844 blobs',
			url: window.location.origin,
			icons: []
		}
	});
}

export { wagmiAdapter };
