export { detectAnvil, spawnAnvil, AnvilNotInstalledError } from "./anvil.js";
export type { AnvilProcess, AnvilSpawnOptions } from "./anvil.js";
export { deriveAccounts, DEFAULT_DEV_MNEMONIC, type DevAccount } from "./accounts.js";
export { startStorageMock, type StorageMockHandle } from "./storage-mock.js";
export {
  startComputeMock,
  type ComputeMockHandle,
  type ComputeMockMode,
} from "./compute-mock.js";
export { startDaMock, type DaMockHandle } from "./da-mock.js";
export {
  readState,
  writeState,
  clearState,
  type DevnetState,
  type DevnetService,
  type DevnetChainService,
} from "./state.js";
export { startDevnet, stopDevnet, isRunning } from "./orchestrator.js";
export type { DevnetHandle, DevnetStartOptions } from "./orchestrator.js";

export const VERSION = "0.1.0";
