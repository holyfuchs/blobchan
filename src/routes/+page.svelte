<script lang="ts">
	import { goto } from '$app/navigation';
	import { getThreads } from '$lib/dummy.svelte.ts';

	const threads = getThreads();

	function openThread(id: string) {
		goto(`/thread/${id}`);
	}

	function fmtDate(ts: number): string {
		const d = new Date(ts * 1000);
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return (
			d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) +
			`(${days[d.getDay()]})` +
			d.toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			})
		);
	}
</script>

<svelte:head><title>/blob/ - On-chain - blobchan</title></svelte:head>

<div>
	<div class="boardBanner">
		<div class="boardTitle">/blob/ - On-chain</div>
		<div class="boardSubtitle">
			All posts live on-chain as EIP-4844 blobs. Immutable until expiry. Only a fool would take
			anything posted here as fact.
		</div>
	</div>
	<hr class="abovePostForm" />

	<div class="boardNavDesktop">
		[<a href="/">blob</a>]
	</div>
	<hr />

	<div class="board">
		{#each threads as thread}
			<div class="thread" id="t{thread.op.id.slice(2, 8)}">
				<div class="postContainer opContainer" id="pc{thread.op.id.slice(2, 8)}">
					<div id="p{thread.op.id.slice(2, 8)}" class="post op">
						<span class="threadHideButton hand" style="color:#800000;margin-right:4px">&minus;</span
						>
						<div class="postInfo desktop" id="pi{thread.op.id.slice(2, 8)}">
							{#if thread.op.subject}
								<span class="subject">{thread.op.subject} </span>
							{/if}
							<span class="nameBlock"><span class="name">{thread.op.name}</span></span>
							<span class="dateTime">{fmtDate(thread.op.timestamp)}</span>
							&nbsp;
							<span class="postNum desktop">
								<a href="/thread/{thread.op.id}">No.</a>
								<a href="/thread/{thread.op.id}">{thread.op.id.slice(2, 8)}</a>
								&nbsp;<span
									>[<a class="replylink hand" href="/thread/{thread.op.id}">Reply</a>]</span
								>
							</span>
							<button
								class="postMenuBtn hand"
								style="background:none;border:none;color:#800000;cursor:pointer">▶</button
							>
						</div>
						<blockquote class="postMessage" id="m{thread.op.id.slice(2, 8)}">
							{#each thread.op.content.split('\n') as line}
								<span class={line.startsWith('>') ? 'quote' : ''}>{line || '\u00A0'}{'\n'}</span>
							{/each}
						</blockquote>
					</div>
				</div>

				{#each thread.replies.slice(0, 3) as reply}
					<div class="postContainer replyContainer" id="pc{reply.id.slice(2, 8)}">
						<div class="sideArrows">&gt;&gt;</div>
						<div id="p{reply.id.slice(2, 8)}" class="post reply">
							<div class="postInfo desktop" id="pi{reply.id.slice(2, 8)}">
								<span class="nameBlock"><span class="name">{reply.name}</span></span>
								<span class="dateTime">{fmtDate(reply.timestamp)}</span>
								&nbsp;
								<span class="postNum desktop">
									<a href="/thread/{thread.op.id}#p{reply.id.slice(2, 8)}">No.</a>
									<a href="/thread/{thread.op.id}#p{reply.id.slice(2, 8)}">{reply.id.slice(2, 8)}</a
									>
								</span>
								<button
									class="postMenuBtn hand"
									style="background:none;border:none;color:#800000;cursor:pointer">▶</button
								>
							</div>
							<blockquote class="postMessage">
								{#each reply.content.split('\n') as line}
									<span class={line.startsWith('>') ? 'quote' : ''}>{line || '\u00A0'}{'\n'}</span>
								{/each}
							</blockquote>
						</div>
					</div>
				{/each}

				{#if thread.replies.length > 3}
					<span class="summary desktop">
						{thread.replies.length - 3} repl{thread.replies.length - 3 === 1 ? 'y' : 'ies'} omitted.
						<a class="replylink hand" href="/thread/{thread.op.id}">Click here</a> to view.
					</span>
				{:else if thread.replies.length > 0}
					<span class="summary desktop">
						<a class="replylink hand" href="/thread/{thread.op.id}">Click here</a> to view all replies.
					</span>
				{/if}
			</div>
		{/each}
	</div>

	<hr />

	<div class="boardNavDesktopFoot">
		[<a href="/">blob</a>]
	</div>
	<div class="pagelist">
		<strong><a href="/">{threads.length} thread{threads.length !== 1 ? 's' : ''}</a></strong>
	</div>
	<br style="clear:both" />
</div>

<div class="blobchan-footer" style="margin-top:20px">
	All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.
</div>
