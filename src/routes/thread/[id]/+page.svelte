﻿<script lang="ts">
	import { page } from '$app/stores';
	import { posts } from '$lib/posts.svelte.ts';
	import { ephemeral } from '$lib/store.svelte.ts';
	import { createEphemeralClient } from '$lib/ephemeral';
	import { sendBlobPost } from '$lib/blob';
	import { loadKZG } from '$lib/kzg';
	import type { Post } from '$lib/types';

	const id = $page.params.id.replace('0x', '');

	let showReply = $state(false);
	let rname = $state('Anonymous');
	let rcontent = $state('');
	let rimageData = $state('');
	let rsending = $state(false);
	let rerror = $state('');
	let rhash = $state('');

	function getThread() { return posts.threads.find(t => t.op.id === id); }

	async function processImage(file: File): Promise<string> {
		if (file.size < 60000) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => reject(new Error('Failed'));
				reader.readAsDataURL(file);
			});
		}
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const c = document.createElement('canvas');
				const maxW = 600; let w = img.width, h = img.height;
				if (w > maxW) { h = h * maxW / w; w = maxW; }
				c.width = w; c.height = h;
				c.getContext('2d')!.drawImage(img, 0, 0, w, h);
				let q = 0.6; let url = c.toDataURL('image/webp', q);
				while (url.length > 120000 && q > 0.15) { q -= 0.1; url = c.toDataURL('image/webp', q); }
				resolve(url);
			};
			img.onerror = () => reject(new Error('Failed'));
			img.src = URL.createObjectURL(file);
		});
	}

	async function handleFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try { rimageData = await processImage(file); }
		catch (err: any) { rerror = 'Image error: ' + (err.message || 'unknown'); }
	}

	async function handleReply() {
		if (rsending) return;
		if (!ephemeral.wallet) { rerror = "Generate a posting key first."; return; }
		if (!rcontent.trim()) { rerror = "Write something first."; return; }
		rsending = true; rerror = ''; rhash = '';
		try {
			const kzg = await loadKZG();
			const client = createEphemeralClient(ephemeral.wallet);
			const hash = await sendBlobPost({
				client, kzg,
				imageDataUrl: rimageData || undefined,
				post: { board: 'blob', threadId: id, name: rname.trim() || 'Anonymous',
					content: rcontent.trim(), timestamp: Math.floor(Date.now() / 1000) },
			});
			rhash = hash;
			const c = rcontent; const img = rimageData;
			rcontent = ''; rimageData = '';
			posts.addOptimistic({ board: 'blob', threadId: id, id: hash.replace('0x',''),
				name: rname.trim() || 'Anonymous', content: c.trim(),
				image: img || undefined, timestamp: Math.floor(Date.now() / 1000) } as any);
		} catch (e: any) { rerror = e?.shortMessage || e?.message?.slice(0,200) || 'Failed'; }
		finally { rsending = false; }
	}

	function findBacklinks(postId: string): Post[] {
		const t = getThread(); if (!t) return [];
		return t.replies.filter(r => r.content.includes('>>' + postId.slice(2,8)));
	}

	function fmtDate(ts: number) {
		const d = new Date(ts * 1000);
		const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
		return d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'})
			+ '(' + days[d.getDay()] + ')' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
	}
</script>

<svelte:head><title>/blob/ - {getThread()?.op.subject || 'Thread'} - blobchan</title></svelte:head>

