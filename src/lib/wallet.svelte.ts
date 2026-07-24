import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia } from '@reown/appkit/networks';
import { browser } from '$app/environment';
import type { GetAccountReturnType } from '@wagmi/core';

// Reactive account state
let accountState = $state<GetAccountReturnType | null>(null);

export const account = {
	get current() {
		return accountState;
	}
};

let wagmiAdapter: WagmiAdapter | null = null;

// Only init on client
if (browser) {
	const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'PLACEHOLDER';

	wagmiAdapter = new WagmiAdapter({
		networks: [sepolia],
		projectId
	});

	const appkit = createAppKit({
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

	// Sync with Svelte $state
	appkit.subscribeAccount((acct) => {
		accountState = acct.isConnected ? acct : null;
	});
}

export { wagmiAdapter };
