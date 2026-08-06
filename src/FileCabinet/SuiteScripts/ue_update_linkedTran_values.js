/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search', 'N/email', 'N/runtime'],
        function(record, log, search, email, runtime) {
            function afterSubmit(context) {
                try {

                    var recObj = context.newRecord;

                    const vbId = context.newRecord.id;
                    const vbType = context.newRecord.type;

                    if (context.type == 'edit' || context.type == 'create') {

                        var linkedTran = recObj.getValue('custbody_linked_transaction');

                        if (!linkedTran) {
                            return;
                        }

                        var linkedState = recObj.getValue('custbody_linked_order_state');

                        if (linkedState) {
                            return;
                        }

                        const salesorderSearchObj = search.create({
                            type: "salesorder",
                            filters: [
                                ["type", "anyof", "SalesOrd"],
                                "AND",
                                ["mainline", "is", "T"],
                                "AND",
                                ["internalid", "anyof", linkedTran]
                            ],
                            columns: [
                                search.createColumn({
                                    name: "tranid",
                                    label: "Document Number"
                                }),
                                search.createColumn({
                                    name: "entity",
                                    label: "Name"
                                }),
                                search.createColumn({
                                    name: "shipaddress1",
                                    label: "Shipping Address 1"
                                }),
                                search.createColumn({
                                    name: "shipaddress2",
                                    label: "Shipping Address 2"
                                }),
                                search.createColumn({
                                    name: "shipcity",
                                    label: "Shipping City"
                                }),
                                search.createColumn({
                                    name: "shipstate",
                                    label: "Shipping State/Province"
                                }),
                                search.createColumn({
                                    name: "shipzip",
                                    label: "Shipping Zip"
                                })
                            ]
                        });

                        var getResult = salesorderSearchObj.run().getRange({
                            start: 0,
                            end: 1
                        });
                        log.debug('getResult', getResult);
                        if (getResult && getResult.length > 0) {

                            var newObj = {}

                            newObj.custbody_linked_cutomer = getResult[0].getText('entity');
                            newObj.custbody_linked_order_city = getResult[0].getValue('shipcity');
                            newObj.custbody_linked_order_state = getResult[0].getValue('shipstate');
                            newObj.custbody_linked_order_address = getResult[0].getValue('shipaddress1');
                            newObj.custbody_linked_order_zip = getResult[0].getValue('shipzip');
                            newObj.custbody_linked_order_number = getResult[0].getValue('tranid');

                            var suBmitValues = record.submitFields({
                                type: vbType,
                                id: vbId,
                                values: newObj,
                                options: {
                                    enableSourcing: false,
                                    ignoreMandatoryFields: true
                                }
                            });

                            log.debug('suBmitValues', suBmitValues)

                        }



				} 
				}catch(er) {
                        log.error('ERROR', er.toString());
                    }
                }



                return {
                    afterSubmit: afterSubmit
                };
            });