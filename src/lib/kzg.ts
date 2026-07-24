import { loadKZG as loadRaw } from 'kzg-wasm';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

export type KzgApi = {
	blobToKzgCommitment(blob: Uint8Array): Uint8Array;
	computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
};

let _api: KzgApi | null = null;
let _loading: Promise<KzgApi> | null = null;

export async function loadKZG(): Promise<KzgApi> {
	if (_api) return _api;
	if (_loading) return _loading;
	_loading = (async () => {
		const raw = await loadRaw();
		_api = {
			blobToKzgCommitment(b: Uint8Array) {
				return hexToBytes(raw.blobToKZGCommitment(bytesToHex(b)) as Hex);
			},
			computeBlobKzgProof(b: Uint8Array, c: Uint8Array) {
				return hexToBytes(raw.computeBlobKZGProof(bytesToHex(b), bytesToHex(c)) as Hex);
			}
		};
		return _api;
	})();
	return _loading;
}
