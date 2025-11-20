/* tslint:disable */
/* eslint-disable */
export function encodeChange(change: any): Uint8Array;
export function decodeChange(change: Uint8Array): DecodedChange;
export function initSyncState(): SyncState;
export function importSyncState(state: any): SyncState;
export function exportSyncState(state: SyncState): JsSyncState;
export function encodeSyncMessage(message: any): SyncMessage;
export function decodeSyncMessage(msg: Uint8Array): DecodedSyncMessage;
export function encodeSyncState(state: SyncState): Uint8Array;
export function decodeSyncState(data: Uint8Array): SyncState;
export function readBundle(bundle: Uint8Array): any;

export type Actor = string;
export type ObjID = string;
export type Change = Uint8Array;
export type SyncMessage = Uint8Array;
export type Prop = string | number;
export type Hash = string;
export type Heads = Hash[];
export type ScalarValue = string | number | boolean | null | Date | Uint8Array;
export type Value = ScalarValue | object;
export type MaterializeValue =
  | { [key: string]: MaterializeValue }
  | Array<MaterializeValue>
  | Value;
export type MapObjType = { [key: string]: ObjType | Value };
export type ObjInfo = { id: ObjID; type: ObjTypeName; path?: Prop[] };
export type Span =
  | { type: "text"; value: string; marks?: MarkSet }
  | { type: "block"; value: { [key: string]: MaterializeValue } };
export type ListObjType = Array<ObjType | Value>;
export type ObjType = string | ListObjType | MapObjType;
export type FullValue =
  | ["str", string]
  | ["int", number]
  | ["uint", number]
  | ["f64", number]
  | ["boolean", boolean]
  | ["timestamp", Date]
  | ["counter", number]
  | ["bytes", Uint8Array]
  | ["null", null]
  | ["map", ObjID]
  | ["list", ObjID]
  | ["text", ObjID]
  | ["table", ObjID];

export type Cursor = string;
export type CursorPosition = number | "start" | "end";
export type MoveCursor = "before" | "after";

export type FullValueWithId =
  | ["str", string, ObjID]
  | ["int", number, ObjID]
  | ["uint", number, ObjID]
  | ["f64", number, ObjID]
  | ["boolean", boolean, ObjID]
  | ["timestamp", Date, ObjID]
  | ["counter", number, ObjID]
  | ["bytes", Uint8Array, ObjID]
  | ["null", null, ObjID]
  | ["map", ObjID]
  | ["list", ObjID]
  | ["text", ObjID]
  | ["table", ObjID];

export enum ObjTypeName {
  list = "list",
  map = "map",
  table = "table",
  text = "text",
}

export type Datatype =
  | "boolean"
  | "str"
  | "int"
  | "uint"
  | "f64"
  | "null"
  | "timestamp"
  | "counter"
  | "bytes"
  | "map"
  | "text"
  | "list";

export type SyncHave = {
  lastSync: Heads;
  bloom: Uint8Array;
};

export type DecodedSyncMessage = {
  heads: Heads;
  need: Heads;
  have: SyncHave[];
  changes: Change[];
};

export type DecodedChange = {
  actor: Actor;
  seq: number;
  startOp: number;
  time: number;
  message: string | null;
  deps: Heads;
  hash: Hash;
  ops: Op[];
};

export type ChangeMetadata = {
  actor: Actor;
  seq: number;
  startOp: number;
  maxOp: number;
  time: number;
  message: string | null;
  deps: Heads;
  hash: Hash;
};

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type ChangeToEncode = PartialBy<DecodedChange, "hash">;

export type Op = {
  action: string;
  obj: ObjID;
  key: string;
  value?: string | number | boolean;
  datatype?: string;
  pred: string[];
};

export type PatchValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Uint8Array
  | {}
  | [];
export type Patch =
  | PutPatch
  | DelPatch
  | SpliceTextPatch
  | IncPatch
  | InsertPatch
  | MarkPatch
  | UnmarkPatch
  | ConflictPatch;

export type PutPatch = {
  action: "put";
  path: Prop[];
  value: PatchValue;
  conflict?: boolean;
};

export interface MarkSet {
  [name: string]: ScalarValue;
}

export type MarkPatch = {
  action: "mark";
  path: Prop[];
  marks: Mark[];
};

export type MarkRange = {
  expand?: "before" | "after" | "both" | "none";
  start: number;
  end: number;
};

export type UnmarkPatch = {
  action: "unmark";
  path: Prop[];
  name: string;
  start: number;
  end: number;
};

