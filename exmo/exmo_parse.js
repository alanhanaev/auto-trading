
var fullMatrix = []; //полная матрица
var list_vertexs = []; //список соответствий номер в массиве номерам вершин к криптовалютам

/** Функция возвращает пустую вершину полного графа */


function getEmptyEdge() {
    return {
        exchange: {  //Ребро в пределах одной биржи
            percent_comission: 0.002,
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
            start_exchange: "exmo",
            //идентификатор биржи откуда идет транзакция
            end_exchange: "exmo"
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
function getCoinLocalNameById(id) {
    var temp = list_vertexs[id].currency_local;
    if (temp)
        return temp;
    else
        return '';
}

/** Возвращает название криптовалюты по идентификатору */
function getCoinCommonNameById(id) {
    var temp = list_vertexs[id].currency_common;
    if (temp)
        return temp;
    else
        return '';
}

/** Возвращает идентификатор криптовалюты по имени */
function getCoinIdByLocalName(name) {
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


/** Конвертирует ордеры формата полученных данных из запроса в формат хранящийся в базе данных 
 * @param orders [[100,1,100],[200,2,400]],  //ask - список ордеров на продажу, где каждая строка это цена, количество и сумма
*/
function convert_exmo_orders_to_db_format(orders) {
    var arr = [];
    for (var i = 0; i < orders.length; i++) {
        var obj = {};
        obj.course = parseFloat(orders[i][0]);
        obj.count = parseFloat(orders[i][1]);
        obj.cost = parseFloat(orders[i][2]);
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




/** Функция строит граф по вершинам и списку криптовалютных пар
 * 
 * @param listVertex_ [{
            "currency_local" : "EUR",
            "currency_common" : "EUR",
            "exchange" : "exmo",
            "transaction_amount" : 85,
            "use_as_bridge_between_exchanges" : false,
            "input_min" : 0,
            "input_max" : 0,
            "input_fixed_comission" : 0,
            "input_percent_comission" : 0,
            "output_min" : 0,
            "output_max" : 0,
            "output_fixed_comission" : 0,
            "output_percent_comission" : 0,
            "description" : "",
            "min_transaction_amount" : 25
        }, 
        {
            "currency_local" : "BTC",
            "currency_common" : "BTC",
            "exchange" : "exmo",
            "transaction_amount" : 0.01296944528385,
            "use_as_bridge_between_exchanges" : true,
            "input_min" : 0.001,
            "input_max" : 0,
            "input_fixed_comission" : 0,
            "input_percent_comission" : 0,
            "output_min" : 0.01,
            "output_max" : 0,
            "output_fixed_comission" : 0.0005,
            "output_percent_comission" : 0,
            "description" : "",
            "min_transaction_amount" : 0.00389083358515
        }, ]
@param jsonText {
   "BTC_USD":{"min_quantity":"0.001","max_quantity":"100","min_price":"1","max_price":"30000","max_amount":"200000","min_amount":"1"},
   "BTC_EUR":{"min_quantity":"0.001","max_quantity":"100","min_price":"1","max_price":"30000","max_amount":"200000","min_amount":"1"},
   "BTC_RUB":{"min_quantity":"0.001","max_quantity":"100","min_price":"1","max_price":"2000000","max_amount":"12000000","min_amount":"10"}
 }
*/
module.exports.getGraphByJson = function (listVertex_, jsonText) {
    list_vertexs = listVertex_;
    var obj = jsonText;
    fullMatrix = fillMatrix(list_vertexs.length); // заполняем матрицу пустыми значениями

    for (var key in obj) {
        var split_symbols = key.split('_');
        var quote_symbol = split_symbols[1];
        var base_symbol = split_symbols[0];

        if (useCurrency(quote_symbol) && useCurrency(base_symbol)) {

            // var bid_orders = obj[key].bids;
            // var ask_orders = obj[key].asks;

            var mCol = getCoinIdByLocalName(quote_symbol);  //колонка матрицы, то есть елемент от которого мы идем
            var mRow = getCoinIdByLocalName(base_symbol); //строка матрицы, то есть елемент к которому мы ссылаемся



            fullMatrix[mRow][mCol] = getEmptyEdge(); //устанавливаем пустое ребро
            // fullMatrix[mRow][mCol].exchange.orders = sort_orders(convert_livecoin_orders_to_db_format(ask_orders), false, true);  //это курс за который мы можем продать
            fullMatrix[mRow][mCol].exchange.buy = true; //применять операцию умножения, т. е. мы продаем
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_local = getCoinLocalNameById(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_local = getCoinLocalNameById(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_common = getCoinCommonNameById(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_common = getCoinCommonNameById(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_exchange = 'exmo';
            fullMatrix[mRow][mCol].exchange.end_exchange = 'exmo';
            fullMatrix[mRow][mCol].exchange.market_name = key;
            fullMatrix[mRow][mCol].exchange.precisions = { price_precision: 8, quantity_precision: 8 };


            fullMatrix[mCol][mRow] = getEmptyEdge(); //устанавливаем пустое ребро
            // fullMatrix[mCol][mRow].exchange.orders = sort_orders(convert_livecoin_orders_to_db_format(bid_orders), true, false); //это курс за который мы можем купить
            fullMatrix[mCol][mRow].exchange.sell = true; //применять операцию деления. т.е. мы покупаем
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_local = getCoinLocalNameById(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_local = getCoinLocalNameById(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_common = getCoinCommonNameById(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_common = getCoinCommonNameById(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_exchange = 'exmo';
            fullMatrix[mCol][mRow].exchange.end_exchange = 'exmo';
            fullMatrix[mCol][mRow].exchange.market_name = key;
            fullMatrix[mCol][mRow].exchange.precisions = { price_precision: 8, quantity_precision: 8 };
        }
    }
    return fullMatrix;
}



/**
 * Функция устанавливает ордеры для ребер
 * @param {*} edges_matrix [
 *  [0, {exchange: {...}}],
 *  [{exchange: {...}}, 0]
 * ]
 * @param {*} orders {
         "BTC_USD": {
            "ask_quantity": "3",
            "ask_amount": "500",
            "ask_top": "100",
            "bid_quantity": "1",
            "bid_amount": "99",
            "bid_top": "99",
            "ask": [[100,1,100],[200,2,400]],  //ask - список ордеров на продажу, где каждая строка это цена, количество и сумма
            "bid": [[99,1,99]]  //bid - список ордеров на покупку, где каждая строка это цена, количество и сумма
        },
        "ETH_USD": {
            "ask_quantity": "3",
            "ask_amount": "500",
            "ask_top": "100",
            "bid_quantity": "1",
            "bid_amount": "99",
            "bid_top": "99",
            "ask": [[100,1,100],[200,2,400]],  //ask - список ордеров на продажу, где каждая строка это цена, количество и сумма
            "bid": [[99,1,99]] //bid - список ордеров на покупку, где каждая строка это цена, количество и сумма
        }
    }
 */
module.exports.set_orders_to_edges = (edges, orders) => {
    for (var i = 0; i < edges.length; i++) {
        for (var j = 0; j < edges.length; j++) {

            if (edges[i][j].exchange) {
                if (edges[i][j].exchange.sell) {
                    var asks = orders[edges[i][j].exchange.market_name].bid;
                    var orders_ = convert_exmo_orders_to_db_format(asks);
                    orders_ = sort_orders(orders_, true, false);
                    edges[i][j].exchange.orders = orders_;
                }
                if (edges[i][j].exchange.buy) {
                    var bids = orders[edges[i][j].exchange.market_name].ask;
                    var orders_ = convert_exmo_orders_to_db_format(bids);
                    orders_ = sort_orders(orders_, false, true);
                    edges[i][j].exchange.orders = orders_;
                }

            }

        }
    }
    return edges;
}