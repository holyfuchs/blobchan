<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatEther } from 'viem';
	import { getPosts } from '$lib/posts.svelte.ts';
	import { ephemeral, fundEphemeral } from '$lib/store.svelte.ts';
	import { nsfw } from '$lib/nsfw.svelte.ts';
	import { createEphemeralClient } from '$lib/ephemeral';
	import { sendBlobPost, postHeaderBytes, POST_HEADER_LIMIT } from '$lib/blob';
	import { loadKZG } from '$lib/kzg';
	import { processImage, dataUrlMime } from '$lib/image';
	import { fmtDate, isoDatetime, formatCountdown, countdownSeverity } from '$lib/format';
	import { parseContent } from '$lib/content';
	import { clock } from '$lib/time.svelte.ts';
	import { getChain } from '$lib/config';
	import { loadDims, dataSize, formatSize, mimeExt } from '$lib/imageinfo.svelte.ts';

	let { chainId }: { chainId: string } = $props();
	let chain = $derived(getChain(chainId));
	let store = $derived(getPosts(chain));

	let threads = $derived(store.threads);
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
	function expiryLeft(ts: number): number { return ts + chain.blobExpirySeconds - Math.floor(clock.now / 1000); }
	function etherscanUrl(hash: string): string {
		const sub = chain.id === 'm' ? '' : 'sepolia.';
		return `https://${sub}etherscan.io/tx/${hash}`;
	}
	/** Format a post's actual tx cost (wei string) as "0.0001 ETH ($0.34)" for
	 *  display next to the post info. Returns empty string if no cost data. */
	function fmtTxCost(p: { id: string; txCost?: string }): string {
		if (!p.txCost) return '';
		const eth = formatEther(BigInt(p.txCost));
		const price = ephemeral.ethPriceUsd;
		if (price && price > 0) {
			return `$${(parseFloat(eth) * price).toFixed(2)}`;
		}
		return `${parseFloat(eth).toFixed(6).replace(/\.?0+$/, '')} ETH`;
	}

	async function handleFileChange(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]; if(!f)return; imageName=f.name; try{imageData=await processImage(f);}catch(e:any){postError='Image error: '+(e.message||'unknown');} }
	async function handlePost() {
		if(sending)return;
		if(!ephemeral.wallet){postError="Generate a posting key first.";return;}
		if(!content.trim()){postError="Write something first.";return;}
		const postObj={board:chain.id as const,threadId:'',subject:subject.trim()||undefined,name:name.trim()||'Anonymous',content:content.trim(),timestamp:Math.floor(Date.now()/1000),imageMime:imageData?dataUrlMime(imageData):undefined,imageName:imageData?imageName:undefined};
		const bytes=postHeaderBytes(postObj, !!imageData);
		if(bytes>POST_HEADER_LIMIT){postError=`Post too long (${bytes}/${POST_HEADER_LIMIT} bytes). Shorten your comment.`;return;}
		sending=true;postError='';postHash='';
		try{
			const kzg=await loadKZG();
			const client=createEphemeralClient(ephemeral.wallet, chain);
			const hash=await sendBlobPost({client,chain,kzg,imageDataUrl:imageData||undefined,post:postObj});
			postHash=hash;
			const c=content;const sb=subject;const n=name;const img=imageData;const imn=imageName;content='';subject='';imageData='';imageName='';
			store.addOptimistic({board:chain.id,threadId:hash.replace('0x',''),id:hash.replace('0x',''),subject:sb.trim()||undefined,name:n.trim()||'Anonymous',content:c.trim(),image:img||undefined,imageMime:img?dataUrlMime(img):undefined,imageName:img?imn:undefined,timestamp:Math.floor(Date.now()/1000)} as any);
		}catch(e:any){postError=e?.shortMessage||e?.message?.slice(0,200)||'Failed';}finally{sending=false;}
	}
	function openThread(id: string) { goto(`/${chain.id}/thread/${id}`); }
	let postCostWei = $derived(ephemeral.costEstimateFor(chain));
	let postCost = $derived(postCostWei !== null ? formatEther(postCostWei).slice(0, 8) : '...');
	let deficit = $derived(calcDeficit(postCostWei, ephemeral.balanceFor(chain)));
	let deficitEth = $derived(deficit > 0n ? formatEther(deficit).slice(0, 8) : '');
	let needFunds = $derived(deficit > 0n && ephemeral.wallet !== null);

	function calcDeficit(cost: bigint | null, balance: bigint | null): bigint {
		if (cost === null || balance === null || balance >= cost) return 0n;
		return cost - balance;
	}
