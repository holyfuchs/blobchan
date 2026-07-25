<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { posts } from '$lib/posts.svelte.ts';
	import { ephemeral } from '$lib/store.svelte.ts';
	import { nsfw } from '$lib/nsfw.svelte.ts';
	import { createEphemeralClient } from '$lib/ephemeral';
	import { sendBlobPost, postHeaderBytes, POST_HEADER_LIMIT } from '$lib/blob';
	import { loadKZG } from '$lib/kzg';
	import { processImage, dataUrlMime } from '$lib/image';
	import { fmtDate, isoDatetime, formatCountdown, countdownSeverity } from '$lib/format';
	import { parseContent } from '$lib/content';
	import { clock } from '$lib/time.svelte.ts';
	import { BLOB_EXPIRY_SECONDS } from '$lib/config';
	import { loadDims, dataSize, formatSize, mimeExt } from '$lib/imageinfo.svelte.ts';
	import type { Post } from '$lib/types';

	const id = $page.params.id.replace('0x', '');
	let showReply = $state(false);
	let rname = $state('Anonymous');
	let rcontent = $state('');
	let rimageData = $state('');
	let rimageName = $state('');
	let rsending = $state(false);
	let rerror = $state('');
	let rhash = $state('');
	let unblurred = $state(new Set<string>());
	/** Currently hovered `>>HASH` reference, with cursor position for the
	 *  floating preview. Null when nothing is hovered. */
	let hover = $state<{ ref: string; x: number; y: number } | null>(null);

	function toggleBlur(url: string) { if(unblurred.has(url)) unblurred.delete(url); else unblurred.add(url); unblurred=new Set(unblurred); }
	function blurred(imgUrl: string) { return nsfw.on && !unblurred.has(imgUrl); }
	function getThread() { return posts.threads.find(t => t.op.id === id); }
	function findPostByShortId(shortId: string): Post | undefined {
		const t = getThread(); if (!t) return undefined;
		if (t.op.id.slice(2, 8) === shortId) return t.op;
		return t.replies.find(r => r.id.slice(2, 8) === shortId);
	}
	/** Seconds until this post's blob is pruned (negative once expired). */
	function expiryLeft(ts: number): number { return ts + BLOB_EXPIRY_SECONDS - Math.floor(clock.now / 1000); }

	/** Open the reply form (if needed) and append a `>>HASH` quote for the given
	 *  post. No-op if that exact quote is already in the comment. */
	function quotePost(shortId: string) {
		showReply = true;
		const tag = '>>' + shortId + ' ';
		if (!rcontent.includes('>>' + shortId)) {
			const sep = rcontent && !rcontent.endsWith(' ') && !rcontent.endsWith('\n') ? ' ' : '';
			rcontent = rcontent + sep + tag;
		}
	}

	/** Scroll a post into view and flash it briefly so the user can spot it. */
	function jumpTo(shortId: string) {
		const el = document.getElementById('p' + shortId);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			el.classList.add('highlight');
			setTimeout(() => el.classList.remove('highlight'), 1500);
		}
		hover = null;
	}

	function onRefEnter(ref: string, e: MouseEvent) { hover = { ref, x: e.clientX, y: e.clientY }; }
	function onRefMove(e: MouseEvent) { if (hover) hover = { ...hover, x: e.clientX, y: e.clientY }; }
	function onRefLeave() { hover = null; }
	function fileName(p: { id: string; imageName?: string; imageMime?: string }) { return p.imageName || ('blob' + p.id.slice(2,8) + '.' + mimeExt(p.imageMime)); }

	async function handleFileChange(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]; if(!f)return; rimageName=f.name; try{rimageData=await processImage(f);}catch(e:any){rerror='Image error: '+(e.message||'unknown');} }
	async function handleReply() {
		if(rsending)return;
		if(!ephemeral.wallet){rerror="Generate a posting key first.";return;}
		if(!rcontent.trim()){rerror="Write something first.";return;}
		const postObj={board:'blob' as const,threadId:id,name:rname.trim()||'Anonymous',content:rcontent.trim(),timestamp:Math.floor(Date.now()/1000),imageMime:rimageData?dataUrlMime(rimageData):undefined,imageName:rimageData?rimageName:undefined};
		const bytes=postHeaderBytes(postObj);
		if(bytes>POST_HEADER_LIMIT){rerror=`Post too long (${bytes}/${POST_HEADER_LIMIT} bytes). Shorten your comment.`;return;}
		rsending=true;rerror='';rhash='';
		try{
			const kzg=await loadKZG();
			const client=createEphemeralClient(ephemeral.wallet);
			const hash=await sendBlobPost({client,kzg,imageDataUrl:rimageData||undefined,post:postObj});
			rhash=hash;const c=rcontent;const img=rimageData;const imn=rimageName;rcontent='';rimageData='';rimageName='';
			posts.addOptimistic({board:'blob',threadId:id,id:hash.replace('0x',''),name:rname.trim()||'Anonymous',content:c.trim(),image:img||undefined,imageMime:img?dataUrlMime(img):undefined,imageName:img?imn:undefined,timestamp:Math.floor(Date.now()/1000)} as any);
		}catch(e:any){rerror=e?.shortMessage||e?.message?.slice(0,200)||'Failed';}finally{rsending=false;}
	}
	function findBacklinks(pid: string): Post[] { const t=getThread();if(!t)return[];return t.replies.filter(r=>r.content.toLowerCase().includes('>>'+pid.slice(2,8).toLowerCase())); }

	// Deep-link from the board view: `/thread/<id>?replyto=<shortId>` opens the
	// reply form with `>>shortId` prefilled and scrolls to that post.
	onMount(() => {
		const replyto = $page.url.searchParams.get('replyto');
		if (replyto) {
			quotePost(replyto);
			setTimeout(() => jumpTo(replyto), 150);
		}
	});
