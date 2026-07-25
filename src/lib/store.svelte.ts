import { getAccount, watchAccount } from '@wagmi/core';
import { parseEther, createPublicClient, http } from 'viem';
import { wagmiAdapter } from './wallet.svelte';
import {
	createEphemeralWallet,
	loadEphemeralWallet,
	clearEphemeralWallet,
	importEphemeralWallet,
	getEphemeralAddress
} from './ephemeral';
import { CHAINS, type ChainConfig } from './config';
import type { EphemeralWallet } from './types';

// ---- Account state ----
let accountState = $state<any>(null);
export const account = {
	get current() {
		return accountState;
	}
};

// ---- Ephemeral key ----
let ephemeralWallet = $state<EphemeralWallet | null>(typeof window !== 'undefined' ? loadEphemeralWallet() : null);
/** Per-chain balances: { sep: bigint|null, m: bigint|null } */
let balances = $state<Record<string, bigint | null>>({});
let fundingHash = $state<string | null>(null);
let fundingLoading = $state(false);

export const ephemeral = {
	get wallet() {
		return ephemeralWallet;
	},
	/** Balance for a specific chain. */
	balanceFor(chain: ChainConfig): bigint | null {
		return balances[chain.id] ?? null;
	},
	/** Whether the ephemeral key has enough funds on a specific chain. */
	hasFundsFor(chain: ChainConfig): boolean {
		const b = balances[chain.id];
		return b !== null && b !== undefined && b >= chain.ephemeralMinBalance;
	},
	get fundingHash() {
		return fundingHash;
	},
	get isFunding() {
		return fundingLoading;
	},

	generate() {
		ephemeralWallet = createEphemeralWallet();
		balances = {};
		refreshAllBalances();
	},

	importKey(pk: string) {
		ephemeralWallet = importEphemeralWallet(pk);
		balances = {};
		refreshAllBalances();
	},

	clear() {
		clearEphemeralWallet();
		ephemeralWallet = null;
		balances = {};
	},

	get address() {
		return ephemeralWallet ? getEphemeralAddress(ephemeralWallet) : null;
	},

	refreshBalance,
	refreshAllBalances
};

// Initialize (client only)
if (typeof window !== 'undefined' && wagmiAdapter) {
	watchAccount(wagmiAdapter.wagmiConfig, {
		onChange(acct) { accountState = acct; },
	});
	try { accountState = getAccount(wagmiAdapter.wagmiConfig); } catch {}
}

function refreshBalance(chain: ChainConfig) {
	const w = ephemeralWallet;
	if (!w) return;
	createPublicClient({ chain: chain.viemChain, transport: http(chain.rpcUrl) })
		.getBalance({ address: getEphemeralAddress(w) })
		.then((b) => {
			balances = { ...balances, [chain.id]: b };
		})
		.catch(() => {});
}

function refreshAllBalances() {
	for (const chain of Object.values(CHAINS)) refreshBalance(chain);
}

if (typeof window !== 'undefined') {
	setInterval(refreshAllBalances, 15_000);
}

export async function fundEphemeral(chain: ChainConfig, amountOverride?: bigint) {
	if (!ephemeralWallet || !accountState?.address) return;
	fundingLoading = true;
	try {
		const { sendTransaction, switchChain, getChainId } = await import('@wagmi/core');
		const config = wagmiAdapter!.wagmiConfig;
		// Switch the connected wallet to the target chain if it's not already active.
		// This prompts the user in their wallet (e.g. MetaMask) to switch networks.
		const currentChainId = getChainId(config);
		if (currentChainId !== chain.viemChain.id) {
			await switchChain(config, { chainId: chain.viemChain.id });
		}
		const value = amountOverride ?? parseEther(chain.ephemeralFundAmount);
		const hash = await sendTransaction(config, {
			to: getEphemeralAddress(ephemeralWallet),
			value,
			chainId: chain.viemChain.id,
		});
		fundingHash = hash;
	} catch (e) {
		console.error(e);
	} finally {
		fundingLoading = false;
	}
}
