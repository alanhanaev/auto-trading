var fullMatrix = []; //полная матрица
var list_vertexs = []; //список соответствий номер в массиве номерам вершин к криптовалютам
var cur_names_by_market = []
/** Функция возвращает пустую вершину полного графа */

function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

function getEmptyEdge() {
    return {
        exchange: {  //Ребро в пределах одной биржи
            percent_comission: 0.001,
            //процент комиссии за 100 процентов берется цифра 1,
            fixed_comission: 0,
            //фиксированная комиссия за операцию
            orders: [],
            //курс обмена
            buy: false,
            //применять операцию деления
            sell: false,
            //применять операцию умножения
            start_vertex_currency_local: "USD",
            //идентификатор валюты откуда идет транзакция
            end_vertex_currency_local: "DASH",
            //применять операцию умножения
            start_vertex_currency_common: "USD",
            //идентификатор валюты откуда идет транзакция
            end_vertex_currency_common: "DASH",
            //идентификатор валюты куда идет транзакции
            start_exchange: "binance",
            //идентификатор биржи откуда идет транзакция
            end_exchange: "binance"
            //идентификатор биржи куда идет транзакции
        }
    }
}

/** Заполняет матрицу n*n пустыми значениями и возращает нам ее */
function fillMatrix(n) {
    var tempMatrix = [];
    for (var i = 0; i < n; i++) {
        var row = [];
        for (var j = 0; j < n; j++) {
            row.push(0);
        }
        tempMatrix.push(row);
    }
    return tempMatrix;
}

/** Возвращает название криптовалюты по идентификатору */
function getCoinNameById(id) {
    var temp = list_vertexs[id].currency_local;
    if (temp)
        return temp;
    else
        return '';
}

/** Возвращает идентификатор криптовалюты по имени */
function getCoinIdByName(name) {
    for (var i = 0; i < list_vertexs.length; i++) {
        if (name === list_vertexs[i].currency_local) {
            return i;
        }
    }
    return -1;
}

/** Показываем использовать ли текущую валюту есть ли она в нашем списке */
function useCurrency(name) {
    var flag = false;
    for (var i = 0; i < list_vertexs.length; i++) {
        if (name === list_vertexs[i].currency_local) {
            flag = true;
        }
    }
    return flag;
}

/** Получаем список ребер по полной матрице смежности */
function getListEdgesByFullMatrix(name) {
    var temp = [];
    for (var i = 0; i < fullMatrix.length; i++) {
        for (var j = 0; j < fullMatrix.length; j++) {
            if (fullMatrix[i][j] !== 0) {
                temp.push(fullMatrix[i][j]);
            }
        }
    }
    return temp;
}


/** Конвертирует ордеры формата полученных данных из запроса в формат хранящийся в базе данных */
function convert_binance_orders_to_db_format(orders) {
    var arr = [];
    for (var i = 0; i < orders.length; i++) {
        var obj = {};
        obj.course = parseFloat(orders[i][0]);
        obj.count = parseFloat(orders[i][1]);
        obj.cost = obj.count * obj.course;
        arr.push(obj);
    }
    return arr;
}


/** функция сортирует ордера для sell по убыванию, а для buy по возрастанию */
function sort_orders(orders_, sell = false, buy = false) {
    var orders = orders_;
    if (sell === true) {  //продать (спрашивают), сортируем по убыванию
        orders.sort(function (a, b) {
            if (a.course < b.course) {
                return 1;
            }
            if (a.course > b.course) {
                return -1;
            }
            // a должно быть равным b
            return 0;
        });
    }
    if (buy === true) {   //купить (продают), сортируем по возрастанию        
        orders.sort(function (a, b) {
            if (a.course > b.course) {
                return 1;
            }
            if (a.course < b.course) {
                return -1;
            }
            // a должно быть равным b
            return 0;
        });
    }
    return orders;
}

module.exports.sort_orders = sort_orders;


module.exports.set_orders_for_edges = function (edges, orders) {
    for (var i = 0; i < edges.length; i++) {
        for (var j = 0; j < edges.length; j++) {
            for (var k = 0; k < orders.length; k++) {
                if (edges[i][j].exchange)
                    if (edges[i][j].exchange.market_name === orders[k].market_name) {
                        if (edges[i][j].exchange.sell) {
                            var orders_ = convert_binance_orders_to_db_format(orders[k].bids);
                            orders_ = sort_orders(orders_, true, false);
                            edges[i][j].exchange.orders = orders_;
                        }
                        if (edges[i][j].exchange.buy) {
                            var orders_ = convert_binance_orders_to_db_format(orders[k].asks);
                            orders_ = sort_orders(orders_, false, true);
                            edges[i][j].exchange.orders = orders_;
                        }

                    }
            }
        }
    }
    return edges;
}


/** Функция возвращает точность для price и quantity
 * @param filters [
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
            Возвращает { price_precision: 3, quantity_precision: 5 }

 */
