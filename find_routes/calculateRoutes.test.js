var assert = require("assert");
var calculateRoutes = require('./calculateRoutes');

function get_exchange(start_exchange, end_exchange, market, start_cur, end_cur, buy = false, sell = false, comisssion, orders = []) {
    return {
        exchange: {  //Ребро в пределах одной биржи
            percent_comission: comisssion,
            fixed_comission: 0,
            orders: orders,
            buy: buy, //купить
            sell: sell,  //продать
            start_vertex_currency_local: start_cur,
            end_vertex_currency_local: end_cur,
            start_vertex_currency_common: start_cur,
            end_vertex_currency_common: end_cur,
            start_exchange: start_exchange,
            end_exchange: end_exchange,
            market_name: market,
            precision: { price_precision: 5, quantity_precision: 8 }
        }
    };
}

function get_exchanges(start_exchange, end_exchange, start_cur, end_cur, output_comisssion, bridge = true) {
    return {
        exchanges: {
            start_vertex_currency_id: 0,
            end_vertex_currency_id: 0,
            start_vertex_currency_local: start_cur,
            end_vertex_currency_local: end_cur,
            start_vertex_currency_common: start_cur,
            end_vertex_currency_common: end_cur,
            start_exchange: start_exchange,
            end_exchange: end_exchange,
            start_fixed_comission: output_comisssion,
            start_percent_comission: 0,
            start_min: 0,
            start_max: 0,
            end_fixed_comission: 0,
            end_percent_comission: 0,
            end_min: 0,
            end_max: 0,
            use_as_bridge_between_exchanges: bridge
        }
    }
}

//USD ETH  livecoin
var orders_0_1=[
    {course: 850, count: 0.5, cost: 425 },
    {course: 860, count: 0.2, cost: 172 },
    {course: 900, count: 0.1, cost: 90 }
];





//ETH USD  livecoin
var orders_1_0=[
    {course: 840, count: 0.1, cost: 84 },
    {course: 830, count: 0.2, cost: 166 },
    {course: 800, count: 0.1, cost: 80 }
];




//USD DASH  livecoin
var orders_0_2=[
    {course: 620, count: 0.15, cost: 93},
    {course: 640, count: 0.3, cost: 192},
    {course: 660, count: 0.4, cost: 264 }
];

//DASH USD  livecoin
var orders_2_0=[
    {course: 610, count: 0.23, cost: 140.3 },
    {course: 600, count: 0.05, cost: 30 },
    {course: 590, count: 0.13, cost: 76.7 }
];


//DASH USD  binance
var orders_4_5=[
    {course: 625, count: 0.15, cost: 93.75 },
    {course: 610, count: 0.45, cost: 274.5 },
    {course: 585, count: 0.12, cost: 70.2 }
];

//USD DASH  binance
var orders_5_4=[
    {course: 632, count: 0.05, cost: 31.6 },
    {course: 644, count: 0.03, cost: 19.32 },
    {course: 655, count: 0.8, cost: 524 }
];

//ETH USD  binance
var orders_3_5=[
    {course: 890, count: 0.36, cost: 320.4 },
    {course: 875, count: 0.25, cost: 218.75 },
    {course: 860, count: 0.7, cost: 602 }
];

//USD ETH  binance
var orders_5_3=[
    {course: 900, count: 0.9, cost: 810 },
    {course: 910, count: 0.22, cost: 200.2 },
    {course: 915, count: 0.1, cost: 91.5 }
];

it("Проверяет функцию (calculateRoutes)", async function () {
    var _0_1 = get_exchange("livecoin", "livecoin", "ETH/USD", "USD", "ETH", true, false, 0.0018, orders_0_1);
    var _1_0 = get_exchange("livecoin", "livecoin", "ETH/USD", "ETH", "USD", false, true, 0.0018, orders_1_0);
    var _0_2 = get_exchange("livecoin", "livecoin", "DASH/USD", "USD", "DASH", true, false, 0.0018, orders_0_2);
    var _2_0 = get_exchange("livecoin", "livecoin", "DASH/USD", "DASH", "USD", false, true, 0.0018, orders_2_0);
    var _2_4 = get_exchanges("livecoin", "binance", "DASH", "DASH", 0.002, true);
    var _4_2 = get_exchanges("binance", "livecoin", "DASH", "DASH", 0.002, true);
    var _4_5 = get_exchange("binance", "binance", "DASHUSD", "DASH", "USD", false, true, 0.0005, orders_4_5);
    var _5_4 = get_exchange("binance", "binance", "DASHUSD", "USD", "DASH", true, false, 0.0005, orders_5_4);
    var _3_5 = get_exchange("binance", "binance", "ETHUSD", "ETH", "USD", false, true, 0.0005, orders_3_5);
    var _5_3 = get_exchange("binance", "binance", "ETHUSD", "USD", "ETH", true, false, 0.0005, orders_5_3);

    var Full_matrix = [
        [0000, _1_0, _0_2, 0000, 0000, 0000],
        [_0_1, 0000, 0000, 0000, 0000, 0000],
        [_2_0, 0000, 0000, 0000, _4_2, 0000],
        [0000, 0000, 0000, 0000, 0000, _5_3],
        [0000, 0000, 0000, _2_4, 0000, _5_4],
        [0000, 0000, 0000, _3_5, _4_5, 0000]
    ];
    var Full_routes = [
        {
            route: [0,1],
            edges: [
                _0_1
            ]
        }
    ];
    var Start_balance = 100;
    var Exclude_currencys = [];
    //start 100
    //usd->eth = 100-> 0,117647058823529
    // 0,117647058823529 -(0,0018*0,117647058823529)= 0,117647058823529 - 0,000211764705882
    // end balance 0,117435294117647


    var expectedResult = [];
    var result = await calculateRoutes.calculate(Full_matrix, Full_routes, Start_balance, Exclude_currencys)
    assert.strictEqual(calculateRoutes.trim_float(result[0].end_balance, 13), calculateRoutes.trim_float(0.117435294117647, 13));


});




it("Проверяет функцию (find_quantity) которая находит количество монет которое мы можем купить на определенную сумму", function () {


    var start_balance = 4200.45;
    var orders = [
        { course: 976.5, count: 3.5688, cost: 3484.9332 },
        { course: 1003.78, count: 18.445, cost: 18514.7221 }
    ]
    var expectedResult = 4.281622331586602642013190141266;
    var result = calculateRoutes.find_quantity(orders, start_balance);
    assert.equal(result, calculateRoutes.trim(expectedResult));
    


    var start_balance = 4000;
    var orders = [
        { course: 1000, count: 2, cost: 2000 },
        { course: 2000, count: 1, cost: 2000 }
    ]
    var expectedResult = 3;
    var result = calculateRoutes.find_quantity(orders, start_balance);
    assert.equal(result, expectedResult);

});


it("Проверяет функцию (find_sum) которая находит сумму которую мы получим продав определенное количество монет", function () {

    var start_quantity = 19.3;
    var orders = [
        { course: 1003.78, count: 18.445, cost: 18514.7221 },
        { course: 976.5, count: 3.5688, cost: 3484.9332 }
    ]
    var expectedResult = 19349.6296;
    var result = calculateRoutes.find_sum(orders, start_quantity);
    assert.equal(result, expectedResult);
});