export type IncPatch = {
  action: "inc";
  path: Prop[];
  value: number;
};

export type DelPatch = {
  action: "del";
  path: Prop[];
  length?: number;
};

export type SpliceTextPatch = {
  action: "splice";
  path: Prop[];
  value: string;
  marks?: MarkSet;
};

export type InsertPatch = {
  action: "insert";
  path: Prop[];
  values: PatchValue[];
  marks?: MarkSet;
  conflicts?: boolean[];
};

export type ConflictPatch = {
  action: "conflict";
  path: Prop[];
};

export type Mark = {
  name: string;
  value: ScalarValue;
  start: number;
  end: number;
};

// Some definitions can't be typed using the wasm_bindgen annotations
// (specifically optional function parameters) so we do that work here
// and merge this definition with the `class Automerge` definition
// which follows
interface Automerge {

    fork(actor?: string, heads?: Heads): Automerge;

    put(obj: ObjID, prop: Prop, value: Value, datatype?: Datatype): void;
    get(obj: ObjID, prop: Prop, heads?: Heads): Value | undefined;
    getWithType(obj: ObjID, prop: Prop, heads?: Heads): FullValue | null;
    getAll(obj: ObjID, arg: Prop, heads?: Heads): FullValueWithId[];

    keys(obj: ObjID, heads?: Heads): string[];
    text(obj: ObjID, heads?: Heads): string;
    spans(obj: ObjID, heads?: Heads): Span[];
    marks(obj: ObjID, heads?: Heads): Mark[];
    marksAt(obj: ObjID, index: number, heads?: Heads): MarkSet;
    length(obj: ObjID, heads?: Heads): number;

    objInfo(obj: ObjID, heads?: Heads): ObjInfo;

    materialize(obj?: ObjID, heads?: Heads, metadata?: unknown): MaterializeValue;

    push(obj: ObjID, value: Value, datatype?: Datatype): void;

    insert(obj: ObjID, index: number, value: Value, datatype?: Datatype): void;

    splice(
      obj: ObjID,
      start: number,
      delete_count: number,
      text?: string | Array<Value>,
    ): void;

    mark(
      obj: ObjID,
      range: MarkRange,
      name: string,
      value: Value,
      datatype?: Datatype,
    ): void;

    getCursor(
      obj: ObjID,
      position: CursorPosition,
      heads?: Heads,
      move?: MoveCursor,
    ): Cursor;

    applyPatches<Doc>(obj: Doc, meta?: unknown): Doc;

    applyAndReturnPatches<Doc>(
      obj: Doc,
      meta?: unknown,
    ): { value: Doc; patches: Patch[] };

    getBlock(obj: ObjID, index: number, heads?: Heads): { [key: string]: MaterializeValue } | null;

    getMissingDeps(heads?: Heads): Heads;

    getCursorPosition(obj: ObjID, cursor: Cursor, heads?: Heads): number;
}


export type LoadOptions = {
  actor?: Actor;
  unchecked?: boolean;
  allowMissingDeps?: boolean;
  convertImmutableStringsToText?: boolean;
};

export type InitOptions = {
  actor?: Actor;
};

export function create(options?: InitOptions): Automerge;
export function load(data: Uint8Array, options?: LoadOptions): Automerge;

export interface JsSyncState {
  sharedHeads: Heads;
  lastSentHeads: Heads;
  theirHeads: Heads | undefined;
  theirHeed: Heads | undefined;
  theirHave: SyncHave[] | undefined;
  sentHashes: Heads;
}

export interface DecodedBundle {
  changes: DecodedChange[];
  deps: Heads;
}

export interface API {
  create(options?: InitOptions): Automerge;
  load(data: Uint8Array, options?: LoadOptions): Automerge;
  encodeChange(change: ChangeToEncode): Change;
  decodeChange(change: Change): DecodedChange;
  initSyncState(): SyncState;
  encodeSyncMessage(message: DecodedSyncMessage): SyncMessage;
  decodeSyncMessage(msg: SyncMessage): DecodedSyncMessage;
  encodeSyncState(state: SyncState): Uint8Array;
  decodeSyncState(data: Uint8Array): SyncState;
  exportSyncState(state: SyncState): JsSyncState;
  importSyncState(state: JsSyncState): SyncState;
  readBundle(data: Uint8Array): DecodedBundle;
}

export interface Stats {
  numChanges: number;
  numOps: number;
  numActors: number;
  cargoPackageName: string;
  cargoPackageVersion: string;
  rustcVersion: string;
}

