<script lang="ts">
	import { goto } from '$app/navigation';
	import { getThreads } from '$lib/dummy.svelte.ts';
	import { ephemeral } from '$lib/store.svelte.ts';
	import { createEphemeralClient } from '$lib/ephemeral';
	import { sendBlobPost } from '$lib/blob';
	import { loadKZG } from '$lib/kzg';

	const threads = getThreads();

	let showForm = $state(false);
	let name = $state('Anonymous');
	let subject = $state('');
	let content = $state('');
	let sending = $state(false);
	let postError = $state('');
	let postHash = $state('');

	async function handlePost() {
		if (!ephemeral.wallet || !content.trim() || sending) return;
		sending = true; postError = ''; postHash = '';
		try {
			const kzg = await loadKZG();
			const client = createEphemeralClient(ephemeral.wallet);
			const hash = await sendBlobPost({
				client, kzg,
				post: {
					board: 'blob', threadId: '',
					subject: subject.trim() || undefined,
					name: name.trim() || 'Anonymous',
					content: content.trim(),
					timestamp: Math.floor(Date.now() / 1000),
				},
			});
			postHash = hash; content = ''; subject = '';
		} catch (e: any) { postError = e?.shortMessage || e?.message?.slice(0, 200) || 'Failed'; }
		finally { sending = false; }
	}

	function openThread(id: string) { goto(`/thread/${id}`); }

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

			<!-- Post form (4chan style) -->
			<div class="center" style="margin:8px 0">
				{#if !showForm}
					<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={() => showForm = true}>Start a New Thread</button>]</div>
				{:else}
					<div id="togglePostFormLink" class="desktop" style="margin-bottom:4px">[<button class="hand toggle-link" onclick={() => showForm = false}>- Hide Post Form -</button>]</div>
					<table class="postForm" id="postForm" style="display:table">
						<tbody>
							<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={name} placeholder="Anonymous"></td></tr>
							<tr data-type="Options"><td>Options</td><td><input name="email" type="text" placeholder=""></td></tr>
							<tr data-type="Subject"><td>Subject</td><td><input name="sub" type="text" bind:value={subject} placeholder="(optional)"><input type="submit" value="Post" onclick={handlePost} disabled={sending}></td></tr>
							<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" bind:value={content}></textarea></td></tr>
							<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Posts are stored on-chain in EIP-4844 blobs (Sepolia testnet).</li></ul></td></tr>
						</tbody>
					</table>
					{#if postError}<div class="status-error">{postError}</div>{/if}
					{#if postHash}<div class="status-success center">✓ Posted! <a href="https://sepolia.etherscan.io/tx/{postHash}" target="_blank" class="underline">View tx</a></div>{/if}
				{/if}
			</div>

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
