<script lang="ts">
	import { goto } from '$app/navigation';
	import { posts } from '$lib/posts.svelte.ts';
	import { ephemeral } from '$lib/store.svelte.ts';
	import { nsfw } from '$lib/nsfw.svelte.ts';
	import { createEphemeralClient } from '$lib/ephemeral';
	import { sendBlobPost, postHeaderBytes, POST_HEADER_LIMIT } from '$lib/blob';
	import { loadKZG } from '$lib/kzg';

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

	function toggleBlur(url: string) { if(unblurred.has(url)) unblurred.delete(url); else unblurred.add(url); unblurred = new Set(unblurred); }
	function blurred(imgUrl: string) { return nsfw.on && !unblurred.has(imgUrl); }

	async function processImage(file: File): Promise<string> {
		if (file.size < 60000) {
			return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(new Error('Failed')); r.readAsDataURL(file); });
		}
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => { const c=document.createElement('canvas'); const maxW=600; let w=img.width,h=img.height; if(w>maxW){h=h*maxW/w;w=maxW;} c.width=w;c.height=h; c.getContext('2d')!.drawImage(img,0,0,w,h); let q=0.6; let u=c.toDataURL('image/webp',q); while(u.length>120000&&q>0.15){q-=0.1;u=c.toDataURL('image/webp',q);} resolve(u); };
			img.onerror = () => reject(new Error('Failed'));
			img.src = URL.createObjectURL(file);
		});
	}
	async function handleFileChange(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]; if(!f)return; try{imageData=await processImage(f);}catch(e:any){postError='Image error: '+(e.message||'unknown');} }
	async function handlePost() {
		if(sending)return;
		if(!ephemeral.wallet){postError="Generate a posting key first.";return;}
		if(!content.trim()){postError="Write something first.";return;}
		const postObj={board:'blob' as const,threadId:'',subject:subject.trim()||undefined,name:name.trim()||'Anonymous',content:content.trim(),timestamp:Math.floor(Date.now()/1000)};
		const bytes=postHeaderBytes(postObj);
		if(bytes>POST_HEADER_LIMIT){postError=`Post too long (${bytes}/${POST_HEADER_LIMIT} bytes). Shorten your comment.`;return;}
		sending=true;postError='';postHash='';
	try{
			const kzg=await loadKZG();
			const client=createEphemeralClient(ephemeral.wallet);
			const hash=await sendBlobPost({client,kzg,imageDataUrl:imageData||undefined,post:postObj});
			postHash=hash;
			const c=content;const sb=subject;const n=name;const img=imageData;content='';subject='';imageData='';
			posts.addOptimistic({board:'blob',threadId:hash.replace('0x',''),id:hash.replace('0x',''),subject:sb.trim()||undefined,name:n.trim()||'Anonymous',content:c.trim(),image:img||undefined,timestamp:Math.floor(Date.now()/1000)} as any);
		}catch(e:any){postError=e?.shortMessage||e?.message?.slice(0,200)||'Failed';}finally{sending=false;}
	}
	function openThread(id: string) { goto('/thread/'+id); }
	function fmtDate(ts:number){const d=new Date(ts*1000);const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];return d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'})+'('+days[d.getDay()]+')'+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
</script>

<svelte:head><title>/blob/ - On-chain - blobchan</title></svelte:head>

