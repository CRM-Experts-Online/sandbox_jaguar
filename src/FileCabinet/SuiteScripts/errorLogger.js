/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * errorLogger.js
 * -----------------------------------------------------------------------------
 * Reusable library for writing errors / warnings / audit entries to a custom
 * record in NetSuite.
 *
 * This module NEVER throws. If the log record cannot be written for any reason,
 * it falls back to N/log and returns null, so it can be safely called from
 * inside a catch block without masking the original error.
 *
 */
define(['N/record', 'N/runtime', 'N/log'], (record, runtime, log) => {

    // =========================================================================
    // CONFIG
    // =========================================================================
    const CONFIG = {
        RECORD_TYPE: 'customrecord_error_log',

        FIELDS: {
            title:       'custrecord_errlog_title',
            severity:    'custrecord_errlog_severity',
            scriptId:    'custrecord_errlog_script_id',
            scriptName:  'custrecord_errlog_script_name',
            deployment:  'custrecord_errlog_deployment',
            functionName:'custrecord_errlog_function',
            errorCode:   'custrecord_errlog_error_code',
            message:     'custrecord_errlog_message',
            stack:       'custrecord_errlog_stack',
            details:     'custrecord_errlog_details',
            recordType:  'custrecord_errlog_record_type',
            recordId:    'custrecord_errlog_record_id',
            user:        'custrecord_errlog_user',
            context:     'custrecord_errlog_context',
            environment: 'custrecord_errlog_environment'
        },

        // Approximate governance cost of one log write (create 2 + save 4).
        USAGE_PER_LOG: 6,

        // Skip the DB write (fall back to N/log) below this remaining usage,
        // so logging never starves the calling script. Pass force:true to override.
        MIN_REMAINING_USAGE: 30
    };

    const LIMITS = {
        TEXT: 300,        // Free-Form Text
        LONG_TEXT: 99000  // Long Text (NetSuite max 100,000)
    };

    const SEVERITY = {
        DEBUG:     'DEBUG',
        AUDIT:     'AUDIT',
        WARNING:   'WARNING',
        ERROR:     'ERROR',
        EMERGENCY: 'EMERGENCY'
    };

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    const truncate = (value, max) => {
        if (value === null || value === undefined) return null;
        const str = String(value);
        return str.length > max ? str.substring(0, max - 3) + '...' : str;
    };

    /** JSON.stringify that survives circular references and getters that throw. */
    const safeStringify = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        try {
            const seen = new WeakSet();
            return JSON.stringify(value, (key, val) => {
                if (typeof val === 'object' && val !== null) {
                    if (seen.has(val)) return '[Circular]';
                    seen.add(val);
                }
                if (typeof val === 'function') return '[Function]';
                return val;
            }, 2);
        } catch (e) {
            try { return String(value); } catch (e2) { return '[Unserializable]'; }
        }
    };

    /**
     * Normalizes anything thrown into a consistent shape.
     * Handles N/error objects (name = error code), native Error, strings, objects.
     */
    const normalizeError = (err) => {
        const out = { code: '', message: '', stack: '', cause: null };
        if (err === null || err === undefined) return out;

        if (typeof err === 'string') {
            out.message = err;
            return out;
        }

        try {
            out.code    = err.name || err.type || err.code || 'UNEXPECTED_ERROR';
            out.message = err.message || '';
            out.stack   = err.stack || '';

            // N/error objects expose .cause (often the underlying native error)
            if (err.cause && err.cause !== err) {
                out.cause = safeStringify({
                    name:    err.cause.name,
                    message: err.cause.message,
                    stack:   err.cause.stack
                });
            }
            if (!out.message) out.message = String(err);
        } catch (e) {
            out.message = '[Error object could not be read]';
        }
        return out;
    };

    /** Collects script / user / environment context. Never throws. */
    const getExecutionContext = () => {
        const ctx = {
            scriptId: '', deploymentId: '', userId: '', userName: '',
            userRole: '', context: '', environment: ''
        };
        try {
            const script = runtime.getCurrentScript();
            ctx.scriptId     = script.id || '';
            ctx.deploymentId = script.deploymentId || '';
        } catch (e) { /* not available in all contexts */ }

        try {
            const user = runtime.getCurrentUser();
            ctx.userId   = user.id;
            ctx.userName = user.name || '';
            ctx.userRole = user.role;
        } catch (e) { /* ignore */ }

        try { ctx.context     = runtime.executionContext; } catch (e) { /* ignore */ }
        try { ctx.environment = runtime.envType; } catch (e) { /* ignore */ }

        return ctx;
    };

    /** Sets a field only if it is mapped and has a value. Bad field IDs are skipped. */
    const setField = (rec, fieldKey, value) => {
        const fieldId = CONFIG.FIELDS[fieldKey];
        if (!fieldId || value === null || value === undefined || value === '') return;
        try {
            rec.setValue({ fieldId: fieldId, value: value, ignoreFieldChange: true });
        } catch (e) {
            log.debug({
                title: 'errorLogger: could not set field',
                details: fieldId + ' -> ' + (e.message || e)
            });
        }
    };

    const hasGovernance = (force) => {
        if (force) return true;
        try {
            const remaining = runtime.getCurrentScript().getRemainingUsage();
            return remaining >= CONFIG.MIN_REMAINING_USAGE;
        } catch (e) {
            return true; // usage not measurable (e.g. client script) — proceed
        }
    };

    const fallbackLog = (severity, title, payload) => {
        try {
            const entry = { title: truncate(title, 99), details: payload };
            if (severity === SEVERITY.DEBUG) log.debug(entry);
            else if (severity === SEVERITY.AUDIT) log.audit(entry);
            else if (severity === SEVERITY.EMERGENCY) log.emergency(entry);
            else log.error(entry);
        } catch (e) { /* nothing left to do */ }
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Writes one entry to the error log custom record.
     *
     * @param {Object} options
     * @param {Error|Object|string} [options.error]      The caught error.
     * @param {string}  [options.title]                  Short summary. Defaults to error code.
     * @param {string}  [options.severity]               SEVERITY.* value. Default ERROR.
     * @param {string}  [options.functionName]           Function/entry point where it happened.
     * @param {string}  [options.scriptName]             Friendly script name for reporting.
     * @param {string}  [options.recordType]             Related record type, e.g. 'salesorder'.
     * @param {string|number} [options.recordId]         Related record internal id.
     * @param {Object|string} [options.details]          Any extra context (params, payloads).
     * @param {boolean} [options.force=false]            Write even when governance is low.
     * @param {boolean} [options.alsoLog=true]           Also emit to the standard script log.
     * @returns {number|null} Internal id of the created log record, or null on failure.
     */
    const logError = (options) => {
        const opts = options || {};
        const severity = opts.severity || SEVERITY.ERROR;
        const err = normalizeError(opts.error);
        const ctx = getExecutionContext();

        const title = opts.title || err.code || 'Unhandled Error';

        const detailsPayload = safeStringify({
            details: opts.details !== undefined ? opts.details : null,
            cause: err.cause,
            user: { id: ctx.userId, name: ctx.userName, role: ctx.userRole }
        });

        if (opts.alsoLog !== false) {
            fallbackLog(severity, title, {
                code: err.code,
                message: err.message,
                stack: err.stack,
                details: opts.details
            });
        }

        if (!hasGovernance(opts.force)) {
            log.debug({
                title: 'errorLogger',
                details: 'Skipped custom record write — remaining usage below threshold.'
            });
            return null;
        }

        try {
            const rec = record.create({
                type: CONFIG.RECORD_TYPE,
                isDynamic: false
            });

            setField(rec, 'title',        truncate(title, LIMITS.TEXT));
            setField(rec, 'severity',     truncate(severity, LIMITS.TEXT));
            setField(rec, 'errorCode',    truncate(err.code, LIMITS.TEXT));
            setField(rec, 'message',      truncate(err.message, LIMITS.LONG_TEXT));
            setField(rec, 'stack',        truncate(err.stack, LIMITS.LONG_TEXT));
            setField(rec, 'details',      truncate(detailsPayload, LIMITS.LONG_TEXT));
            setField(rec, 'scriptId',     truncate(ctx.scriptId, LIMITS.TEXT));
            setField(rec, 'scriptName',   truncate(opts.scriptName, LIMITS.TEXT));
            setField(rec, 'deployment',   truncate(ctx.deploymentId, LIMITS.TEXT));
            setField(rec, 'functionName', truncate(opts.functionName, LIMITS.TEXT));
            setField(rec, 'recordType',   truncate(opts.recordType, LIMITS.TEXT));
            setField(rec, 'recordId',     truncate(opts.recordId, LIMITS.TEXT));
            setField(rec, 'user',         truncate(ctx.userName ? ctx.userName + ' (' + ctx.userId + ')' : ctx.userId, LIMITS.TEXT));
            setField(rec, 'context',      truncate(ctx.context, LIMITS.TEXT));
            setField(rec, 'environment',  truncate(ctx.environment, LIMITS.TEXT));

            return rec.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

        } catch (e) {
            // Logging must never break the caller.
            fallbackLog(SEVERITY.ERROR, 'errorLogger: failed to write log record', {
                loggerError: { name: e.name, message: e.message, stack: e.stack },
                originalTitle: title,
                originalMessage: err.message
            });
            return null;
        }
    };

    /** Convenience wrappers. */
    const logWarning = (options) =>
        logError(Object.assign({}, options, { severity: SEVERITY.WARNING }));

    const logAudit = (options) =>
        logError(Object.assign({}, options, { severity: SEVERITY.AUDIT }));

    /**
     * Writes several entries in one go (e.g. accumulated errors from a map/reduce
     * or a scheduled loop). Stops early if governance runs out.
     * @param {Array<Object>} entries Array of logError option objects.
     * @returns {Array<number|null>} Created internal ids.
     */
    const logBatch = (entries) => {
        const ids = [];
        if (!entries || !entries.length) return ids;
        for (let i = 0; i < entries.length; i++) {
            if (!hasGovernance(entries[i].force)) {
                log.audit({
                    title: 'errorLogger',
                    details: 'Governance exhausted; ' + (entries.length - i) + ' entries not written.'
                });
                break;
            }
            ids.push(logError(entries[i]));
        }
        return ids;
    };

    /**
     * Wraps a function so any thrown error is logged and (optionally) swallowed.
     *
     * Example:
     *   const safeUpdate = errorLogger.wrap(updateCustomer, {
     *       functionName: 'updateCustomer', rethrow: true
     *   });
     *
     * @param {Function} fn
     * @param {Object} [options] Same options as logError, plus:
     * @param {boolean} [options.rethrow=true] Re-throw after logging.
     * @returns {Function}
     */
    const wrap = (fn, options) => {
        const opts = options || {};
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                logError(Object.assign({}, opts, {
                    error: e,
                    functionName: opts.functionName || fn.name || 'anonymous',
                    details: opts.details !== undefined
                        ? opts.details
                        : { args: Array.prototype.slice.call(arguments) }
                }));
                if (opts.rethrow !== false) throw e;
                return null;
            }
        };
    };

    return {
        SEVERITY: SEVERITY,
        CONFIG: CONFIG,
        logError: logError,
        logWarning: logWarning,
        logAudit: logAudit,
        logBatch: logBatch,
        wrap: wrap
    };
});