</script>

<svelte:head><title>/blob/ - {getThread()?.op.subject||'Thread'} - blobchan</title></svelte:head>

{#snippet postMessage(content: string)}
	<blockquote class="postMessage">
		{#each content.split('\n') as line}
			{@const isQuote = line.startsWith('>')}
			{@const segs = parseContent(line)}
			<span class={isQuote ? 'quote' : ''}>
				{#each segs as seg}
					{#if seg.ref}
							<a href="#p{seg.ref}" class="quotelink"
								onclick={(e) => { e.preventDefault(); jumpTo(seg.ref!); }}
								onmouseenter={(e) => onRefEnter(seg.ref!, e)}
								onmousemove={onRefMove}
								onmouseleave={onRefLeave}>{seg.text}</a>
					{:else}
						{seg.text || '\u00A0'}
					{/if}
				{/each}
				{'\n'}
			</span>
		{/each}
	</blockquote>
{/snippet}

<div>
	{#if !getThread()}<div class="status-warn">Thread not found or loading...</div>
	{:else}
		<div class="navLinks" style="margin:4px 0">[<a href="/" class="bold">▲ Back to /blob/</a>]</div><hr />
		<div class="boardNavDesktop">[<a href="/">blob</a>]</div><hr />
		<div class="center" style="margin:8px 0">
			{#if !showReply}<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={()=>showReply=true}>Reply to Thread</button>]</div>
			{:else}
				<table class="postForm" style="display:table"><tbody>
					<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={rname} placeholder="Anonymous" tabindex="1"></td></tr>
					<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" wrap="soft" bind:value={rcontent} tabindex="4"></textarea><input type="submit" value={rsending?"Sending...":"Post"} onclick={handleReply} disabled={rsending} tabindex="10"></td></tr>
					<tr data-type="File"><td>File</td><td><input id="postFile" name="upfile" type="file" accept="image/*" onchange={handleFileChange} tabindex="8"></td></tr>
					{#if rimageData}<tr><td></td><td><img src={rimageData} alt="preview" style="max-width:200px;max-height:200px" /></td></tr>{/if}
					<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Posts stored on-chain in EIP-4844 blobs (Sepolia testnet).</li></ul></td></tr>
				</tbody></table>
				{#if rerror}<div class="status-error">{rerror}</div>{/if}
				{#if rhash}<div class="status-success center">✓ Posted! <a href="https://sepolia.etherscan.io/tx/{rhash}" target="_blank" class="underline">View tx</a></div>{/if}
			{/if}
		</div><hr />
		<div class="thread">
			<div class="postContainer opContainer"><div class="post op" id="p{getThread().op.id.slice(2,8)}">
				<span class="threadHideButton" title="Hide post">&minus;</span>
				{#if getThread().op.image}
					{@const d = loadDims(getThread().op.image)}
					<div class="file">
						<div class="fileText">File: <a href={getThread().op.image} target="_blank">{fileName(getThread().op)}</a> ({formatSize(dataSize(getThread().op.image))}{#if d}, {d.w}x{d.h}{/if})</div>
						<a class="fileThumb"><img src={getThread().op.image} alt="post image" style="max-width:200px;max-height:200px;cursor:pointer;{blurred(getThread().op.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(getThread().op.image)} loading="lazy" /></a>
					</div>
				{/if}
				<div class="postInfo desktop">
					{#if getThread().op.subject}<span class="subject">{getThread().op.subject}</span>{/if}
					<span class="nameBlock"><span class="name">{getThread().op.name}</span></span> <span class="dateTime" data-utc={getThread().op.timestamp}><time datetime={isoDatetime(getThread().op.timestamp)}>{fmtDate(getThread().op.timestamp)}</time></span>&nbsp;
					<span class="postNum desktop"><a href="#p{getThread().op.id.slice(2,8)}" title="Link to this post" onclick={(e) => { e.preventDefault(); quotePost(getThread().op.id.slice(2,8)); }}>No.</a><a href="#p{getThread().op.id.slice(2,8)}" title="Reply to this post" onclick={(e) => { e.preventDefault(); quotePost(getThread().op.id.slice(2,8)); }}>{getThread().op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink" href="#p{getThread().op.id.slice(2,8)}" onclick={(e) => { e.preventDefault(); quotePost(getThread().op.id.slice(2,8)); }}>Reply</a>]</span></span>
					<span class="countdown {countdownSeverity(expiryLeft(getThread().op.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(getThread().op.timestamp))}">⏳ {formatCountdown(expiryLeft(getThread().op.timestamp))}</span>
					<a href="#" class="postMenuBtn" title="Post menu">▶</a>
				</div>
				{@render postMessage(getThread().op.content)}
			</div></div>
			{#each getThread().replies as reply}
				<div class="postContainer replyContainer"><div class="sideArrows">&gt;&gt;</div><div class="post reply" id="p{reply.id.slice(2,8)}">
					{#if reply.image}
						{@const d = loadDims(reply.image)}
						<div class="fileText">File: <a href={reply.image} target="_blank">{fileName(reply)}</a> ({formatSize(dataSize(reply.image))}{#if d}, {d.w}x{d.h}{/if})</div>
						<a class="fileThumb"><img src={reply.image} alt="reply image" style="max-width:150px;max-height:150px;cursor:pointer;{blurred(reply.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(reply.image)} loading="lazy" /></a>
					{/if}
					<div class="replyBody">
						<div class="postInfo desktop"><span class="nameBlock"><span class="name">{reply.name}</span></span> <span class="dateTime" data-utc={reply.timestamp}><time datetime={isoDatetime(reply.timestamp)}>{fmtDate(reply.timestamp)}</time></span>&nbsp;<span class="postNum desktop"><a href="#p{reply.id.slice(2,8)}" title="Link to this post" onclick={(e) => { e.preventDefault(); quotePost(reply.id.slice(2,8)); }}>No.</a><a href="#p{reply.id.slice(2,8)}" title="Reply to this post" onclick={(e) => { e.preventDefault(); quotePost(reply.id.slice(2,8)); }}>{reply.id.slice(2,8)}</a></span><span class="countdown {countdownSeverity(expiryLeft(reply.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(reply.timestamp))}">⏳ {formatCountdown(expiryLeft(reply.timestamp))}</span><a href="#" class="postMenuBtn" title="Post menu">▶</a>
							{#if findBacklinks(reply.id).length>0}<div class="backlink">{#each findBacklinks(reply.id) as bl}<span><a href="#p{bl.id.slice(2,8)}" class="quotelink" onclick={(e) => { e.preventDefault(); jumpTo(bl.id.slice(2,8)); }}>&gt;&gt;{bl.id.slice(2,8)}</a> </span>{/each}</div>{/if}
						</div>
						{@render postMessage(reply.content)}
					</div>
				</div></div>
			{/each}
		</div><hr />
		<div class="boardNavDesktopFoot">[<a href="/">blob</a>] [<a href="/" class="bold">Back</a>]</div>
	{/if}
</div>

{#if hover}
	{@const p = findPostByShortId(hover.ref)}
	{#if p}
		<div class="post-preview" style="left:{hover.x + 14}px; top:{hover.y + 14}px">
			<div class="postInfo"><span class="nameBlock"><span class="name">{p.name}</span></span> <span class="postNum">No.{p.id.slice(2,8)}</span></div>
			{#if p.image}<img src={p.image} alt="" style="max-width:240px;max-height:180px" />{/if}
			<blockquote class="postMessage">{p.content.slice(0, 600)}{#if p.content.length > 600}…{/if}</blockquote>
		</div>
	{/if}
{/if}

<div class="blobchan-footer" style="margin-top:20px">All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.</div>
