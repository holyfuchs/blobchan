import { getAccount, getBalance, watchAccount } from '@wagmi/core';
import { parseEther, formatEther } from 'viem';
import { wagmiAdapter } from './wallet.svelte';
import {
	createEphemeralWallet,
	loadEphemeralWallet,
	clearEphemeralWallet,
	importEphemeralWallet,
	getEphemeralAddress
} from './ephemeral';
import { EPHEMERAL_FUND_AMOUNT, EPHEMERAL_MIN_BALANCE, RPC_URL } from './config';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
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
let ephemeralBalance = $state<bigint | null>(null);
let fundingHash = $state<string | null>(null);
let fundingLoading = $state(false);

export const ephemeral = {
	get wallet() {
		return ephemeralWallet;
	},
	get balance() {
		return ephemeralBalance;
	},
	get hasFunds() {
		return ephemeralBalance !== null && ephemeralBalance >= EPHEMERAL_MIN_BALANCE;
	},
	get fundingHash() {
		return fundingHash;
	},
	get isFunding() {
		return fundingLoading;
	},

	generate() {
		ephemeralWallet = createEphemeralWallet();
		ephemeralBalance = null;
		refreshBalance();
	},

	importKey(pk: string) {
		ephemeralWallet = importEphemeralWallet(pk);
		ephemeralBalance = null;
		refreshBalance();
	},

	clear() {
		clearEphemeralWallet();
		ephemeralWallet = null;
		ephemeralBalance = null;
	},

	async fund() {
		if (!ephemeralWallet || !accountState?.address) return;
		fundingLoading = true;
		try {
			// Use the main wallet to send ETH
			const { sendTransaction } = await import('@wagmi/core');
			// We need to use the wagmi connector for this
			// ... simplified for now
		} finally {
			fundingLoading = false;
		}
	},

	get address() {
		return ephemeralWallet ? getEphemeralAddress(ephemeralWallet) : null;
	},

	refreshBalance
};

// Initialize (client only)
if (typeof window !== 'undefined' && wagmiAdapter) {
	watchAccount(wagmiAdapter.wagmiConfig, {
		onChange(acct) { accountState = acct; },
	});
	try { accountState = getAccount(wagmiAdapter.wagmiConfig); } catch {}
}

function refreshBalance() {
	const w = ephemeralWallet;
	if (!w) return;
	createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
		.getBalance({ address: getEphemeralAddress(w) })
		.then((b) => {
			ephemeralBalance = b;
		})
		.catch(() => {});
}

if (typeof window !== 'undefined') {
	setInterval(refreshBalance, 15_000);
}

export async function fundEphemeral() {
	if (!ephemeralWallet || !accountState?.address) return;
	fundingLoading = true;
	try {
		const { sendTransaction } = await import('@wagmi/core');
		const hash = await sendTransaction(wagmiAdapter!.wagmiConfig, {
			to: getEphemeralAddress(ephemeralWallet),
			value: parseEther(EPHEMERAL_FUND_AMOUNT)
		});
		fundingHash = hash;
	} catch (e) {
		console.error(e);
	} finally {
		fundingLoading = false;
	}
}
