import { createLocalStorageRepositories } from "./local-storage";
import type { Repositories } from "./types";

export type * from "./types";

let instance: Repositories | null = null;

/**
 * Single place that decides where data lives. To move to a backend, return
 * an API-backed implementation of `Repositories` here; nothing else changes.
 */
export function getRepositories(): Repositories {
  instance ??= createLocalStorageRepositories();
  return instance;
}
