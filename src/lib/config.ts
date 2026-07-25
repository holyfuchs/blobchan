import { sepolia } from 'viem/chains';
import type { Chain } from 'viem';

export const DEFAULT_CHAIN: Chain = sepolia;
export const RPC_URL = 'https://quick-wandering-shape.ethereum-sepolia.quiknode.pro/6472c8913762e103c23199b1a2a6e422c137701a/';
export const BLOBCHAN_MARKER = 'BLOBCHAN:';
export const BLOBCHAN_ADDRESS = '0x000000000000000000000000000000000000b10b' as const;
export const EPHEMERAL_FUND_AMOUNT = '0.01';
export const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || '';
export const EPHEMERAL_MIN_BALANCE = BigInt(100_000_000_000_000);
