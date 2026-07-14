/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error'], function(error) {

  function lineInit(context) {
        var currentRecord = context.currentRecord;
		var loc = currentRecord.getValue('location');
    var vendorH = currentRecord.getValue('custbody_vendor');
        var sublistName = context.sublistId;
        if (sublistName === 'item'){
            currentRecord.setCurrentSublistValue({
                sublistId: sublistName,
                fieldId: 'location',
                value: loc
            });
          if(vendorH){
             currentRecord.setCurrentSublistValue({
                sublistId: sublistName,
                fieldId: 'povendor',
                value: vendorH
            });
          }
   
        }
    }
    
    function fieldChanged(context) {
        var currentRecord = context.currentRecord;
        var sublistName = context.sublistId;
        var sublistFieldName = context.fieldId;
        var line = context.line;
        if (sublistName === 'item' && (sublistFieldName === 'custcol_vendor_quantity' || sublistFieldName == 'custcol_vendor_cost')){
			
		var qty = currentRecord.getCurrentSublistValue({
				sublistId:sublistName,
				fieldId: 'custcol_vendor_quantity'
			})
			log.debug('qty', qty);
			var cost = currentRecord.getCurrentSublistValue({
				sublistId:sublistName,
				fieldId: 'custcol_vendor_cost'
			})
			log.debug('cost', cost);
			
			if(qty && cost){
				
			
			var total = parseFloat(qty)*parseFloat(cost);
			
			currentRecord.setCurrentSublistValue({
				sublistId:sublistName,
				fieldId: 'custcol_vendor_total',
				value:total
			})
			}
			
			
		}
		
		if(context.fieldId == 'entity' && currentRecord.type == 'estimate'){
			
			log.debug('type', currentRecord.type);
			
			var pro = currentRecord.getValue('entity');
			
			currentRecord.setValue('custbody_project', pro);
		}
            
    }

   function saveRecord(context) {
        try {
			
			var rec = context.currentRecord;

        // Run only for Sales Orders
        if (rec.type !== 'salesorder') {
            return true;
        }
            var currentRecord = context.currentRecord;

            // Header Vendor
            var vendorId = currentRecord.getValue({
                fieldId: 'custbody_vendor'
            });

            var lineCount = currentRecord.getLineCount({
                sublistId: 'item'
            });

            var rClass = currentRecord.getValue({
                fieldId: 'class'
            });

          if(rClass == 2){
                for (var i = 0; i < lineCount; i++) {
                currentRecord.selectLine({
                    sublistId: 'item',
                    line: i
                });

                currentRecord.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'povendor', // Replace with your line field ID
                    value: vendorId,
                    ignoreFieldChange: true
                });

                currentRecord.commitLine({
                    sublistId: 'item'
                });
            }
            
          }

          

            return true;

        } catch (e) {
            console.error('Save Record Error', e);
            return false;
        }
    }
    
    
    return {       
      fieldChanged: fieldChanged,
      lineInit: lineInit,
       saveRecord: saveRecord 
    };
}); 