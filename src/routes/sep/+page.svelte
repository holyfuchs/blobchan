<script lang="ts">
	import { goto } from '$app/navigation';
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

	let threads = $derived(posts.threads);
	let showForm = $state(false);
	let name = $state('Anonymous');
	let subject = $state('');
	let content = $state('');
	let imageData = $state('');
	let sending = $state(false);
	let postError = $state('');
	let postHash = $state('');
	let unblurred = $state(new Set<string>());
	let collapsed = $state(new Set<string>());
	let imageName = $state('');

	function toggleBlur(url: string) { if(unblurred.has(url)) unblurred.delete(url); else unblurred.add(url); unblurred = new Set(unblurred); }
	function blurred(imgUrl: string) { return nsfw.on && !unblurred.has(imgUrl); }
	function toggleCollapse(tid: string) { if(collapsed.has(tid)) collapsed.delete(tid); else collapsed.add(tid); collapsed = new Set(collapsed); }
	function isCollapsed(tid: string) { return collapsed.has(tid); }
	function fileName(p: { id: string; imageName?: string; imageMime?: string }) { return p.imageName || ('blob' + p.id.slice(2,8) + '.' + mimeExt(p.imageMime)); }
	/** Seconds until this post's blob is pruned (negative once expired). */
	function expiryLeft(ts: number): number { return ts + BLOB_EXPIRY_SECONDS - Math.floor(clock.now / 1000); }

	async function handleFileChange(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]; if(!f)return; imageName=f.name; try{imageData=await processImage(f);}catch(e:any){postError='Image error: '+(e.message||'unknown');} }
	async function handlePost() {
		if(sending)return;
		if(!ephemeral.wallet){postError="Generate a posting key first.";return;}
		if(!content.trim()){postError="Write something first.";return;}
		const postObj={board:'blob' as const,threadId:'',subject:subject.trim()||undefined,name:name.trim()||'Anonymous',content:content.trim(),timestamp:Math.floor(Date.now()/1000),imageMime:imageData?dataUrlMime(imageData):undefined,imageName:imageData?imageName:undefined};
		const bytes=postHeaderBytes(postObj);
		if(bytes>POST_HEADER_LIMIT){postError=`Post too long (${bytes}/${POST_HEADER_LIMIT} bytes). Shorten your comment.`;return;}
		sending=true;postError='';postHash='';
	try{
			const kzg=await loadKZG();
			const client=createEphemeralClient(ephemeral.wallet);
			const hash=await sendBlobPost({client,kzg,imageDataUrl:imageData||undefined,post:postObj});
			postHash=hash;
			const c=content;const sb=subject;const n=name;const img=imageData;const imn=imageName;content='';subject='';imageData='';imageName='';
			posts.addOptimistic({board:'blob',threadId:hash.replace('0x',''),id:hash.replace('0x',''),subject:sb.trim()||undefined,name:n.trim()||'Anonymous',content:c.trim(),image:img||undefined,imageMime:img?dataUrlMime(img):undefined,imageName:img?imn:undefined,timestamp:Math.floor(Date.now()/1000)} as any);
		}catch(e:any){postError=e?.shortMessage||e?.message?.slice(0,200)||'Failed';}finally{sending=false;}
	}
	function openThread(id: string) { goto('/sep/thread/'+id); }
</script>

<svelte:head><title>/sep/ - Sepolia - blobchan</title></svelte:head>