export type UpdateSpansConfig = {
    defaultExpand?: "before" | "after" | "both" | "none";
    perMarkExpand?: {[key: string]: "before" | "after" | "both" | "none" }
}


export class Automerge {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  static new(actor?: string | null): Automerge;
  clone(actor?: string | null): Automerge;
  pendingOps(): number;
  commit(message?: string | null, time?: number | null): Hash | null;
  merge(other: Automerge): Heads;
  rollback(): number;
  updateText(obj: ObjID, new_text: string): void;
  updateSpans(obj: ObjID, args: Span[], config: UpdateSpansConfig | undefined | null): void;
  pushObject(obj: ObjID, value: ObjType): ObjID;
  splitBlock(obj: ObjID, index: number, block: {[key: string]: MaterializeValue}): void;
  joinBlock(obj: ObjID, index: number): void;
  updateBlock(obj: ObjID, index: number, block: {[key: string]: MaterializeValue}): void;
  insertObject(obj: ObjID, index: number, value: ObjType): ObjID;
  putObject(obj: ObjID, prop: Prop, value: ObjType): ObjID;
  increment(obj: ObjID, prop: Prop, value: number): void;
  enableFreeze(enable: boolean): boolean;
  registerDatatype(datatype: string, construct: Function, deconstruct: (arg: any) => any | undefined): void;
  diffIncremental(): Patch[];
  updateDiffCursor(): void;
  resetDiffCursor(): void;
  diff(before: Heads, after: Heads): Patch[];
  isolate(heads: Heads): void;
  integrate(): void;
  delete(obj: ObjID, prop: Prop): void;
  save(): Uint8Array;
  saveIncremental(): Uint8Array;
  saveSince(heads: Heads): Uint8Array;
  saveNoCompress(): Uint8Array;
  saveAndVerify(): Uint8Array;
  loadIncremental(data: Uint8Array): number;
  applyChanges(changes: Change[]): void;
  getChanges(have_deps: Heads): Change[];
  getChangesMeta(have_deps: Heads): ChangeMetadata[];
  getChangeByHash(hash: Hash): Change | null;
  getChangeMetaByHash(hash: Hash): ChangeMetadata | null;
  getDecodedChangeByHash(hash: Hash): DecodedChange | null;
  getChangesAdded(other: Automerge): Change[];
  getHeads(): Heads;
  getActorId(): Actor;
  getLastLocalChange(): Change | null;
  dump(): void;
  receiveSyncMessage(state: SyncState, message: SyncMessage): void;
  generateSyncMessage(state: SyncState): SyncMessage | null;
  toJS(meta: any): MaterializeValue;
  emptyChange(message?: string | null, time?: number | null): Hash;
  unmark(obj: ObjID, range: MarkRange, name: string): void;
  hasOurChanges(state: SyncState): boolean;
  topoHistoryTraversal(): Hash[];
  stats(): Stats;
  saveBundle(hashes: any): Uint8Array;
}
export class SyncState {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  clone(): SyncState;
  readonly sharedHeads: Heads;
  lastSentHeads: Heads;
  set sentHashes(value: Heads);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_syncstate_free: (a: number, b: number) => void;
  readonly syncstate_sharedHeads: (a: number) => any;
  readonly syncstate_lastSentHeads: (a: number) => any;
  readonly syncstate_set_lastSentHeads: (a: number, b: any) => [number, number];
  readonly syncstate_set_sentHashes: (a: number, b: any) => [number, number];
  readonly syncstate_clone: (a: number) => number;
  readonly __wbg_automerge_free: (a: number, b: number) => void;
  readonly automerge_new: (a: number, b: number) => [number, number, number];
  readonly automerge_clone: (a: number, b: number, c: number) => [number, number, number];
  readonly automerge_fork: (a: number, b: number, c: number, d: any) => [number, number, number];
  readonly automerge_pendingOps: (a: number) => any;
  readonly automerge_commit: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly automerge_merge: (a: number, b: number) => [number, number, number];
  readonly automerge_rollback: (a: number) => number;
  readonly automerge_keys: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_text: (a: number, b: any, c: any) => [number, number, number, number];
  readonly automerge_spans: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_splice: (a: number, b: any, c: number, d: number, e: any) => [number, number];
  readonly automerge_updateText: (a: number, b: any, c: any) => [number, number];
  readonly automerge_updateSpans: (a: number, b: any, c: any, d: any) => [number, number];
  readonly automerge_push: (a: number, b: any, c: any, d: any) => [number, number];
  readonly automerge_pushObject: (a: number, b: any, c: any) => [number, number, number, number];
  readonly automerge_insert: (a: number, b: any, c: number, d: any, e: any) => [number, number];
  readonly automerge_splitBlock: (a: number, b: any, c: number, d: any) => [number, number];
  readonly automerge_joinBlock: (a: number, b: any, c: number) => [number, number];
  readonly automerge_updateBlock: (a: number, b: any, c: number, d: any) => [number, number];
  readonly automerge_getBlock: (a: number, b: any, c: number, d: any) => [number, number, number];
  readonly automerge_insertObject: (a: number, b: any, c: number, d: any) => [number, number, number, number];
  readonly automerge_put: (a: number, b: any, c: any, d: any, e: any) => [number, number];
  readonly automerge_putObject: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_increment: (a: number, b: any, c: any, d: any) => [number, number];
  readonly automerge_get: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_getWithType: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_objInfo: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_getAll: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_enableFreeze: (a: number, b: any) => [number, number, number];
  readonly automerge_registerDatatype: (a: number, b: any, c: any, d: any) => [number, number];
  readonly automerge_applyPatches: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_applyAndReturnPatches: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_diffIncremental: (a: number) => [number, number, number];
  readonly automerge_updateDiffCursor: (a: number) => void;
  readonly automerge_resetDiffCursor: (a: number) => void;
  readonly automerge_diff: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_isolate: (a: number, b: any) => [number, number];
  readonly automerge_integrate: (a: number) => void;
  readonly automerge_length: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_delete: (a: number, b: any, c: any) => [number, number];
  readonly automerge_save: (a: number) => any;
  readonly automerge_saveIncremental: (a: number) => any;
  readonly automerge_saveSince: (a: number, b: any) => [number, number, number];
  readonly automerge_saveNoCompress: (a: number) => any;
  readonly automerge_saveAndVerify: (a: number) => [number, number, number];
  readonly automerge_loadIncremental: (a: number, b: any) => [number, number, number];
  readonly automerge_applyChanges: (a: number, b: any) => [number, number];
  readonly automerge_getChanges: (a: number, b: any) => [number, number, number];
  readonly automerge_getChangesMeta: (a: number, b: any) => [number, number, number];
  readonly automerge_getChangeByHash: (a: number, b: any) => [number, number, number];
  readonly automerge_getChangeMetaByHash: (a: number, b: any) => [number, number, number];
  readonly automerge_getDecodedChangeByHash: (a: number, b: any) => [number, number, number];
  readonly automerge_getChangesAdded: (a: number, b: number) => any;
  readonly automerge_getHeads: (a: number) => any;
  readonly automerge_getActorId: (a: number) => [number, number];
  readonly automerge_getLastLocalChange: (a: number) => any;
  readonly automerge_dump: (a: number) => void;
  readonly automerge_getMissingDeps: (a: number, b: any) => [number, number, number];
  readonly automerge_receiveSyncMessage: (a: number, b: number, c: any) => [number, number];
  readonly automerge_generateSyncMessage: (a: number, b: number) => any;
  readonly automerge_toJS: (a: number, b: any) => [number, number, number];
  readonly automerge_materialize: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_getCursor: (a: number, b: any, c: any, d: any, e: any) => [number, number, number, number];
  readonly automerge_getCursorPosition: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly automerge_emptyChange: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly automerge_mark: (a: number, b: any, c: any, d: any, e: any, f: any) => [number, number];
  readonly automerge_unmark: (a: number, b: any, c: any, d: any) => [number, number];
  readonly automerge_marks: (a: number, b: any, c: any) => [number, number, number];
  readonly automerge_marksAt: (a: number, b: any, c: number, d: any) => [number, number, number];
  readonly automerge_hasOurChanges: (a: number, b: number) => number;
  readonly automerge_topoHistoryTraversal: (a: number) => any;
  readonly automerge_stats: (a: number) => any;
  readonly automerge_saveBundle: (a: number, b: any) => [number, number, number];
  readonly create: (a: any) => [number, number, number];
  readonly load: (a: any, b: any) => [number, number, number];
  readonly encodeChange: (a: any) => [number, number, number];
  readonly decodeChange: (a: any) => [number, number, number];
  readonly initSyncState: () => number;
  readonly importSyncState: (a: any) => [number, number, number];
  readonly exportSyncState: (a: number) => any;
  readonly encodeSyncMessage: (a: any) => [number, number, number];
  readonly decodeSyncMessage: (a: any) => [number, number, number];
  readonly encodeSyncState: (a: number) => any;
  readonly decodeSyncState: (a: any) => [number, number, number];
  readonly readBundle: (a: any) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