function get_precisions_by_filter(filters) {
    var price_precision = 0;
    var quantity_precision = 0;

    for (var i = 0; i < filters.length; i++) {
        if (filters[i].filterType === "PRICE_FILTER") {
            //Конвертируем строку в float чтобы убрать лишние нули
            var minPriceFloat = parseFloat(filters[i].minPrice);
            //Конвертируем float в строку 
            var minPrice = "" + minPriceFloat;
            if (minPrice.indexOf(".") >= 0) {

                var spl = minPrice.split(".")[1];
                price_precision = spl.length;
            }
        }
        if (filters[i].filterType === "LOT_SIZE") {
            //Конвертируем строку в float чтобы убрать лишние нули
            var minPriceFloat = parseFloat(filters[i].minQty);
            //Конвертируем float в строку 
            var minPrice = "" + minPriceFloat;
            if (minPrice.indexOf(".") >= 0) {
                var spl = minPrice.split(".")[1];
                quantity_precision = spl.length;
            }
        }
    }

    return { price_precision: price_precision, quantity_precision: quantity_precision }
}
module.exports.get_precisions_by_filter = get_precisions_by_filter;


function get_common_by_local(coin_vertexes_id) {
    if (list_vertexs[coin_vertexes_id]) {
        return list_vertexs[coin_vertexes_id].currency_common;
    }
    return S4();
}


/** Функция преобразует список монет, и информация о маркетах в граф связей между монетами
 * 
 * 
 * @param {object} listVertex_ Список используемых монет для биржи {
        currency_local: 'BNB',
        currency_common: 'BNB',
        exchange: "binance",
        balance: 0,
        min_differences_for_operation: 5,
        use_as_bridge_between_exchanges: false,
        wallet_status: true,
        input_wallet_address: "",
        input_min: 0,
        input_max: 0,
        input_fixed_comission: 0,
        input_percent_comission: 0,
        output_min: 0,
        output_max: 0,
        output_fixed_comission: 0,
        output_percent_comission: 0
    },
    ...
   ]
   * @param {object} jsonText Информация по маркетам которую мы получили от сервера
   * {
    "timezone": "UTC",
    "serverTime": 1519455871517,
    "rateLimits": [
        {
            "rateLimitType": "REQUESTS",
            "interval": "MINUTE",
            "limit": 1200
        },
        {
            "rateLimitType": "ORDERS",
            "interval": "SECOND",
            "limit": 10
        },
        {
            "rateLimitType": "ORDERS",
            "interval": "DAY",
            "limit": 100000
        }
    ],
    "exchangeFilters": [],
    "symbols": [
        {
            "symbol": "ETHBTC",
            "status": "TRADING",
            "baseAsset": "ETH",
            "baseAssetPrecision": 8,
            "quoteAsset": "BTC",
            "quotePrecision": 8,
            "orderTypes": [
                "LIMIT",
                "LIMIT_MAKER",
                "MARKET",
                "STOP_LOSS_LIMIT",
                "TAKE_PROFIT_LIMIT"
            ],
            "icebergAllowed": true,
            "filters": [
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
        },
        ...
    ]
}
 */
module.exports.getGraphByJson = function (listVertex_, jsonText) {
    list_vertexs = listVertex_;
    var arr_symbols = jsonText.symbols;
    cur_names_by_market = [];
    fullMatrix = fillMatrix(list_vertexs.length); // заполняем матрицу пустыми значениями

    for (var i = 0; i < arr_symbols.length; i++) {
        var quote_symbol = arr_symbols[i].quoteAsset;
        var base_symbol = arr_symbols[i].baseAsset;

        if (useCurrency(quote_symbol) && useCurrency(base_symbol)) {


            var mCol = getCoinIdByName(quote_symbol);  //колонка матрицы, то есть елемент от которого мы идем
            var mRow = getCoinIdByName(base_symbol); //строка матрицы, то есть елемент к которому мы ссылаемся
            cur_names_by_market.push({ quote_symbol: quote_symbol, base_symbol: base_symbol, market_name: arr_symbols[i].symbol })

            var precisions = get_precisions_by_filter(arr_symbols[i].filters);

            fullMatrix[mRow][mCol] = getEmptyEdge(); //устанавливаем пустое ребро
            fullMatrix[mRow][mCol].exchange.buy = true; //применять операцию умножения
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_local = getCoinNameById(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_local = getCoinNameById(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_common = get_common_by_local(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_common = get_common_by_local(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_exchange = 'binance';
            fullMatrix[mRow][mCol].exchange.end_exchange = 'binance';
            fullMatrix[mRow][mCol].exchange.market_name = arr_symbols[i].symbol;
            fullMatrix[mRow][mCol].exchange.precisions = precisions;



            fullMatrix[mCol][mRow] = getEmptyEdge(); //устанавливаем пустое ребро
            fullMatrix[mCol][mRow].exchange.sell = true; //применять операцию деления
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_local = getCoinNameById(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_local = getCoinNameById(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_common = get_common_by_local(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_common = get_common_by_local(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_exchange = 'binance';
            fullMatrix[mCol][mRow].exchange.end_exchange = 'binance';
            fullMatrix[mCol][mRow].exchange.market_name = arr_symbols[i].symbol;
            fullMatrix[mCol][mRow].exchange.precisions = precisions;
        }
    }
    return { full_matrix: fullMatrix, cur_names_by_market: cur_names_by_market };
}