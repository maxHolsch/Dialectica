/** Duration of the frame-view back-exit animation (must match EXIT_MS in FrameView). */
export const FRAME_EXIT_MS = 200;

/**
 * Fired the instant the user initiates a back-navigation from a frame view.
 * Listeners should immediately hide any UI that would collide with the
 * frame-view header exit animation (e.g. the crux-canvas top-question header).
 */
export const FRAME_EXIT_EVENT = 'dialectica:frame-exit' as const;

/**
 * Fired when the back-navigation transition is complete and the frame overlay
 * has been removed. Listeners should fade their UI back in.
 */
export const FRAME_EXIT_DONE_EVENT = 'dialectica:frame-exit-done' as const;