</script>

<svelte:head><title>/{chain.id}/ - {chain.name} - blobchan</title></svelte:head>

<div>
	<div class="boardBanner"><div class="boardTitle">/{chain.id}/ - {chain.name}</div><div class="boardSubtitle">All posts live on-chain as EIP-4844 blobs on {chain.name}. Immutable until expiry. Only a fool would take anything posted here as fact.</div></div>
	<hr class="abovePostForm" />
	<div class="center" style="margin:8px 0">
		{#if !showForm}<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={() => showForm = true}>Start a New Thread</button>]</div>
		{:else}
			<table class="postForm" style="display:table"><tbody>
				<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={name} placeholder="Anonymous" tabindex="1"></td></tr>
				<tr data-type="Subject"><td>Subject</td><td><input name="sub" type="text" bind:value={subject} placeholder="(optional)" tabindex="3"><input type="submit" value={sending?"Sending...":"Post"} onclick={handlePost} disabled={sending} tabindex="10"><span class="post-cost">~{postCost} ETH</span>{#if needFunds}<button class="btn-sm fund" disabled={ephemeral.isFunding} onclick={() => fundEphemeral(chain, deficit)} title="Fund exactly ~{deficitEth} ETH so you can post">{ephemeral.isFunding ? '...' : 'Fund '+deficitEth}</button>{/if}</td></tr>
				<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" wrap="soft" bind:value={content} tabindex="4"></textarea></td></tr>
				<tr data-type="File"><td>File</td><td><input id="postFile" name="upfile" type="file" accept="image/*" onchange={handleFileChange} tabindex="8"></td></tr>
				{#if imageData}<tr><td></td><td><img src={imageData} alt="preview" style="max-width:200px;max-height:200px" /></td></tr>{/if}
				<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Images stored on-chain. Max ~122KB raw.</li></ul></td></tr>
			</tbody></table>
			{#if postError}<div class="status-error">{postError}</div>{/if}
			{#if postHash}<div class="status-success center">✓ Posted! <a href={etherscanUrl(postHash)} target="_blank" class="underline">View tx</a></div>{/if}
		{/if}
	</div>
	<div class="boardNavDesktop">[<a href="/{chain.id}">blob</a>]</div><hr />

	{#if store.isLoading && threads.length > 0}
		<div class="loading-bar">Loading more posts... {#if store.total > 0}{store.loaded}/{store.total}{/if}</div>
	{/if}

	<div class="board">
		{#if store.isLoading && threads.length === 0}<div class="empty-state">Loading posts from chain...{#if store.total > 0} ({store.loaded}/{store.total}){/if}</div>
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
								<span class="postNum desktop"><a href="/{chain.id}/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Link to this post">No.</a><a href="/{chain.id}/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Reply to this post">{thread.op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink" href="/{chain.id}/thread/{thread.op.id}">Reply</a>]</span></span>
								<span class="countdown {countdownSeverity(expiryLeft(thread.op.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(thread.op.timestamp))}">⏳ {formatCountdown(expiryLeft(thread.op.timestamp))}</span>
								{#if thread.op.txCost}<a href={etherscanUrl('0x'+thread.op.id)} target="_blank" class="tx-cost" title="Actual transaction cost">tx {fmtTxCost(thread.op)}</a>{/if}
							</div>
								<blockquote class="postMessage">{#each thread.op.content.split('\n') as line}{@const isQuote=line.startsWith('>')}{@const segs=parseContent(line)}<span class={isQuote?'quote':''}>{#each segs as seg}{#if seg.ref}<a class="quotelink" href="/{chain.id}/thread/{thread.op.id}#p{seg.ref}">{seg.text}</a>{:else}{seg.text||'\u00A0'}{/if}{/each}{'\n'}</span>{/each}</blockquote>
							{:else}
								<div class="postInfo desktop">
									{#if thread.op.subject}<span class="subject">{thread.op.subject} </span>{/if}
									<span class="nameBlock"><span class="name">{thread.op.name}</span></span> <span class="dateTime" data-utc={thread.op.timestamp}><time datetime={isoDatetime(thread.op.timestamp)}>{fmtDate(thread.op.timestamp)}</time></span>&nbsp;
									<span class="postNum desktop"><a href="/{chain.id}/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Link to this post">No.</a><a href="/{chain.id}/thread/{thread.op.id}?replyto={thread.op.id.slice(2,8)}" title="Reply to this post">{thread.op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink" href="/{chain.id}/thread/{thread.op.id}">Reply</a>]</span></span>
									<span class="countdown {countdownSeverity(expiryLeft(thread.op.timestamp))}" title="Blob expires in {formatCountdown(expiryLeft(thread.op.timestamp))}">⏳ {formatCountdown(expiryLeft(thread.op.timestamp))}</span>
									{#if thread.op.txCost}<a href={etherscanUrl('0x'+thread.op.id)} target="_blank" class="tx-cost" title="Actual transaction cost">tx {fmtTxCost(thread.op)}</a>{/if}
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
									<div class="postInfo desktop"><span class="nameBlock"><span class="name">{reply.name}</span></span> <span class="dateTime" data-utc={reply.timestamp}><time datetime={isoDatetime(reply.timestamp)}>{fmtDate(reply.timestamp)}</time></span>&nbsp;<span class="postNum desktop"><a href="/{chain.id}/thread/{thread.op.id}?replyto={reply.id.slice(2,8)}#p{reply.id.slice(2,8)}" title="Link to this post">No.</a><a href="/{chain.id}/thread/{thread.op.id}?replyto={reply.id.slice(2,8)}#p{reply.id.slice(2,8)}" title="Reply to this post">{reply.id.slice(2,8)}</a></span>{#if reply.txCost}<a href={etherscanUrl('0x'+reply.id)} target="_blank" class="tx-cost" title="Actual transaction cost">tx {fmtTxCost(reply)}</a>{/if}</div>
									<blockquote class="postMessage">{#each reply.content.split('\n') as line}{@const isQuote=line.startsWith('>')}{@const segs=parseContent(line)}<span class={isQuote?'quote':''}>{#each segs as seg}{#if seg.ref}<a class="quotelink" href="/{chain.id}/thread/{thread.op.id}#p{seg.ref}">{seg.text}</a>{:else}{seg.text||'\u00A0'}{/if}{/each}{'\n'}</span>{/each}</blockquote>
								</div>
							</div></div>
						{/each}
						{#if thread.replies.length>3}{@const omitted=thread.replies.length-3}{@const omittedImgs=thread.replies.slice(3).filter(r=>r.image).length}<span class="summary desktop">{omitted} repl{omitted===1?'y':'ies'}{omittedImgs>0 ? ` and ${omittedImgs} image${omittedImgs===1?'':'s'}` : ''} omitted. <a class="replylink" href="/{chain.id}/thread/{thread.op.id}">Click here</a> to view.</span>{:else}<span class="summary desktop"><a class="replylink" href="/{chain.id}/thread/{thread.op.id}">Click here</a> to view.</span>{/if}
					{/if}
				</div>
				<hr />
			{/each}
		{/if}
	</div>
	<hr /><div class="boardNavDesktopFoot">[<a href="/{chain.id}">blob</a>]</div><div class="pagelist"><strong><a href="/{chain.id}">{threads.length} thread{threads.length!==1?'s':''}</a></strong></div><br style="clear:both" />
</div>
<div class="blobchan-footer" style="margin-top:20px">All posts stored on {chain.name} via EIP-4844 blobs. Blobs expire after ~18 days.</div>
