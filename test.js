var api = require('./common_api_adapter');
// var livecoin_api = require('./livecoin/livecoin_api_adapter');




(async function () {
    var result = await api.get_deposit_address("binance", "DASH");
    if (result.success) {
        var address = result.value;
        var result2=await api.withdraw_request("livecoin", 	0.04952529, 0.002, "DASH", address);
        console.log(result2);
    }
  
    
})()
