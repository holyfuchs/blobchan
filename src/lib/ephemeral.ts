import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import type { Address, WalletClient, Transport, Chain, Account } from 'viem';
import { DEFAULT_CHAIN, RPC_URL } from './config';
import type { EphemeralWallet } from './types';

const KEY = 'blobchan_ephemeral';

function ls() { return typeof window !== 'undefined' ? window.localStorage : null; }

export function createEphemeralWallet(): EphemeralWallet {
  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);
  const w: EphemeralWallet = { address: acct.address, privateKey: pk, createdAt: Date.now() };
  ls()?.setItem(KEY, JSON.stringify(w));
  return w;
}

export function loadEphemeralWallet(): EphemeralWallet | null {
  try { return JSON.parse(ls()?.getItem(KEY) || 'null'); } catch { return null; }
}

export function importEphemeralWallet(privateKey: string): EphemeralWallet {
  const raw = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  if (raw.length !== 66) throw new Error('Key must be 64 hex chars');
  const acct = privateKeyToAccount(raw as `0x${string}`);
  const w: EphemeralWallet = { address: acct.address, privateKey: raw, createdAt: Date.now() };
  ls()?.setItem(KEY, JSON.stringify(w));
  return w;
}

export function clearEphemeralWallet(): void { ls()?.removeItem(KEY); }

export function getEphemeralAddress(w: EphemeralWallet): Address {
	return w.address as Address;
}

export function createEphemeralClient(w: EphemeralWallet): WalletClient<Transport, Chain, Account> {
	return createWalletClient({
		account: privateKeyToAccount(w.privateKey as `0x${string}`),
		chain: DEFAULT_CHAIN,
		transport: http(RPC_URL)
	});
}