<div>
	{#if !getThread()}
		<div class="status-warn">Thread not found or loading...</div>
	{:else}
		<div class="navLinks" style="margin:4px 0">[<a href="/" class="bold">▲ Back to /blob/</a>]</div>
		<hr />
		<div class="boardNavDesktop">[<a href="/">blob</a>]</div>
		<hr />

		<div class="center" style="margin:8px 0">
			{#if !showReply}
				<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={() => showReply = true}>Reply to Thread</button>]</div>
			{:else}
				<div id="togglePostFormLink" class="desktop" style="margin-bottom:4px">[<button class="hand toggle-link" onclick={() => showReply = false}>- Hide Reply Form -</button>]</div>
				<table class="postForm" style="display:table"><tbody>
					<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={rname} placeholder="Anonymous"></td></tr>
					<tr data-type="File"><td>File</td><td><input id="postFile" name="upfile" type="file" accept="image/*" onchange={handleFileChange}></td></tr>
					<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" bind:value={rcontent}></textarea><input type="submit" value={rsending ? "Sending..." : "Post"} onclick={handleReply} disabled={rsending}></td></tr>
					{#if rimageData}<tr><td></td><td><img src={rimageData} alt="preview" style="max-width:200px;max-height:200px" /></td></tr>{/if}
					<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Posts stored on-chain in EIP-4844 blobs (Sepolia testnet).</li></ul></td></tr>
				</tbody></table>
				{#if rerror}<div class="status-error">{rerror}</div>{/if}
				{#if rhash}<div class="status-success center">✓ Posted! <a href="https://sepolia.etherscan.io/tx/{rhash}" target="_blank" class="underline">View tx</a></div>{/if}
			{/if}
		</div>
		<hr />

		<div class="thread">
			<div class="postContainer opContainer">
				<div class="post op">
					<span class="threadHideButton hand" style="color:#800000;margin-right:4px">&minus;</span>
					<div class="postInfo desktop">
						{#if getThread().op.subject}<span class="subject">{getThread().op.subject}</span>{/if}
						<span class="nameBlock"><span class="name">{getThread().op.name}</span></span>
						<span class="dateTime">{fmtDate(getThread().op.timestamp)}</span>&nbsp;
						<span class="postNum desktop">
							<a href="#p{getThread().op.id.slice(2,8)}">No.</a>
							<a href="#p{getThread().op.id.slice(2,8)}">{getThread().op.id.slice(2,8)}</a>
							&nbsp;<span>[<a class="replylink hand" href="/">Reply</a>]</span>
						</span>
						<button class="postMenuBtn" style="background:none;border:none;color:#800000;cursor:pointer">▶</button>
					</div>
					{#if getThread().op.image}
						<div class="file"><a class="fileThumb" href={getThread().op.image} target="_blank"><img src={getThread().op.image} alt="post image" style="max-width:200px;max-height:200px" loading="lazy" /></a></div>
					{/if}
					<blockquote class="postMessage">
						{#each getThread().op.content.split('\n') as line}
							<span class={line.startsWith('>')?'quote':''}>{line||'\u00A0'}{'\n'}</span>
						{/each}
					</blockquote>
				</div>
			</div>
			{#each getThread().replies as reply}
				<div class="postContainer replyContainer">
					<div class="sideArrows">&gt;&gt;</div>
					<div class="post reply">
						<div class="postInfo desktop">
							<span class="nameBlock"><span class="name">{reply.name}</span></span>
							<span class="dateTime">{fmtDate(reply.timestamp)}</span>&nbsp;
							<span class="postNum desktop">
								<a href="#p{reply.id.slice(2,8)}">No.</a>
								<a href="#p{reply.id.slice(2,8)}">{reply.id.slice(2,8)}</a>
							</span>
							<button class="postMenuBtn" style="background:none;border:none;color:#800000;cursor:pointer">▶</button>
							{#if findBacklinks(reply.id).length > 0}
								<div class="backlink">
									{#each findBacklinks(reply.id) as bl}
										<span><a href="#p{bl.id.slice(2,8)}" class="quotelink">&gt;&gt;{bl.id.slice(2,8)}</a> </span>
									{/each}
								</div>
							{/if}
						</div>
						{#if reply.image}
							<div class="file"><a class="fileThumb" href={reply.image} target="_blank"><img src={reply.image} alt="reply image" style="max-width:150px;max-height:150px" loading="lazy" /></a></div>
						{/if}
						<blockquote class="postMessage">
							{#each reply.content.split('\n') as line}
								{@const isQuote = line.startsWith('>')}
								<span class={isQuote?'quote':''}>{line||'\u00A0'}{'\n'}</span>
							{/each}
						</blockquote>
					</div>
				</div>
			{/each}
		</div>
		<hr />
		<div class="boardNavDesktopFoot">[<a href="/">blob</a>] [<a href="/" class="bold">Back</a>]</div>
	{/if}
</div>
<div class="blobchan-footer" style="margin-top:20px">All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.</div>
