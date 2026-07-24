<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { account } from '$lib/wallet.svelte.ts';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="blobchan-header">
	<span class="blobchan-logo">blobchan</span>
	<div style="display:flex;align-items:center;gap:8px">
		<appkit-button></appkit-button>
		{#if account.current?.address}
			<span style="font-family:monospace;font-size:9pt;color:#800000">
				{account.current.address.slice(0, 6)}...{account.current.address.slice(-4)}
			</span>
		{/if}
	</div>
</header>

{@render children()}
