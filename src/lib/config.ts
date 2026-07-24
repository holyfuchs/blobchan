import { sepolia } from 'viem/chains';
import type { Chain } from 'viem';

export const DEFAULT_CHAIN: Chain = sepolia;
export const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/alch_TEaj9L-Wl0XpsqGmm0wOH';
export const BLOBCHAN_MARKER = 'BLOBCHAN:';
export const BLOBCHAN_ADDRESS = '0x000000000000000000000000000000000000b10b' as const;
export const EPHEMERAL_FUND_AMOUNT = '0.01';
export const EPHEMERAL_MIN_BALANCE = BigInt(100_000_000_000_000);
