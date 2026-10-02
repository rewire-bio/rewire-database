import type fs from 'node:fs';
export const MIN_FREE_BYTES: number;
export const AFTER_DEPENDENCIES_FREE_BYTES: number;
export const UNUSED_TOOL_DIRECTORIES: readonly string[];
export const UNUSED_RUNNER_IMAGES: readonly string[];
export function prepareRunnerSpace(options?: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  files?: typeof fs;
  run?: (program: string, args: string[]) => string;
  log?: (message: string) => void;
  dryRun?: boolean;
  phase?: 'before-dependencies' | 'after-dependencies';
}): {
  dryRun: boolean;
  available: number;
  required: number;
  planned: string[];
  removed: string[];
  removedImages?: string[];
};