<div>
	<div class="boardBanner"><div class="boardTitle">/blob/ - On-chain</div><div class="boardSubtitle">All posts live on-chain as EIP-4844 blobs. Immutable until expiry. Only a fool would take anything posted here as fact.</div></div>
	<hr class="abovePostForm" />
	<div class="center" style="margin:8px 0">
		{#if !showForm}<div id="togglePostFormLink" class="desktop">[<button class="hand toggle-link" onclick={() => showForm = true}>Start a New Thread</button>]</div>
		{:else}
			<div id="togglePostFormLink" class="desktop" style="margin-bottom:4px">[<button class="hand toggle-link" onclick={() => showForm = false}>- Hide Post Form -</button>]</div>
			<table class="postForm" style="display:table"><tbody>
				<tr data-type="Name"><td>Name</td><td><input name="name" type="text" bind:value={name} placeholder="Anonymous"></td></tr>
				<tr data-type="File"><td>File</td><td><input id="postFile" name="upfile" type="file" accept="image/*" onchange={handleFileChange}></td></tr>
				<tr data-type="Subject"><td>Subject</td><td><input name="sub" type="text" bind:value={subject} placeholder="(optional)"><input type="submit" value={sending?"Sending...":"Post"} onclick={handlePost} disabled={sending}></td></tr>
				<tr data-type="Comment"><td>Comment</td><td><textarea name="com" cols="48" rows="4" bind:value={content}></textarea></td></tr>
				{#if imageData}<tr><td></td><td><img src={imageData} alt="preview" style="max-width:200px;max-height:200px" /></td></tr>{/if}
				<tr class="rules"><td colspan="2"><ul class="rules" style="margin:0;padding:0;margin-top:5px"><li style="list-style:none;font-size:11px">Images stored on-chain. Max ~60KB raw.</li></ul></td></tr>
			</tbody></table>
			{#if postError}<div class="status-error">{postError}</div>{/if}
			{#if postHash}<div class="status-success center">✓ Posted! <a href="https://sepolia.etherscan.io/tx/{postHash}" target="_blank" class="underline">View tx</a></div>{/if}
		{/if}
	</div>
	<div class="boardNavDesktop">[<a href="/">blob</a>]</div><hr />

	<div class="board">
		{#if posts.loading && threads.length === 0}<div class="empty-state">Loading posts from chain...</div>
		{:else if threads.length === 0}<div class="empty-state">No threads yet.</div>
		{:else}
			{#each threads as thread}
				<div class="thread" id="t{thread.op.id.slice(2,8)}">
					<div class="postContainer opContainer"><div class="post op">
						<span class="threadHideButton hand" style="color:#800000;margin-right:4px">&minus;</span>
						<div class="postInfo desktop">
							{#if thread.op.subject}<span class="subject">{thread.op.subject} </span>{/if}
							<span class="nameBlock"><span class="name">{thread.op.name}</span></span><span class="dateTime">{fmtDate(thread.op.timestamp)}</span>&nbsp;
							<span class="postNum desktop"><a href="/thread/{thread.op.id}">No.</a><a href="/thread/{thread.op.id}">{thread.op.id.slice(2,8)}</a>&nbsp;<span>[<a class="replylink hand" href="/thread/{thread.op.id}">Reply</a>]</span></span>
						</div>
						{#if thread.op.image}
							<div class="file"><a class="fileThumb"><img src={thread.op.image} alt="post image" style="max-width:200px;max-height:200px;cursor:pointer;{blurred(thread.op.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(thread.op.image)} loading="lazy" /></a></div>
						{/if}
						<blockquote class="postMessage">{#each thread.op.content.split('\n') as line}<span class={line.startsWith('>')?'quote':''}>{line||'\u00A0'}{'\n'}</span>{/each}</blockquote>
					</div></div>
					{#each thread.replies.slice(0,3) as reply}
						<div class="postContainer replyContainer"><div class="sideArrows">&gt;&gt;</div><div class="post reply">
							<div class="postInfo desktop"><span class="nameBlock"><span class="name">{reply.name}</span></span><span class="dateTime">{fmtDate(reply.timestamp)}</span>&nbsp;<span class="postNum desktop"><a href="/thread/{thread.op.id}#p{reply.id.slice(2,8)}">No.</a><a href="/thread/{thread.op.id}#p{reply.id.slice(2,8)}">{reply.id.slice(2,8)}</a></span></div>
							{#if reply.image}
								<div class="file"><a class="fileThumb"><img src={reply.image} alt="reply image" style="max-width:125px;max-height:125px;cursor:pointer;{blurred(reply.image)?'filter:blur(25px)':''}" onclick={()=>toggleBlur(reply.image)} loading="lazy" /></a></div>
							{/if}
							<blockquote class="postMessage">{#each reply.content.split('\n') as line}<span class={line.startsWith('>')?'quote':''}>{line||'\u00A0'}{'\n'}</span>{/each}</blockquote>
						</div></div>
					{/each}
					{#if thread.replies.length>3}<span class="summary desktop">{thread.replies.length-3} repl{thread.replies.length-3===1?'y':'ies'} omitted. <a class="replylink hand" href="/thread/{thread.op.id}">Click here</a> to view.</span>{:else if thread.replies.length>0}<span class="summary desktop"><a class="replylink hand" href="/thread/{thread.op.id}">Click here</a> to view all replies.</span>{/if}
				</div>
			{/each}
		{/if}
	</div>
	<hr /><div class="boardNavDesktopFoot">[<a href="/">blob</a>]</div><div class="pagelist"><strong><a href="/">{threads.length} thread{threads.length!==1?'s':''}</a></strong></div><br style="clear:both" />
</div>
<div class="blobchan-footer" style="margin-top:20px">All posts stored on Sepolia via EIP-4844 blobs. Blobs expire after ~18 days.</div>
