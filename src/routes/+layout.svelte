<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { account, ephemeral, fundEphemeral } from '$lib/store.svelte.ts';
	import { nsfw } from '$lib/nsfw.svelte.ts';
	import { formatEther } from 'viem';

	let { children } = $props();

	let showPk = $state(false);
	let showImport = $state(false);
	let importVal = $state('');
	let importErr = $state('');

	function doImport() {
		try { ephemeral.importKey(importVal.trim()); showImport = false; importVal = ''; importErr = ''; }
		catch (e: any) { importErr = e.message; }
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header class="blobchan-header">
	<span class="blobchan-logo">blobchan</span>
	<div class="header-right">
		<button class="nsfw-btn" onclick={nsfw.toggle}>
			{nsfw.on ? '🔞 NSFW' : '✅ SFW'}
		</button>
		<appkit-button></appkit-button>

		{#if account.current?.isConnected}
			{#if !ephemeral.wallet}
				<button class="btn" onclick={() => ephemeral.generate()}>Generate Key</button>
				{#if !showImport}
					<button class="btn" onclick={() => showImport = true}>Import</button>
				{:else}
					<input type="password" placeholder="0x..." bind:value={importVal} class="key-input" onkeydown={(e) => e.key === 'Enter' && doImport()} />
					<button class="btn" onclick={doImport}>OK</button>
					<button class="btn-cancel" onclick={() => { showImport = false; importVal = ''; importErr = ''; }}>x</button>
				{/if}
				{#if importErr}<span class="err">{importErr}</span>{/if}
			{:else}
				<div class="key-panel">
					<span class="key-addr">{ephemeral.address?.slice(0,6)}...{ephemeral.address?.slice(-4)}</span>
					{#if ephemeral.balance !== null}<span class="key-bal">{formatEther(ephemeral.balance).slice(0,6)} ETH</span>{/if}
					<button class="btn-sm" onclick={ephemeral.refreshBalance}>↻</button>
					<button class="btn-sm" onclick={() => showPk = !showPk}>{showPk ? '🙈' : '👁'}</button>
					{#if !ephemeral.hasFunds}<button class="btn-sm fund" disabled={ephemeral.isFunding} onclick={fundEphemeral}>{ephemeral.isFunding ? '...' : 'Fund'}</button>{/if}
					<button class="btn-cancel" onclick={ephemeral.clear}>x</button>
				</div>
				{#if showPk && ephemeral.wallet}<div class="pk-reveal">PK: {ephemeral.wallet.privateKey}</div>{/if}
			{/if}
		{/if}
	</div>
</header>

{@render children()}

<footer class="blobchan-footer">blobchan — posts stored on Sepolia via EIP-4844 blobs</footer>

<style>
	.header-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.btn, .btn-sm { background: #eee; border: 1px solid #aaa; padding: 1px 6px; font-family: arial,helvetica,sans-serif; font-size: 9pt; cursor: pointer; }
	.btn-cancel { background: none; border: none; color: #800000; cursor: pointer; font-size: 9pt; }
	.key-input { width: 180px; font-size: 9pt; }
	.key-panel { display: flex; align-items: center; gap: 4px; background: #ffe; border: 1px solid #d9bfb7; padding: 2px 6px; }
	.key-addr { font-family: monospace; font-size: 9pt; color: #800000; }
	.key-bal { color: #117743; font-weight: bold; font-size: 9pt; }
	.pk-reveal { background: #fff0e0; border: 1px solid #d9bfb7; padding: 2px 6px; font-family: monospace; font-size: 8pt; word-break: break-all; }
	.err { color: #c00; font-size: 9pt; }
	.fund { background: #34345c; color: #fff; }
	.nsfw-btn { background: #EA8; color: #800; font-weight: bold; border: 1px solid #800; padding: 2px 8px; font-family: arial,helvetica,sans-serif; font-size: 9pt; cursor: pointer; }
	.nsfw-btn:hover { background: #dd9977; }
</style>
