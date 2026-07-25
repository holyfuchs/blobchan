<script lang="ts">
	// Pure static landing page — no client state needed. The wallet header and
	// footer come from the layout. The board list lives below the announcement
	// box, linking to each board route.
</script>

<svelte:head><title>blobchan — on-chain imageboard</title></svelte:head>

<div class="landing">
	<div class="logo-wrap">
		<img src="/image/logo.png" alt="blobchan" class="logo" />
	</div>

	<div class="box-outer">
		<div class="box-inner">
			<div class="boxbar"><h2>What is blobchan?</h2></div>
			<div class="boxcontent">
				<p>blobchan is a fully decentralized image board. Every thread and reply is a 128 KB <strong>EIP-4844 blob transaction</strong> on Ethereum — there is no server, no database, no moderator. Posts live directly on-chain as blob data, immutable until the blobs expire.</p>
				<br />
				<p>You connect with WalletConnect, generate a burner posting key, fund it with testnet ETH, and start posting. Images are packed into the blob alongside the post JSON, compressed to ~122 KB. Posts are publicly readable by anyone.</p>
				<br />
				<p>Be aware: blobs are pruned from beacon nodes after ~18 days, so posts eventually become unreadable from the chain. Only a fool would take anything posted here as fact.</p>
			</div>
		</div>
	</div>

	<div class="boards">
		<h2>Boards</h2>
		<ul class="board-list">
			<li><a href="/sep" class="board-link">/sep/ <span class="board-desc">Sepolia testnet</span></a></li>
		</ul>
	</div>
</div>

<style>
	.landing {
		max-width: 720px;
		margin: 0 auto;
		padding: 24px 16px 40px;
	}
	.logo-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 24px;
	}
	.logo {
		max-width: 420px;
		max-height: 200px;
		width: auto;
		height: auto;
	}

	.box-outer {
		margin: 16px 0;
	}
	.box-inner {
		background: #f0e0d6;
		border: 1px solid #d9bfb7;
	}
	.boxbar {
		background: #EA8;
		color: #800;
		font-weight: bold;
		border-bottom: 1px solid #800;
		padding: 2px 8px;
	}
	.boxbar h2 {
		margin: 0;
		font-size: 11pt;
		font-family: arial, helvetica, sans-serif;
	}
	.boxcontent {
		padding: 8px 12px;
		font-size: 10pt;
		color: #800000;
		line-height: 1.5;
	}
	.boxcontent p {
		margin: 0;
	}
	.boxcontent strong {
		color: #cc1105;
	}

	.boards {
		margin-top: 32px;
		text-align: center;
	}
	.boards h2 {
		font-family: Tahoma, sans-serif;
		font-size: 20px;
		font-weight: bold;
		color: #800000;
		margin: 0 0 12px;
		letter-spacing: -1px;
	}
	.board-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: inline-block;
		text-align: left;
	}
	.board-list li {
		margin: 4px 0;
	}
	.board-link {
		font-size: 14pt;
		font-weight: bold;
		color: #0000ee;
		text-decoration: none;
	}
	.board-link:hover {
		color: #ff0000 !important;
	}
	.board-desc {
		font-weight: normal;
		font-size: 10pt;
		color: #707070;
		margin-left: 6px;
	}
</style>
