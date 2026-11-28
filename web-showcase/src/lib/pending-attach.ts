/** Files chosen outside the chat view (GitHub browser, etc.). The composer drains this on mount and whenever it changes. */
export interface PendingAttach {
  name: string;
  text: string;
}
let queue: PendingAttach[] = [];
const subs = new Set<() => void>();
export function queueAttachment(a: PendingAttach) {
  queue = [...queue, a];
  subs.forEach((f) => f());
}
export function drainAttachments(): PendingAttach[] {
  const q = queue;
  queue = [];
  return q;
}
export function onAttachQueued(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
