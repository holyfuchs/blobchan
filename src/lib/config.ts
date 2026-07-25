import { sepolia, mainnet } from 'viem/chains';
import type { Chain } from 'viem';

export const BLOBCHAN_MARKER = 'BLOBCHAN:';
export const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || '';

/** Per-chain configuration. Each board route (/sep, /m, ...) maps to one of these. */
export interface ChainConfig {
  /** URL slug for the board, e.g. `sep`, `m`. */
  id: string;
  /** Display name, e.g. `Sepolia`, `Mainnet`. */
  name: string;
  /** Viem chain definition used for wallet clients and transaction building. */
  viemChain: Chain;
  /** Execution-layer RPC endpoint for `eth_getBlockByHash` and `sendTransaction`. */
  rpcUrl: string;
  /** Beacon API endpoint for blob sidecar retrieval. */
  beaconUrl: string;
  /** Etherscan V2 API chainid (used in the txlist URL). */
  etherscanChainId: number;
  /** Etherscan V2 base URL. */
  etherscanBaseUrl: string;
  /** Burn address posts are sent to. Same vanity address works on every chain. */
  blobchanAddress: `0x${string}`;
  /** EIP-4844 blob sidecar pruning window (~18 days on both Sepolia and mainnet). */
  blobExpirySeconds: number;
  /** Amount of ETH to send when funding the ephemeral key. */
  ephemeralFundAmount: string;
  /** Minimum balance (wei) for the ephemeral key to be considered funded. */
  ephemeralMinBalance: bigint;
}

export const CHAINS: Record<string, ChainConfig> = {
  sep: {
    id: 'sep',
    name: 'Sepolia',
    viemChain: sepolia,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    beaconUrl: 'https://ethereum-sepolia-beacon-api.publicnode.com',
    etherscanChainId: 11155111,
    etherscanBaseUrl: 'https://api.etherscan.io/v2/api',
    blobchanAddress: '0x000000000000000000000000000000000000b10b',
    blobExpirySeconds: 18 * 24 * 60 * 60,
    ephemeralFundAmount: '0.01',
    ephemeralMinBalance: BigInt(100_000_000_000_000),
  },
  m: {
    id: 'm',
    name: 'Mainnet',
    viemChain: mainnet,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    beaconUrl: 'https://ethereum-beacon-api.publicnode.com',
    etherscanChainId: 1,
    etherscanBaseUrl: 'https://api.etherscan.io/v2/api',
    blobchanAddress: '0x000000000000000000000000000000000000b10b',
    blobExpirySeconds: 18 * 24 * 60 * 60,
    ephemeralFundAmount: '0.001',
    ephemeralMinBalance: BigInt(10_000_000_000_000), // 0.00001 ETH — blob gas is cheap but real
  },
};

/** Get a chain config by board slug, throwing if unknown. */
export function getChain(id: string): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unknown chain/board: ${id}`);
  return c;
}

/** All chain configs, for iterating (e.g. landing page board list). */
export const ALL_CHAINS = Object.values(CHAINS);

// --- Backwards-compat exports (used by code not yet chain-parameterized) ---
export const DEFAULT_CHAIN: Chain = sepolia;
export const RPC_URL = CHAINS.sep.rpcUrl;
export const BEACON_URL = CHAINS.sep.beaconUrl;
export const BLOBCHAN_ADDRESS = CHAINS.sep.blobchanAddress;
export const EPHEMERAL_FUND_AMOUNT = CHAINS.sep.ephemeralFundAmount;
export const EPHEMERAL_MIN_BALANCE = CHAINS.sep.ephemeralMinBalance;
