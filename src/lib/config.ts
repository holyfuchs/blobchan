import { sepolia } from 'viem/chains';
import type { Chain } from 'viem';

export const DEFAULT_CHAIN: Chain = sepolia;
export const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
export const BEACON_URL = 'https://ethereum-sepolia-beacon-api.publicnode.com';
export const BLOBCHAN_MARKER = 'BLOBCHAN:';
export const BLOBCHAN_ADDRESS = '0x000000000000000000000000000000000000b10b' as const;
export const EPHEMERAL_FUND_AMOUNT = '0.01';
export const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || '';
export const EPHEMERAL_MIN_BALANCE = BigInt(100_000_000_000_000);
