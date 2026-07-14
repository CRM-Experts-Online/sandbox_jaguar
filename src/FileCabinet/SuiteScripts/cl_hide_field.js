/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([], () => {

    const pageInit = (context) => {
        try {
            const currentRecord = context.currentRecord;

            // Field ID to hide
            const fieldId = 'itemoptions';

            // Get field object
            const fieldObj = currentRecord.getField({
                fieldId: fieldId
            });

            if (fieldObj) {
                fieldObj.isDisplay = false;
            }

        } catch (e) {
            console.log('Error hiding field: ' + e.message);
        }
    };

    return {
        pageInit
    };

});