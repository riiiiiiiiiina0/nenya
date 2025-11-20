let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_4.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_4.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}
/**
 * @param {any} options
 * @returns {Automerge}
 */
export function create(options) {
    const ret = wasm.create(options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Automerge.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} data
 * @param {any} options
 * @returns {Automerge}
 */
export function load(data, options) {
    const ret = wasm.load(data, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Automerge.__wrap(ret[0]);
}

/**
 * @param {any} change
 * @returns {Uint8Array}
 */
export function encodeChange(change) {
    const ret = wasm.encodeChange(change);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Uint8Array} change
 * @returns {DecodedChange}
 */
export function decodeChange(change) {
    const ret = wasm.decodeChange(change);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @returns {SyncState}
 */
export function initSyncState() {
    const ret = wasm.initSyncState();
    return SyncState.__wrap(ret);
}

/**
 * @param {any} state
 * @returns {SyncState}
 */
export function importSyncState(state) {
    const ret = wasm.importSyncState(state);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return SyncState.__wrap(ret[0]);
}

/**
 * @param {SyncState} state
 * @returns {JsSyncState}
 */
export function exportSyncState(state) {
    _assertClass(state, SyncState);
    const ret = wasm.exportSyncState(state.__wbg_ptr);
    return ret;
}

/**
 * @param {any} message
 * @returns {SyncMessage}
 */
export function encodeSyncMessage(message) {
    const ret = wasm.encodeSyncMessage(message);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Uint8Array} msg
 * @returns {DecodedSyncMessage}
 */
export function decodeSyncMessage(msg) {
    const ret = wasm.decodeSyncMessage(msg);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {SyncState} state
 * @returns {Uint8Array}
 */
export function encodeSyncState(state) {
    _assertClass(state, SyncState);
    const ret = wasm.encodeSyncState(state.__wbg_ptr);
    return ret;
}

/**
 * @param {Uint8Array} data
 * @returns {SyncState}
 */
export function decodeSyncState(data) {
    const ret = wasm.decodeSyncState(data);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return SyncState.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} bundle
 * @returns {any}
 */
export function readBundle(bundle) {
    const ret = wasm.readBundle(bundle);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

const AutomergeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_automerge_free(ptr >>> 0, 1));

export class Automerge {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Automerge.prototype);
        obj.__wbg_ptr = ptr;
        AutomergeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AutomergeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_automerge_free(ptr, 0);
    }
    /**
     * @param {string | null} [actor]
     * @returns {Automerge}
     */
    static new(actor) {
        var ptr0 = isLikeNone(actor) ? 0 : passStringToWasm0(actor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.automerge_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Automerge.__wrap(ret[0]);
    }
    /**
     * @param {string | null} [actor]
     * @returns {Automerge}
     */
    clone(actor) {
        var ptr0 = isLikeNone(actor) ? 0 : passStringToWasm0(actor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.automerge_clone(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Automerge.__wrap(ret[0]);
    }
    /**
     * @param {string | null | undefined} actor
     * @param {any} heads
     * @returns {Automerge}
     */
    fork(actor, heads) {
        var ptr0 = isLikeNone(actor) ? 0 : passStringToWasm0(actor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.automerge_fork(this.__wbg_ptr, ptr0, len0, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Automerge.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    pendingOps() {
        const ret = wasm.automerge_pendingOps(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string | null} [message]
     * @param {number | null} [time]
     * @returns {Hash | null}
     */
    commit(message, time) {
        var ptr0 = isLikeNone(message) ? 0 : passStringToWasm0(message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.automerge_commit(this.__wbg_ptr, ptr0, len0, !isLikeNone(time), isLikeNone(time) ? 0 : time);
        return ret;
    }
    /**
     * @param {Automerge} other
     * @returns {Heads}
     */
    merge(other) {
        _assertClass(other, Automerge);
        const ret = wasm.automerge_merge(this.__wbg_ptr, other.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {number}
     */
    rollback() {
        const ret = wasm.automerge_rollback(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {Array<any>}
     */
    keys(obj, heads) {
        const ret = wasm.automerge_keys(this.__wbg_ptr, obj, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {string}
     */
    text(obj, heads) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.automerge_text(this.__wbg_ptr, obj, heads);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {Array<any>}
     */
    spans(obj, heads) {
        const ret = wasm.automerge_spans(this.__wbg_ptr, obj, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {number} start
     * @param {number} delete_count
     * @param {any} text
     */
    splice(obj, start, delete_count, text) {
        const ret = wasm.automerge_splice(this.__wbg_ptr, obj, start, delete_count, text);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {string} new_text
     */
    updateText(obj, new_text) {
        const ret = wasm.automerge_updateText(this.__wbg_ptr, obj, new_text);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {Span[]} args
     * @param {UpdateSpansConfig | undefined | null} config
     */
    updateSpans(obj, args, config) {
        const ret = wasm.automerge_updateSpans(this.__wbg_ptr, obj, args, config);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} obj
     * @param {any} value
     * @param {any} datatype
     */
    push(obj, value, datatype) {
        const ret = wasm.automerge_push(this.__wbg_ptr, obj, value, datatype);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {ObjType} value
     * @returns {ObjID}
     */
    pushObject(obj, value) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.automerge_pushObject(this.__wbg_ptr, obj, value);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {any} obj
     * @param {number} index
     * @param {any} value
     * @param {any} datatype
     */
    insert(obj, index, value, datatype) {
        const ret = wasm.automerge_insert(this.__wbg_ptr, obj, index, value, datatype);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {number} index
     * @param {{[key: string]: MaterializeValue}} block
     */
    splitBlock(obj, index, block) {
        const ret = wasm.automerge_splitBlock(this.__wbg_ptr, obj, index, block);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {number} index
     */
    joinBlock(obj, index) {
        const ret = wasm.automerge_joinBlock(this.__wbg_ptr, obj, index);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {number} index
     * @param {{[key: string]: MaterializeValue}} block
     */
    updateBlock(obj, index, block) {
        const ret = wasm.automerge_updateBlock(this.__wbg_ptr, obj, index, block);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} text
     * @param {number} index
     * @param {any} heads
     * @returns {any}
     */
    getBlock(text, index, heads) {
        const ret = wasm.automerge_getBlock(this.__wbg_ptr, text, index, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {ObjID} obj
     * @param {number} index
     * @param {ObjType} value
     * @returns {ObjID}
     */
    insertObject(obj, index, value) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.automerge_insertObject(this.__wbg_ptr, obj, index, value);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {any} obj
     * @param {any} prop
     * @param {any} value
     * @param {any} datatype
     */
    put(obj, prop, value, datatype) {
        const ret = wasm.automerge_put(this.__wbg_ptr, obj, prop, value, datatype);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {Prop} prop
     * @param {ObjType} value
     * @returns {ObjID}
     */
    putObject(obj, prop, value) {
        const ret = wasm.automerge_putObject(this.__wbg_ptr, obj, prop, value);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {ObjID} obj
     * @param {Prop} prop
     * @param {number} value
     */
    increment(obj, prop, value) {
        const ret = wasm.automerge_increment(this.__wbg_ptr, obj, prop, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} obj
     * @param {any} prop
     * @param {any} heads
     * @returns {any}
     */
    get(obj, prop, heads) {
        const ret = wasm.automerge_get(this.__wbg_ptr, obj, prop, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} prop
     * @param {any} heads
     * @returns {any}
     */
    getWithType(obj, prop, heads) {
        const ret = wasm.automerge_getWithType(this.__wbg_ptr, obj, prop, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {object}
     */
    objInfo(obj, heads) {
        const ret = wasm.automerge_objInfo(this.__wbg_ptr, obj, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} arg
     * @param {any} heads
     * @returns {Array<any>}
     */
    getAll(obj, arg, heads) {
        const ret = wasm.automerge_getAll(this.__wbg_ptr, obj, arg, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {boolean} enable
     * @returns {boolean}
     */
    enableFreeze(enable) {
        const ret = wasm.automerge_enableFreeze(this.__wbg_ptr, enable);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * @param {string} datatype
     * @param {Function} construct
     * @param {(arg: any) => any | undefined} deconstruct
     */
    registerDatatype(datatype, construct, deconstruct) {
        const ret = wasm.automerge_registerDatatype(this.__wbg_ptr, datatype, construct, deconstruct);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} object
     * @param {any} meta
     * @returns {any}
     */
    applyPatches(object, meta) {
        const ret = wasm.automerge_applyPatches(this.__wbg_ptr, object, meta);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} object
     * @param {any} meta
     * @returns {any}
     */
    applyAndReturnPatches(object, meta) {
        const ret = wasm.automerge_applyAndReturnPatches(this.__wbg_ptr, object, meta);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Patch[]}
     */
    diffIncremental() {
        const ret = wasm.automerge_diffIncremental(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    updateDiffCursor() {
        wasm.automerge_updateDiffCursor(this.__wbg_ptr);
    }
    resetDiffCursor() {
        wasm.automerge_resetDiffCursor(this.__wbg_ptr);
    }
    /**
     * @param {Heads} before
     * @param {Heads} after
     * @returns {Patch[]}
     */
    diff(before, after) {
        const ret = wasm.automerge_diff(this.__wbg_ptr, before, after);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Heads} heads
     */
    isolate(heads) {
        const ret = wasm.automerge_isolate(this.__wbg_ptr, heads);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    integrate() {
        wasm.automerge_integrate(this.__wbg_ptr);
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {number}
     */
    length(obj, heads) {
        const ret = wasm.automerge_length(this.__wbg_ptr, obj, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {ObjID} obj
     * @param {Prop} prop
     */
    delete(obj, prop) {
        const ret = wasm.automerge_delete(this.__wbg_ptr, obj, prop);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    save() {
        const ret = wasm.automerge_save(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    saveIncremental() {
        const ret = wasm.automerge_saveIncremental(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Heads} heads
     * @returns {Uint8Array}
     */
    saveSince(heads) {
        const ret = wasm.automerge_saveSince(this.__wbg_ptr, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {Uint8Array}
     */
    saveNoCompress() {
        const ret = wasm.automerge_saveNoCompress(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    saveAndVerify() {
        const ret = wasm.automerge_saveAndVerify(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Uint8Array} data
     * @returns {number}
     */
    loadIncremental(data) {
        const ret = wasm.automerge_loadIncremental(this.__wbg_ptr, data);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {Change[]} changes
     */
    applyChanges(changes) {
        const ret = wasm.automerge_applyChanges(this.__wbg_ptr, changes);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {Heads} have_deps
     * @returns {Change[]}
     */
    getChanges(have_deps) {
        const ret = wasm.automerge_getChanges(this.__wbg_ptr, have_deps);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Heads} have_deps
     * @returns {ChangeMetadata[]}
     */
    getChangesMeta(have_deps) {
        const ret = wasm.automerge_getChangesMeta(this.__wbg_ptr, have_deps);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Hash} hash
     * @returns {Change | null}
     */
    getChangeByHash(hash) {
        const ret = wasm.automerge_getChangeByHash(this.__wbg_ptr, hash);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Hash} hash
     * @returns {ChangeMetadata | null}
     */
    getChangeMetaByHash(hash) {
        const ret = wasm.automerge_getChangeMetaByHash(this.__wbg_ptr, hash);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Hash} hash
     * @returns {DecodedChange | null}
     */
    getDecodedChangeByHash(hash) {
        const ret = wasm.automerge_getDecodedChangeByHash(this.__wbg_ptr, hash);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {Automerge} other
     * @returns {Change[]}
     */
    getChangesAdded(other) {
        _assertClass(other, Automerge);
        const ret = wasm.automerge_getChangesAdded(this.__wbg_ptr, other.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Heads}
     */
    getHeads() {
        const ret = wasm.automerge_getHeads(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Actor}
     */
    getActorId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.automerge_getActorId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Change | null}
     */
    getLastLocalChange() {
        const ret = wasm.automerge_getLastLocalChange(this.__wbg_ptr);
        return ret;
    }
    dump() {
        wasm.automerge_dump(this.__wbg_ptr);
    }
    /**
     * @param {any} heads
     * @returns {Array<any>}
     */
    getMissingDeps(heads) {
        const ret = wasm.automerge_getMissingDeps(this.__wbg_ptr, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {SyncState} state
     * @param {SyncMessage} message
     */
    receiveSyncMessage(state, message) {
        _assertClass(state, SyncState);
        const ret = wasm.automerge_receiveSyncMessage(this.__wbg_ptr, state.__wbg_ptr, message);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {SyncState} state
     * @returns {SyncMessage | null}
     */
    generateSyncMessage(state) {
        _assertClass(state, SyncState);
        const ret = wasm.automerge_generateSyncMessage(this.__wbg_ptr, state.__wbg_ptr);
        return ret;
    }
    /**
     * @param {any} meta
     * @returns {MaterializeValue}
     */
    toJS(meta) {
        const ret = wasm.automerge_toJS(this.__wbg_ptr, meta);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @param {any} meta
     * @returns {any}
     */
    materialize(obj, heads, meta) {
        const ret = wasm.automerge_materialize(this.__wbg_ptr, obj, heads, meta);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {any} position
     * @param {any} heads
     * @param {any} move_cursor
     * @returns {string}
     */
    getCursor(obj, position, heads, move_cursor) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.automerge_getCursor(this.__wbg_ptr, obj, position, heads, move_cursor);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {any} obj
     * @param {any} cursor
     * @param {any} heads
     * @returns {number}
     */
    getCursorPosition(obj, cursor, heads) {
        const ret = wasm.automerge_getCursorPosition(this.__wbg_ptr, obj, cursor, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {string | null} [message]
     * @param {number | null} [time]
     * @returns {Hash}
     */
    emptyChange(message, time) {
        var ptr0 = isLikeNone(message) ? 0 : passStringToWasm0(message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.automerge_emptyChange(this.__wbg_ptr, ptr0, len0, !isLikeNone(time), isLikeNone(time) ? 0 : time);
        return ret;
    }
    /**
     * @param {any} obj
     * @param {any} range
     * @param {any} name
     * @param {any} value
     * @param {any} datatype
     */
    mark(obj, range, name, value, datatype) {
        const ret = wasm.automerge_mark(this.__wbg_ptr, obj, range, name, value, datatype);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {ObjID} obj
     * @param {MarkRange} range
     * @param {string} name
     */
    unmark(obj, range, name) {
        const ret = wasm.automerge_unmark(this.__wbg_ptr, obj, range, name);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} obj
     * @param {any} heads
     * @returns {any}
     */
    marks(obj, heads) {
        const ret = wasm.automerge_marks(this.__wbg_ptr, obj, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} obj
     * @param {number} index
     * @param {any} heads
     * @returns {object}
     */
    marksAt(obj, index, heads) {
        const ret = wasm.automerge_marksAt(this.__wbg_ptr, obj, index, heads);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {SyncState} state
     * @returns {boolean}
     */
    hasOurChanges(state) {
        _assertClass(state, SyncState);
        const ret = wasm.automerge_hasOurChanges(this.__wbg_ptr, state.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {Hash[]}
     */
    topoHistoryTraversal() {
        const ret = wasm.automerge_topoHistoryTraversal(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Stats}
     */
    stats() {
        const ret = wasm.automerge_stats(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {any} hashes
     * @returns {Uint8Array}
     */
    saveBundle(hashes) {
        const ret = wasm.automerge_saveBundle(this.__wbg_ptr, hashes);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) Automerge.prototype[Symbol.dispose] = Automerge.prototype.free;

const SyncStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_syncstate_free(ptr >>> 0, 1));

export class SyncState {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SyncState.prototype);
        obj.__wbg_ptr = ptr;
        SyncStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SyncStateFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_syncstate_free(ptr, 0);
    }
    /**
     * @returns {Heads}
     */
    get sharedHeads() {
        const ret = wasm.syncstate_sharedHeads(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Heads}
     */
    get lastSentHeads() {
        const ret = wasm.syncstate_lastSentHeads(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Heads} heads
     */
    set lastSentHeads(heads) {
        const ret = wasm.syncstate_set_lastSentHeads(this.__wbg_ptr, heads);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {Heads} hashes
     */
    set sentHashes(hashes) {
        const ret = wasm.syncstate_set_sentHashes(this.__wbg_ptr, hashes);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {SyncState}
     */
    clone() {
        const ret = wasm.syncstate_clone(this.__wbg_ptr);
        return SyncState.__wrap(ret);
    }
}
if (Symbol.dispose) SyncState.prototype[Symbol.dispose] = SyncState.prototype.free;

export function __wbg_BigInt_6adbfd8eb0f7ec07(arg0) {
    const ret = BigInt(arg0);
    return ret;
};

export function __wbg_Error_e17e777aac105295(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_String_8f0eb39a4a4c2f66(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_apply_55d63d092a912d6f() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.apply(arg0, arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_assign_66f7942767cba7e3(arg0, arg1) {
    const ret = Object.assign(arg0, arg1);
    return ret;
};

export function __wbg_call_13410aac570ffff7() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_call_a5400b25a865cfd8() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_concat_4a5e81410543b8f3(arg0, arg1) {
    const ret = arg0.concat(arg1);
    return ret;
};

export function __wbg_defineProperty_1afba89a75bc184f(arg0, arg1, arg2) {
    const ret = Object.defineProperty(arg0, arg1, arg2);
    return ret;
};

export function __wbg_deleteProperty_5fe99f4fd0f66ebe() { return handleError(function (arg0, arg1) {
    const ret = Reflect.deleteProperty(arg0, arg1);
    return ret;
}, arguments) };

export function __wbg_done_75ed0ee6dd243d9d(arg0) {
    const ret = arg0.done;
    return ret;
};

export function __wbg_entries_2be2f15bd5554996(arg0) {
    const ret = Object.entries(arg0);
    return ret;
};

export function __wbg_error_7534b8e9a36f1ab4(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
    } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
};

export function __wbg_for_fbb1cf47b8d6b3f6(arg0, arg1) {
    const ret = Symbol.for(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_freeze_881cf93497533f9e(arg0) {
    const ret = Object.freeze(arg0);
    return ret;
};

export function __wbg_from_88bc52ce20ba6318(arg0) {
    const ret = Array.from(arg0);
    return ret;
};

export function __wbg_getRandomValues_1c61fac11405ffdc() { return handleError(function (arg0, arg1) {
    globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
}, arguments) };

export function __wbg_getTime_6bb3f64e0f18f817(arg0) {
    const ret = arg0.getTime();
    return ret;
};

export function __wbg_get_0da715ceaecea5c8(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
};

export function __wbg_get_458e874b43b18b25() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments) };

export function __wbg_instanceof_ArrayBuffer_67f3012529f6a2dd(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Date_c0cdff0c3b978b0e(arg0) {
    let result;
    try {
        result = arg0 instanceof Date;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Object_fbf5fef4952ff29b(arg0) {
    let result;
    try {
        result = arg0 instanceof Object;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Uint8Array_9a8378d955933db7(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_isArray_030cce220591fb41(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
};

export function __wbg_isArray_52653600d4b65388(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
};

export function __wbg_iterator_f370b34483c71a1c() {
    const ret = Symbol.iterator;
    return ret;
};

export function __wbg_keys_ef52390b2ae0e714(arg0) {
    const ret = Object.keys(arg0);
    return ret;
};

export function __wbg_length_186546c51cd61acd(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_length_6bb7e81f9d7713e4(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_length_9d771c54845e987f(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_log_6c7b5f4f00b8ce3f(arg0) {
    console.log(arg0);
};

export function __wbg_log_7917fde260a8fd39(arg0, arg1) {
    console.log(arg0, arg1);
};

export function __wbg_new_19c25a3f2fa63a02() {
    const ret = new Object();
    return ret;
};

export function __wbg_new_1f3a344cf3123716() {
    const ret = new Array();
    return ret;
};

export function __wbg_new_5a2ae4557f92b50e(arg0) {
    const ret = new Date(arg0);
    return ret;
};

export function __wbg_new_638ebfaedbf32a5e(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
};

export function __wbg_new_8a6f238a6ece86ea() {
    const ret = new Error();
    return ret;
};

export function __wbg_new_da9dc54c5db29dfa(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_new_ef4f9056d946f38b(arg0, arg1) {
    const ret = new RangeError(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_newfromslice_074c56947bd43469(arg0, arg1) {
    const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_next_5b3530e612fde77d(arg0) {
    const ret = arg0.next;
    return ret;
};

export function __wbg_next_692e82279131b03c() { return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
}, arguments) };

export function __wbg_ownKeys_36e096e00ffe2676() { return handleError(function (arg0) {
    const ret = Reflect.ownKeys(arg0);
    return ret;
}, arguments) };

export function __wbg_prototypesetcall_3d4a26c1ed734349(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
};

export function __wbg_push_330b2eb93e4e1212(arg0, arg1) {
    const ret = arg0.push(arg1);
    return ret;
};

export function __wbg_set_3f1d0b984ed272ed(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
};

export function __wbg_set_453345bcda80b89a() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_set_90f6c0f7bd8c0415(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
};

export function __wbg_slice_974daea329f5c01d(arg0, arg1, arg2) {
    const ret = arg0.slice(arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbg_stack_0ed75d68575b0f3c(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_stringify_4a34a65f0d4e236f(arg0, arg1) {
    const ret = JSON.stringify(arg1);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_toString_1f1286a7a97689fe(arg0, arg1, arg2) {
    const ret = arg1.toString(arg2);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_toString_7268338f40012a03() { return handleError(function (arg0, arg1) {
    const ret = arg0.toString(arg1);
    return ret;
}, arguments) };

export function __wbg_toString_ea9a6b07f936eb86(arg0) {
    const ret = arg0.toString();
    return ret;
};

export function __wbg_unshift_18d353edeebf9a72(arg0, arg1) {
    const ret = arg0.unshift(arg1);
    return ret;
};

export function __wbg_value_dd9372230531eade(arg0) {
    const ret = arg0.value;
    return ret;
};

export function __wbg_values_a574c29011369bea(arg0) {
    const ret = Object.values(arg0);
    return ret;
};

export function __wbg_wbindgenbooleanget_3fe6f642c7d97746(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
};

export function __wbg_wbindgendebugstring_99ef257a3ddda34d(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_wbindgengt_5d4c5d18810de162(arg0, arg1) {
    const ret = arg0 > arg1;
    return ret;
};

export function __wbg_wbindgenisbigint_ecb90cc08a5a9154(arg0) {
    const ret = typeof(arg0) === 'bigint';
    return ret;
};

export function __wbg_wbindgenisfunction_8cee7dce3725ae74(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
};

export function __wbg_wbindgenisnull_f3037694abe4d97a(arg0) {
    const ret = arg0 === null;
    return ret;
};

export function __wbg_wbindgenisobject_307a53c6bd97fbf8(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

export function __wbg_wbindgenisstring_d4fa939789f003b0(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
};

export function __wbg_wbindgenisundefined_c4b71d073b92f3c5(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

export function __wbg_wbindgenjsvallooseeq_9bec8c9be826bed1(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
};

export function __wbg_wbindgenlt_544155a2b3097bd5(arg0, arg1) {
    const ret = arg0 < arg1;
    return ret;
};

export function __wbg_wbindgenneg_3577d8a6fd6fd98b(arg0) {
    const ret = -arg0;
    return ret;
};

export function __wbg_wbindgennumberget_f74b4c7525ac05cb(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
};

export function __wbg_wbindgenstringget_0f16a6ddddef376f(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_wbindgenthrow_451ec1a8469d7eb6(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

export function __wbindgen_cast_2241b6af4c4b2941(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_cast_4625c577ab2ec9ee(arg0) {
    // Cast intrinsic for `U64 -> Externref`.
    const ret = BigInt.asUintN(64, arg0);
    return ret;
};

export function __wbindgen_cast_9ae0607507abb057(arg0) {
    // Cast intrinsic for `I64 -> Externref`.
    const ret = arg0;
    return ret;
};

export function __wbindgen_cast_d6cd19b81560fd6e(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return ret;
};

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_export_4;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

