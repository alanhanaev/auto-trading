var assert = require("assert");
var test = require('./binance_parse');

it("Проверяет функцию (get_precisions_by_filter) которая находит точность для price и quantity", function () {



    var filters = [
        {
            "filterType": "PRICE_FILTER",
            "minPrice": "0.00000100",
            "maxPrice": "100000.00000000",
            "tickSize": "0.00000100"
        },
        {
            "filterType": "LOT_SIZE",
            "minQty": "0.00100000",
            "maxQty": "100000.00000000",
            "stepSize": "0.00100000"
        },
        {
            "filterType": "MIN_NOTIONAL",
            "minNotional": "0.00100000"
        }
    ]
    var expectedResult = { price_precision: 6, quantity_precision:3 };
    var result = test.get_precisions_by_filter(filters);
    assert.deepEqual(result, expectedResult);


    var filters = [
        {
            "filterType": "PRICE_FILTER",
            "minPrice": "1.00000000",
            "maxPrice": "100000.00000000",
            "tickSize": "1.00000000"
        },
        {
            "filterType": "LOT_SIZE",
            "minQty": "1.00000000",
            "maxQty": "100000.00000000",
            "stepSize": "1.00000000"
        },
        {
            "filterType": "MIN_NOTIONAL",
            "minNotional": "0.00100000"
        }
    ]
    var expectedResult = { price_precision: 0, quantity_precision:0 };
    var result = test.get_precisions_by_filter(filters);
    assert.deepEqual(result, expectedResult);


});