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
import { estimatePostCost } from './blob';
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
/** Per-chain estimated post costs in wei, fetched from current base fees. */
let costEstimates = $state<Record<string, bigint | null>>({});
/** Current ETH price in USD, for displaying approximate $ cost per post.
 *  Fetched from Coingecko's free API, refreshed every 5 minutes. */
let ethPriceUsd = $state<number | null>(null);
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
	/** Realistic per-post cost estimate (wei) for a chain, or null if not yet
	 *  fetched. Falls back to null when the RPC couldn't provide base fees. */
	costEstimateFor(chain: ChainConfig): bigint | null {
		return costEstimates[chain.id] ?? null;
	},
	/** Current ETH price in USD for approximate $ display, or null if not yet
	 *  fetched. */
	get ethPriceUsd(): number | null {
		return ethPriceUsd;
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
if (typeof window !== 'undefined') {
	// Load cached ETH price immediately so the UI doesn't show '...' while
	// the network fetch is in flight.
	const cached = loadCachedEthPrice();
	if (cached !== null) ethPriceUsd = cached;
	// Fetch ETH price immediately on load (don't wait for the first balance
	// poll). The cache check inside refreshEthPrice makes this near-instant
	// when the cache is fresh.
	refreshEthPrice();
	// ETH price changes slowly — refresh every 5 minutes (matches cache TTL),
	// not every 15 seconds with the balance poll.
	setInterval(refreshEthPrice, 5 * 60 * 1000);
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
	for (const chain of Object.values(CHAINS)) {
		refreshBalance(chain);
		refreshCostEstimate(chain);
	}
}

async function refreshCostEstimate(chain: ChainConfig) {
	try {
		const cost = await estimatePostCost(chain);
		costEstimates = { ...costEstimates, [chain.id]: cost };
	} catch {
		// leave the previous estimate in place if the fetch fails
	}
}

/** Fetch current ETH price in USD. Uses Coinbase's spot API (fast, no key,
 *  no rate limits) with Coingecko as fallback. Result is cached in localStorage
 *  for 5 minutes so repeated page loads don't re-fetch. */
const ETH_PRICE_CACHE_KEY = 'blobchan_eth_price_usd';
const ETH_PRICE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadCachedEthPrice(): number | null {
	try {
		const raw = localStorage.getItem(ETH_PRICE_CACHE_KEY);
		if (!raw) return null;
		const { price, ts } = JSON.parse(raw);
		if (Date.now() - ts > ETH_PRICE_TTL_MS) return null; // stale
		return typeof price === 'number' ? price : null;
	} catch { return null; }
}

function saveCachedEthPrice(price: number) {
	try { localStorage.setItem(ETH_PRICE_CACHE_KEY, JSON.stringify({ price, ts: Date.now() })); } catch {}
}

async function refreshEthPrice() {
	// If we have a fresh cached price, use it and skip the network call.
	const cached = loadCachedEthPrice();
	if (cached !== null) { ethPriceUsd = cached; return; }
	try {
		// Coinbase's spot API — fast, reliable, no key, no rate limits.
		const res = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
		const data = await res.json();
		const price = parseFloat(data?.data?.amount);
		if (price > 0) { ethPriceUsd = price; saveCachedEthPrice(price); return; }
	} catch {}
	try {
		// Fallback: Coingecko's free API.
		const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
		const data = await res.json();
		const price = data?.ethereum?.usd;
		if (typeof price === 'number' && price > 0) { ethPriceUsd = price; saveCachedEthPrice(price); }
	} catch {
		// leave the previous price in place
	}
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
