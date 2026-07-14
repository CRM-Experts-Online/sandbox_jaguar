/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

    const getInputData = () => {
        return search.load({
            id: 'customsearch1934'
        });
    };

    const map = (context) => {
        try {
            const result = JSON.parse(context.value);

            const recordId = result.id;
            const typeObj = result.values.type || {};
            const typeCode = typeObj.value;

            const typeMap = {
                CustInvc: record.Type.INVOICE,
                CustCred: record.Type.CREDIT_MEMO
            };

            const recordType = typeMap[typeCode];

            if (!recordType) {
                log.error({
                    title: 'Unsupported Type',
                    details: JSON.stringify(typeObj)
                });
                return;
            }

            log.debug({
                title: 'Processing Record',
                details: {
                    id: recordId,
                    typeCode: typeCode,
                    typeText: typeObj.text
                }
            });

            const rec = record.load({
                type: recordType,
                id: recordId,
                isDynamic: false
            });

            rec.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });

            log.audit({
                title: 'Record Resubmitted',
                details: {
                    id: recordId,
                    type: typeObj.text
                }
            });

        } catch (e) {
            log.error({
                title: 'Map Error',
                details: e
            });
        }
    };

    const summarize = (summary) => {

        log.audit({
            title: 'Summary',
            details: {
                usage: summary.usage,
                concurrency: summary.concurrency,
                yields: summary.yields
            }
        });

        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error({
                title: `Map Error: ${key}`,
                details: error
            });
            return true;
        });
    };

    return {
        getInputData,
        map,
        summarize
    };
});