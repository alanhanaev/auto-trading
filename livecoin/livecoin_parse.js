var markets_precision= require("./livecoin_markets_info");


var fullMatrix = []; //полная матрица
var list_vertexs = []; //список соответствий номер в массиве номерам вершин к криптовалютам

/** Функция возвращает пустую вершину полного графа */


function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

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
            start_exchange: "livecoin",
            //идентификатор биржи откуда идет транзакция
            end_exchange: "livecoin"
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

//  [
//     [
//         "206.35000000",
//         "42.00000000"
//     ],
//     [
//         "206.40000000",
//         "16.00000000"
//     ]
// ]
// формат базы данных [
//     {
//         cost: 1.22,
//         count: 0.005
//     },
//     {
//         cost: 1.22,
//         count: 0.005
//     }
// ]


/** Конвертирует ордеры формата полученных данных из запроса в формат хранящийся в базе данных */
function convert_livecoin_orders_to_db_format(orders) {
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
    if (sell=== true) {  //продать (спрашивают), сортируем по убыванию
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

function get_common_by_local(coin_vertexes_id) {
    if (list_vertexs[coin_vertexes_id]) {
        return list_vertexs[coin_vertexes_id].currency_common;
    }
    return S4();
}



module.exports.getGraphByJson = function (listVertex_, jsonText) {
    list_vertexs = listVertex_;
    var obj = jsonText;
    fullMatrix = fillMatrix(list_vertexs.length); // заполняем матрицу пустыми значениями

    for (var key in obj) {
        var split_symbols = key.split('/');
        var quote_symbol = split_symbols[1];
        var base_symbol = split_symbols[0];

        if (useCurrency(quote_symbol) && useCurrency(base_symbol)) {

            var bid_orders = obj[key].bids;
            var ask_orders = obj[key].asks;

            var mCol = getCoinIdByName(quote_symbol);  //колонка матрицы, то есть елемент от которого мы идем
            var mRow = getCoinIdByName(base_symbol); //строка матрицы, то есть елемент к которому мы ссылаемся



            fullMatrix[mRow][mCol] = getEmptyEdge(); //устанавливаем пустое ребро
            fullMatrix[mRow][mCol].exchange.orders = sort_orders(convert_livecoin_orders_to_db_format(ask_orders), false, true);  //это курс за который мы можем продать
            fullMatrix[mRow][mCol].exchange.buy = true; //применять операцию умножения
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_local = getCoinNameById(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_local = getCoinNameById(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_vertex_currency_common = get_common_by_local(mCol); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.end_vertex_currency_common = get_common_by_local(mRow); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mRow][mCol].exchange.start_exchange = 'livecoin';
            fullMatrix[mRow][mCol].exchange.end_exchange = 'livecoin';
            fullMatrix[mRow][mCol].exchange.market_name = key;
            fullMatrix[mRow][mCol].exchange.precisions = markets_precision.market_precisions[key];


            fullMatrix[mCol][mRow] = getEmptyEdge(); //устанавливаем пустое ребро
            fullMatrix[mCol][mRow].exchange.orders = sort_orders(convert_livecoin_orders_to_db_format(bid_orders), true, false); //это курс за который мы можем купить
            fullMatrix[mCol][mRow].exchange.sell = true; //применять операцию деления
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_local = getCoinNameById(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_local = getCoinNameById(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_vertex_currency_common = get_common_by_local(mRow); //откуда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.end_vertex_currency_common = get_common_by_local(mCol); //куда идет ребро, в будущем можно удалить это для упрощения чтения данных
            fullMatrix[mCol][mRow].exchange.start_exchange = 'livecoin';
            fullMatrix[mCol][mRow].exchange.end_exchange = 'livecoin';
            fullMatrix[mCol][mRow].exchange.market_name = key;
            fullMatrix[mCol][mRow].exchange.precisions = markets_precision.market_precisions[key];
        }
    }
    return fullMatrix;
}