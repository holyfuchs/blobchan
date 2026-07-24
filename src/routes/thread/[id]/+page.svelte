<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getThread, type Post } from '$lib/dummy.svelte.ts';

	const id = $page.params.id;
	const thread = getThread(id);

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

	function findBacklinks(postId: string): Post[] {
		if (!thread) return [];
		return thread.replies.filter((r) => r.content.includes('>>' + postId.slice(2, 8)));
	}
</script>

<svelte:head><title>/blob/ - {thread?.op.subject || 'Thread'} - blobchan</title></svelte:head>

<div>
	{#if !thread}
		<div class="status-warn">Thread not found.</div>
	{:else}
		<div class="navLinks" style="margin:4px 0">
			[<a href="/" class="bold">▲ Back to /blob/</a>]
		</div>
		<hr />

		<div class="boardNavDesktop">
			[<a href="/">blob</a>]
		</div>
		<hr />

		<div class="thread" id="t{thread.op.id.slice(2, 8)}">
			<!-- OP -->
			<div class="postContainer opContainer" id="pc{thread.op.id.slice(2, 8)}">
				<div id="p{thread.op.id.slice(2, 8)}" class="post op">
					<span class="threadHideButton hand" style="color:#800000;margin-right:4px">&minus;</span>
					<div class="postInfo desktop" id="pi{thread.op.id.slice(2, 8)}">
						{#if thread.op.subject}
							<span class="subject">{thread.op.subject}</span>
						{/if}
						<span class="nameBlock"><span class="name">{thread.op.name}</span></span>
						<span class="dateTime">{fmtDate(thread.op.timestamp)}</span>
						&nbsp;
						<span class="postNum desktop">
							<a href="#p{thread.op.id.slice(2, 8)}">No.</a>
							<a href="#p{thread.op.id.slice(2, 8)}">{thread.op.id.slice(2, 8)}</a>
							&nbsp;<span>[<a class="replylink hand" href="/">Reply</a>]</span>
						</span>
						<button
							class="postMenuBtn"
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

			<!-- Replies -->
			{#each thread.replies as reply}
				<div class="postContainer replyContainer" id="pc{reply.id.slice(2, 8)}">
					<div class="sideArrows">&gt;&gt;</div>
					<div id="p{reply.id.slice(2, 8)}" class="post reply">
						<div class="postInfo desktop" id="pi{reply.id.slice(2, 8)}">
							<span class="nameBlock"><span class="name">{reply.name}</span></span>
							<span class="dateTime">{fmtDate(reply.timestamp)}</span>
							&nbsp;
							<span class="postNum desktop">
								<a href="#p{reply.id.slice(2, 8)}">No.</a>
								<a href="#p{reply.id.slice(2, 8)}">{reply.id.slice(2, 8)}</a>
							</span>
							<button
								class="postMenuBtn"
								style="background:none;border:none;color:#800000;cursor:pointer">▶</button
							>

							{#if findBacklinks(reply.id).length > 0}
								<div class="backlink" id="bl_{reply.id.slice(2, 8)}">
									{#each findBacklinks(reply.id) as bl}
										<span
											><a href="#p{bl.id.slice(2, 8)}" class="quotelink"
												>&gt;&gt;{bl.id.slice(2, 8)}</a
											>
										</span>
									{/each}
								</div>
							{/if}
						</div>
						<blockquote class="postMessage" id="m{reply.id.slice(2, 8)}">
							{#each reply.content.split('\n') as line}
								{@const isQuote = line.startsWith('>')}
								<span class={isQuote ? 'quote' : ''}>{line || '\u00A0'}{'\n'}</span>
							{/each}
						</blockquote>
					</div>
				</div>
			{/each}
		</div>

		<hr />

		<div class="boardNavDesktopFoot">
			[<a href="/">blob</a>] [<a href="/" class="bold">Back</a>]
		</div>
	{/if}
</div>

<div class="blobchan-footer" style="margin-top:20px">
	All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.
</div>
