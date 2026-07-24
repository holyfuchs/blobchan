<script lang="ts">
	import { account } from '$lib/wallet.svelte.ts';
</script>

<div class="container">
	{#if account.current}
		<p class="connected">✅ Connected: {account.current.address}</p>
	{:else}
		<p class="connect-hint">Connect your wallet to start posting.</p>
	{/if}
</div>

<style>
	.container {
		max-width: 600px;
		margin: 40px auto;
		text-align: center;
		font-family: arial, helvetica, sans-serif;
	}
	.connected {
		color: #117743;
		font-size: 11pt;
	}
	.connect-hint {
		color: #800000;
		font-size: 11pt;
	}
</style>
