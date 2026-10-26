/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Sales Order: when the user selects a vendor in the custom body field,
 * copy it to the native line-level Vendor field (povendor) on every item line.
 * New lines added afterwards are defaulted to the same vendor.
 *
 * Replace CUSTOM_VENDOR_FIELD with your field's script ID.
 */
define([], () => {

    const CUSTOM_VENDOR_FIELD = 'custbody_vendor';   // your custom field (List/Record: Vendor)
    const SUBLIST = 'item';
    const LINE_VENDOR_FIELD = 'povendor';            // native "Vendor" column on SO lines

    let syncing = false; // guard against recursive fieldChanged events

    const getSelectedVendor = (rec) => rec.getValue({ fieldId: CUSTOM_VENDOR_FIELD });

    const setLineVendor = (rec, vendorId) => {
        // Only set if the column exists on this line (e.g. not on description/subtotal lines)
        const field = rec.getCurrentSublistField({ sublistId: SUBLIST, fieldId: LINE_VENDOR_FIELD });
        if (!field || field.isDisabled) return;
        rec.setCurrentSublistValue({
            sublistId: SUBLIST,
            fieldId: LINE_VENDOR_FIELD,
            value: vendorId || '',
            ignoreFieldChange: true
        });
    };

    const fieldChanged = (context) => {
        const rec = context.currentRecord;

        // Body field changed -> update every existing line
        if (!context.sublistId && context.fieldId === CUSTOM_VENDOR_FIELD && !syncing) {
            syncing = true;
            try {
                const vendorId = getSelectedVendor(rec);
                const lineCount = rec.getLineCount({ sublistId: SUBLIST });

                for (let i = 0; i < lineCount; i++) {
                    rec.selectLine({ sublistId: SUBLIST, line: i });
                    setLineVendor(rec, vendorId);
                    rec.commitLine({ sublistId: SUBLIST });
                }
            } catch (e) {
                console.error('Vendor sync failed', e);
            } finally {
                syncing = false;
            }
        }

        // Drop Ship / Special Order toggled on a line -> povendor becomes editable, so fill it
        if (context.sublistId === SUBLIST &&
            (context.fieldId === 'createpo' || context.fieldId === 'isdropshipment') && !syncing) {
            const vendorId = getSelectedVendor(rec);
            if (vendorId) setLineVendor(rec, vendorId);
        }
    };

    /**
     * New line: item sourcing (preferred vendor etc.) runs AFTER fieldChanged,
     * so set the vendor in postSourcing to avoid it being overwritten.
     */
    const postSourcing = (context) => {
        if (context.sublistId !== SUBLIST || context.fieldId !== 'item' || syncing) return;
        const rec = context.currentRecord;
        const vendorId = getSelectedVendor(rec);
        if (vendorId) setLineVendor(rec, vendorId);
    };

    /**
     * Safety net when the user clicks Add / OK on a line:
     * if the line vendor is still empty, fill it from the custom field.
     */
    const validateLine = (context) => {
        if (context.sublistId !== SUBLIST || syncing) return true;
        const rec = context.currentRecord;
        const vendorId = getSelectedVendor(rec);
        if (!vendorId) return true;

        const current = rec.getCurrentSublistValue({ sublistId: SUBLIST, fieldId: LINE_VENDOR_FIELD });
        if (!current) setLineVendor(rec, vendorId);
        return true; // never block the line from being added
    };

    return { fieldChanged, postSourcing, validateLine };
});