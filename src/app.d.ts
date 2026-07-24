// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// AppKit custom element
declare module 'svelte/elements' {
	interface SvelteHTMLElements {
		'appkit-button': any;
	}
}

export {};
