export { ATTR, type AttrKey } from "./attributes.js";
export {
  instrument0g,
  disinstrument0g,
  type InstrumentConfig,
  type InstrumentMode,
  type InstrumentTargets,
  type ExporterConfig,
} from "./instrument.js";
export {
  appendSpanRecord,
  defaultTraceDir,
  isSinkEnabled,
  listTraceFiles,
  pathForTrace,
  readTraceFile,
  summarizeTrace,
  type TraceFileEntry,
  type TraceFileSummary,
  type TraceRecord,
} from "./trace-sink.js";
