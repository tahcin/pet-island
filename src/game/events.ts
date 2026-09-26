/** Tiny typed event bus so systems owned by different modules can react to each other. */
export interface GameEvents {
  /** The pet finished digging at a spot (30 percent become a collectible, PRD 9.4). */
  dug: { x: number; z: number };
  /** The player picked something up. */
  collected: { id: string; kind: string };
  /** A quest was turned in to villager index i. */
  questDone: { index: number; villager: string };
}

type Handler<T> = (payload: T) => void;
const handlers: { [K in keyof GameEvents]?: Handler<GameEvents[K]>[] } = {};

export function on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
  const list = (handlers[type] ??= []) as Handler<GameEvents[K]>[];
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

export function emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
  for (const fn of (handlers[type] ?? []) as Handler<GameEvents[K]>[]) fn(payload);
}