<div>
	<div class="boardBanner"><div class="boardTitle">/sep/ - Sepolia</div><div class="boardSubtitle">All posts live on-chain as EIP-4844 blobs on Sepolia testnet. Immutable until expiry. Only a fool would take anything posted here as fact.</div></div>
	<hr class="abovePostForm" />
	<div class="center" style="margin:8px 0">
		{#if !showForm}<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={() => showForm = true}>Start a New Thread</button>]</div>
		{:else}
			<table class="postForm" style="display:table"><tbody>
				<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={name} placeholder="Anonymous" tabindex="1"></td></tr>
				<tr data-type="Subject"><td>Subject</td><td><input name="sub" type="text" bind:value={subject} placeholder="(optional)" tabindex="3"><input type="submit" value={sending?"Sending...":"Post"} onclick={handlePost} disabled={sending} tabindex="10"></td></tr>
				<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" wrap="soft" bind:value={content} tabindex="4"></textarea></td></tr>
				<tr data-type="File"><td>File</td><td><input id="postFile" name="upfile" type="file" accept="image/*" onchange={handleFileChange} tabindex="8"></td></tr>
				{#if imageData}<tr><td></td><td><img src={imageData} alt="preview" style="max-width:200px;max-height:200px" /></td></tr>{/if}
				<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Images stored on-chain. Max ~60KB raw.</li></ul></td></tr>
			</tbody></table>
			{#if postError}<div class="status-error">{postError}</div>{/if}
			{#if postHash}<div class="status-success center">✓ Posted! <a href="https://sepolia.etherscan.io/tx/{postHash}" target="_blank" class="underline">View tx</a></div>{/if}
		{/if}
	</div>
	<div class="boardNavDesktop">[<a href="/sep">blob</a>]</div><hr />

	<div class="board">
		{#if posts.loading && threads.length === 0}<div class="empty-state">Loading posts from chain...</div>
		{:else if threads.length === 0}<div class="empty-state">No threads yet.</div>
		{:else}
			{#each threads as thread}
				<div class="thread" id="t{thread.op.id.slice(2,8)}">
					<div class="postContainer opContainer"><div class="post op">
						<span class="threadHideButton" onclick={() => toggleCollapse(thread.op.id)} title="Hide thread">{isCollapsed(thread.op.id) ? '+' : '−'}</span>
						{#if !isCollapsed(thread.op.id)}
							{#if thread.op.image}
								{@const d = loadDims(thread.op.image)}
								<div class="file">
									<div class="fileText">File: <a href={thread.op.image} target="_blank">{fileName(thread.op)}</a> ({formatSize(dataSize(thread.op.image))}{#if d}, {d.w}x{d.h}{/if})</div>
									<a class="fileThumb"><img src={thread.op.image} alt="post image" style="max-width:200px;max-height:200px;cursor:pointer;{blurred(thread.op.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(thread.op.image)} loading="lazy" /></a>
								</div>
							{/if}
							<div class="postInfo desktop">
								{#if thread.op.subject}<span class="subject">{thread.op.subject} </span>{/if}
								<span class="nameBlock"><span class="name">{thread.op.name}</span></span> <span class="dateTime" data-utc={thread.op.timestamp}><time datetime={isoDatetime(thread.op.timestamp)}>{fmtDate(thread.op.timestamp)}</time></span>&nbsp;
								<span class="postNum desktop"><a href="/sep/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Link to this post">No.</a><a href="/sep/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Reply to this post">{thread.op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink" href="/sep/thread/{thread.op.id}">Reply</a>]</span></span>
								<span class="countdown {countdownSeverity(expiryLeft(thread.op.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(thread.op.timestamp))}">⏳ {formatCountdown(expiryLeft(thread.op.timestamp))}</span>
							</div>
							<blockquote class="postMessage">{#each thread.op.content.split('\n') as line}{@const isQuote=line.startsWith('>')}{@const segs=parseContent(line)}<span class={isQuote?'quote':''}>{#each segs as seg}{#if seg.ref}<a class="quotelink" href="/sep/thread/{thread.op.id}#p{seg.ref}">{seg.text}</a>{:else}{seg.text||'\u00A0'}{/if}{/each}{'\n'}</span>{/each}</blockquote>
						{:else}
							<div class="postInfo desktop">
								{#if thread.op.subject}<span class="subject">{thread.op.subject} </span>{/if}
								<span class="nameBlock"><span class="name">{thread.op.name}</span></span> <span class="dateTime" data-utc={thread.op.timestamp}><time datetime={isoDatetime(thread.op.timestamp)}>{fmtDate(thread.op.timestamp)}</time></span>&nbsp;
								<span class="postNum desktop"><a href="/sep/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Link to this post">No.</a><a href="/sep/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Reply to this post">{thread.op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink" href="/sep/thread/{thread.op.id}">Reply</a>]</span></span>
								<span class="countdown {countdownSeverity(expiryLeft(thread.op.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(thread.op.timestamp))}">⏳ {formatCountdown(expiryLeft(thread.op.timestamp))}</span>
							</div>
						{/if}
					</div></div>
					{#if !isCollapsed(thread.op.id)}
						{#each thread.replies.slice(0,3) as reply}
							<div class="postContainer replyContainer"><div class="sideArrows">&gt;&gt;</div><div class="post reply">
								{#if reply.image}
									{@const d = loadDims(reply.image)}
									<div class="fileText">File: <a href={reply.image} target="_blank">{fileName(reply)}</a> ({formatSize(dataSize(reply.image))}{#if d}, {d.w}x{d.h}{/if})</div>
									<a class="fileThumb"><img src={reply.image} alt="reply image" style="max-width:125px;max-height:125px;cursor:pointer;{blurred(reply.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(reply.image)} loading="lazy" /></a>
								{/if}
								<div class="replyBody">
									<div class="postInfo desktop"><span class="nameBlock"><span class="name">{reply.name}</span></span> <span class="dateTime" data-utc={reply.timestamp}><time datetime={isoDatetime(reply.timestamp)}>{fmtDate(reply.timestamp)}</time></span>&nbsp;<span class="postNum desktop"><a href="/sep/thread/{thread.op.id}?replyto={reply.id.slice(2,8)}#p{reply.id.slice(2,8)}" title="Link to this post">No.</a><a href="/sep/thread/{thread.op.id}?replyto={reply.id.slice(2,8)}#p{reply.id.slice(2,8)}" title="Reply to this post">{reply.id.slice(2,8)}</a></span></div>
									<blockquote class="postMessage">{#each reply.content.split('\n') as line}{@const isQuote=line.startsWith('>')}{@const segs=parseContent(line)}<span class={isQuote?'quote':''}>{#each segs as seg}{#if seg.ref}<a class="quotelink" href="/sep/thread/{thread.op.id}#p{seg.ref}">{seg.text}</a>{:else}{seg.text||'\u00A0'}{/if}{/each}{'\n'}</span>{/each}</blockquote>
								</div>
							</div></div>
						{/each}
						{#if thread.replies.length>3}{@const omitted=thread.replies.length-3}{@const omittedImgs=thread.replies.slice(3).filter(r=>r.image).length}<span class="summary desktop">{omitted} repl{omitted===1?'y':'ies'}{omittedImgs>0 ? ` and ${omittedImgs} image${omittedImgs===1?'':'s'}` : ''} omitted. <a class="replylink" href="/sep/thread/{thread.op.id}">Click here</a> to view.</span>{:else}<span class="summary desktop"><a class="replylink" href="/sep/thread/{thread.op.id}">Click here</a> to view.</span>{/if}
					{/if}
				</div>
				<hr />
			{/each}
		{/if}
	</div>
	<hr /><div class="boardNavDesktopFoot">[<a href="/sep">blob</a>]</div><div class="pagelist"><strong><a href="/sep">{threads.length} thread{threads.length!==1?'s':''}</a></strong></div><br style="clear:both" />
</div>
<div class="blobchan-footer" style="margin-top:20px">All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.</div>
