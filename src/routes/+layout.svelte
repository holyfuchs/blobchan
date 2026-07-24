<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { account } from '$lib/wallet.svelte.ts';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header>
	<span class="logo">blobchan</span>
	<div class="wallet-area">
		<appkit-button></appkit-button>
		{#if account.current?.address}
			<span class="addr"
				>{account.current.address.slice(0, 6)}...{account.current.address.slice(-4)}</span
			>
		{/if}
	</div>
</header>

{@render children()}

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background: #f0e0d6;
		border-bottom: 1px solid #d9bfb7;
	}
	.logo {
		font-family: Tahoma, sans-serif;
		font-size: 20px;
		font-weight: bold;
		color: #af0a0f;
	}
	.wallet-area {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.addr {
		font-family: monospace;
		font-size: 10pt;
		color: #800000;
	}
</style>
