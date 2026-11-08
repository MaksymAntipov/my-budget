// Push subscriptions heal themselves: iOS drops or replaces a web-push subscription without telling the app
// (system update, reinstall, long idle). The server kept pushing to the dead address and the menu still said
// «увімкнено». On every login the app compares what it enabled with what the browser holds now.

/**
 * @param {{ stored: string, permission: string, current: string }} state
 *   stored — endpoint this profile enabled on this device ('' = never); permission — Notification.permission;
 *   current — endpoint the browser holds now ('' = none).
 * @returns {'none' | 'forget' | 'resubscribe' | 'update'}
 */
export function pushSyncAction({ stored, permission, current }) {
    if (!stored) return 'none';
    if (permission !== 'granted') return 'forget';
    if (!current) return 'resubscribe';
    return current === stored ? 'none' : 'update';
}
