//Модуль периодически запрашивает данные из биржи livecoin и вносит эти данные в базу данных, если произошла первая загрузка модуля то делаем первичную загрузку данных т. е. добавляем недостающие вершины в общий граф и недостающие ребра в матрицу смежности
const config = require("../config");
const serializeError = require('serialize-error');
var parseBinance = require('./binance_parse');
var binanceApi = require('./binance_api_adapter');
var dateFormat = require('dateformat');
const db = require('monk')(config.mongodb_connection_string);
const edges_and_vertexes = db.get('edges_and_vertexes');
var deepcopy = require("deepcopy");
var equal = require('deep-equal');
// var currencys = require("./binance_currencys");
const currencys_db = db.get('currencys');
const hash = require('js-hash-code');
var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/' + dateFormat(new Date(), "dd_mm_yyyy HH.MM.ss") + '.log', { flags: 'w' });
var log_stdout = process.stdout;









var success_info_list = { update_db: {}, events_by_market: {} };
/*
{
    update_db: {
        "ETH_BTC": {
            buy_update_count:2,
            sell_update_count:4
        }
    },
    events_by_market: {
        "ETH_USD": {
            bids_added: 0,
            bids_updated: 0,
            bids_deleted: 0,
            asks_added: 0,
            asks_updated: 0,
            asks_deleted: 0,
        }
    }
};
*/
var list_edges = [];  //матрица для хранения полного графа может содержать Object либо 0
var list_vertexs = [];
var current_curr_hash = ""; //хеш списка монет, если он сменился то нам необходимо перезагрузить модуль
var last_curr_hash = ""; //предыдущий хеш списка монет
var unused_currencys = []; //Массив с исключаемыми монетами который при изменении мы будем записывать в базу данных
var json = {};
var cur_names_by_market = [];

var second_events_list = {};
var first_load_events = {};   //данные имею вид {ETHBTC: [data1, data2], BCCBTC: [data1, data2] }
var first_load_events_flag = true;  //Если true то все приходящие events необходимо класть в first_load_events


/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
}


function print_success_update_local_events(market, bids_added, bids_updated, bids_deleted, asks_added, asks_updated, asks_deleted) {
    if (!success_info_list.events_by_market[market]) {
        success_info_list.events_by_market[market] = {
            bids_added: 0,
            bids_updated: 0,
            bids_deleted: 0,
            asks_added: 0,
            asks_updated: 0,
            asks_deleted: 0,
        }
    }
    if (bids_added && bids_added > 0)
        success_info_list.events_by_market[market].bids_added += bids_added;
    if (bids_updated && bids_updated > 0)
        success_info_list.events_by_market[market].bids_updated += bids_updated;
    if (bids_deleted && bids_deleted > 0)
        success_info_list.events_by_market[market].bids_deleted += bids_deleted;

    if (asks_added && asks_added > 0)
        success_info_list.events_by_market[market].asks_added += asks_added;
    if (asks_updated && asks_updated > 0)
        success_info_list.events_by_market[market].asks_updated += asks_updated;
    if (asks_deleted && asks_deleted > 0)
        success_info_list.events_by_market[market].asks_deleted += asks_deleted;
}

function print_success_update_db_markets(market, buy, sell) {
    if (!success_info_list.update_db[market]) {
        success_info_list.update_db[market] = {
            buy_update_count: 0,
            sell_update_count: 0
        }
    }
    if (buy) {
        success_info_list.update_db[market].buy_update_count++;
    }
    if (sell) {
        success_info_list.update_db[market].sell_update_count++;
    }
}

// function repeat_print_success() {
//     for (var key in success_info_list.events_by_market) {
//         var obj = success_info_list.events_by_market[key];
//         console.log(get_log_date() + ' [INFO] Events for ' + key + ', bids_added:' + obj.bids_added + ', bids_updated:' + obj.bids_updated + ', bids_deleted:' + obj.bids_deleted + ', asks_added:' + obj.asks_added + ', asks_updated:' + obj.asks_updated + ', asks_deleted:' + obj.asks_deleted);
//     }

//     for (var key in success_info_list.update_db) {
//         var obj = success_info_list.update_db[key];
//         console.log(get_log_date() + ' [INFO] DB updates ' + key + ' for buy: ' + obj.buy_update_count + ", for sell: " + obj.sell_update_count);
//     }
//     success_requests = { update_db: {}, events_by_market: {} };
//     setTimeout(repeat_print_success, config.printing_success_methods_info_interval_for_binance_modules);
// }
// setImmediate(repeat_print_success);




console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};


/** Возвращает название криптовалюты по идентификатору */
function getCoinNameById(id, local = true) {
    var temp = local ? listVertexs[id].currency_local : listVertexs[id].currency_common;
    if (temp)
        return temp;
    else
        return '';
}

/** Возвращает идентификатор криптовалюты по имени */
function getCoinIdByName(name, local = true) {
    for (var i = 0; i < listVertexs.length; i++) {
        if (local)
            if (name === listVertexs[i].currency_local) return i;
            else
                if (name === listVertexs[i].currency_common) return i;
    }
    return -1;
}


/** Функция выполняет выполнения асинхронной программы на заданный промежуток времени */
async function stop_running(time) {
    return await new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, time)
    });
}

/** Функция преобразовывает двумерный массив в одномерный */
function two_dimensial_to_one_dimensional(arr_two) {
    var arr = [];
    for (var i = 0; i < arr_two.length; i++) {
        for (var j = 0; j < arr_two[i].length; j++) {
            arr.push(arr_two[i][j]);
        }
    }
    return arr;
}


/** Возвращает список используемых маркетов по edges (ребрам) */
function get_used_markets_by_edges(edges) {
    var obj = {};
    for (var i = 0; i < edges.length; i++) {
        for (var j = 0; j < edges[i].length; j++) {
            if (edges[i][j].exchange) {
                obj[edges[i][j].exchange.market_name] = 'empty';
            }
        }
    }
    var arr = [];
    for (var key in obj) {
        arr.push(key);
    }
    return arr;
}

/** Преобразует массив ордеров в json */
function get_json_by_orders_array(order_books) {
    var obj = {};
    for (var i = 0; i < order_books.length; i++) {
        obj[order_books[i].market_name] = order_books[i];
    }
    return obj;
}

function get_log_date() {
    return '' + dateFormat(new Date(), "dd.mm.yyyy HH:MM:ss");
}


function add_events_to_second_list(market, event) {
    if (!second_events_list[market].last_u) {
        second_events_list[market].last_u = event.U - 1;
    }
    if ((second_events_list[market].last_u + 1) === event.U) {
        var bids_deleted = 0;
        var bids_updated = 0;
        var bids_added = 0;

        var asks_deleted = 0;
        var asks_updated = 0;
        var asks_added = 0;

        //Проходим по bids event
        for (var k = 0; k < event.b.length; k++) {
            var find_price_level = false;
            //Проходим по bids вторичного списка
            for (var i = 0; i < second_events_list[market].bids.length; i++) {
                var list_item = second_events_list[market].bids[i];
                var event_item = event.b[k];
                //Находим условие если price level одинаковый
                if (parseFloat(list_item[0]) === parseFloat(event_item[0])) {
                    if (parseFloat(event_item[1]) == 0) {
                        //Находим условие если количество равно 0, тогда удаляем элемент из second_events_list
                        second_events_list[market].bids.splice(i, 1);
                        bids_deleted++;
                        find_price_level = true;
                        break;
                    }
                    else {
                        //Если количество не равно 0, тогда заменяем его в списке 
                        second_events_list[market].bids[i][1] = event_item[1];
                        bids_updated++;
                        find_price_level = true;
                        break;
                    }
                }
            }
            //Если текущий price level не найден в ордерах то добавляем его
            if (!find_price_level) {
                second_events_list[market].bids.push(event.b[k]);
                bids_added++;
            }
        }

        //Проходим по asks event
        for (var k = 0; k < event.a.length; k++) {
            var find_price_level = false;
            //Проходим по asks вторичного списка
            for (var i = 0; i < second_events_list[market].asks.length; i++) {
                var list_item = second_events_list[market].asks[i];
                var event_item = event.a[k];
                //Находим условие если price level одинаковый
                if (parseFloat(list_item[0]) === parseFloat(event_item[0])) {
                    if (parseFloat(event_item[1]) == 0) {
                        //Находим условие если количество равно 0, тогда удаляем элемент из second_events_list
                        second_events_list[market].asks.splice(i, 1);
                        asks_deleted++;
                        find_price_level = true;
                        break;
                    }
                    else {
                        //Если количество не равно 0, тогда заменяем его в списке 
                        second_events_list[market].asks[i][1] = event_item[1];
                        asks_updated++;
                        find_price_level = true;
                        break;
                    }
                }
            }
            //Если текущий price level не найден в ордерах то добавляем его
            if (!find_price_level) {
                second_events_list[market].asks.push(event.a[k]);
                asks_added++;
            }
        }
        second_events_list[market].last_u = event.u;
        print_success_update_local_events(market, bids_added, bids_updated, bids_deleted, asks_added, asks_updated, asks_deleted)
    }
    else {
        //Если новый event не отвечает условию 'each new event's U should be equal to the previous event's u+1'
        console.log(get_log_date() + ' [ERROR] Ошибка, пришедший event для маркета ' + market + ' не отвечает условию "each new events U should be equal to the previous events u+1"');
    }
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


function update_market_orders_to_db(market) {

    for (var i = 0; i < list_edges.length; i++) {
        for (var j = 0; j < list_edges[i].length; j++) {
            if (list_edges[i][j].exchange)
                if (list_edges[i][j].exchange.market_name == market) {
                    if (list_edges[i][j].exchange.sell === true) {  //записывать bids
                        var i_ = i;
                        var j_ = j;
                        var orders = parseBinance.sort_orders(convert_binance_orders_to_db_format(second_events_list[market].bids), true, false);
                        //Отсортировали элементы по убыванию, это ордера по которым спрашивают и мы можем продать
                        var market_name = list_edges[i_][j_].exchange.market_name;
                        list_edges[i_][j_].exchange.orders = orders;
                        edges_and_vertexes.update(
                            {
                                "$and": [
                                    { "exchange": "binance" },
                                    { "edges.exchange.sell": true },
                                    { "edges.exchange.market_name": market_name }
                                ]
                            },
                            {
                                $currentDate: {
                                    "last_sync": { $type: "timestamp" }
                                },
                                $inc: {
                                    "version": 1
                                },
                                $set: {
                                    "orders": orders
                                }
                            })
                            .then((val) => {
                                print_success_update_db_markets(list_edges[i_][j_].exchange.market_name, false, true);
                                // console.log(get_log_date() + ' Обновление ордеров в базе для маркета ' + list_edges[i_][j_].exchange.market_name + ' и параметром sell успешно ' + JSON.stringify(val));
                            })
                            .catch((error) => {
                                console.log(get_log_date() + ' [ERROR] Обновление ордеров в базе для маркета ' + list_edges[i_][j_].exchange.market_name + ' и параметром sell произошло с ошибкой  ' + JSON.stringify(error));
                            })

                    }
                    if (list_edges[i][j].exchange.buy === true) {  //записывать asks
                        var i_ = i;
                        var j_ = j;
                        var market_name = list_edges[i_][j_].exchange.market_name;
                        var orders = parseBinance.sort_orders(convert_binance_orders_to_db_format(second_events_list[market].asks), false, true);
                        //Отсортировали элементы по возрастанию, это ордера по которым продают и мы можем купить
                        list_edges[i_][j_].exchange.orders = orders;
                        edges_and_vertexes.update(
                            {
                                "$and": [
                                    { "exchange": "binance" },
                                    { "edges.exchange.buy": true },
                                    { "edges.exchange.market_name": market_name }
                                ]
                            },
                            {
                                $currentDate: {
                                    "last_sync": { $type: "timestamp" }
                                },
                                $inc: {
                                    "version": 1
                                },
                                $set: {
                                    "orders": orders
                                }
                            })
                            .then((val) => {
                                print_success_update_db_markets(list_edges[i_][j_].exchange.market_name, true, false);
                                //console.log(get_log_date() + ' Обновление ордеров в базе для маркета ' + list_edges[i_][j_].exchange.market_name + ' и параметром buy успешно ' + JSON.stringify(val));
                            })
                            .catch((error) => {
                                console.log(get_log_date() + ' [ERROR] Обновление ордеров в базе для маркета ' + list_edges[i_][j_].exchange.market_name + ' и параметром buy произошло с ошибкой  ' + JSON.stringify(error));
                            })
                    }
                }
        }
    }
}


/** Функция сравнивает элементы использумых монет со списком доступных на маркете и возвращает массив недоступных монет 
 * Возвращает массив неиспользуемых монет, упорядоченный по алфавиту ["ARC", "ETH"]
 * 
 * @param uses_currencys         [{
            currency_local: 'CND',  
            currency_common: 'CND',  
            exchange: "binance",
            balance: 0,
            min_differences_for_operation: 5,
            use_as_bridge_between_exchanges: true,
            wallet_status: true,
            input_wallet_address: "",
            input_min: 0,
            input_max: 0,
            input_fixed_comission: 0,
            input_percent_comission: 0,
            output_min: 30,
            output_max: 0,
            output_fixed_comission: 40,
            output_percent_comission: 0
        },
        {
            currency_local: 'QSP',  
            currency_common: 'QSP',  
            exchange: "binance",
            balance: 0,
            min_differences_for_operation: 5,
            use_as_bridge_between_exchanges: true,
            wallet_status: true,
            input_wallet_address: "",
            input_min: 0,
            input_max: 0,
            input_fixed_comission: 0,
            input_percent_comission: 0,
            output_min: 30,
            output_max: 0,
            output_fixed_comission: 40,
            output_percent_comission: 0
        }
]
* @param responce_currency [{
	"id": "10",
	"assetCode": "BNB",
	"assetName": "Binance Coin",
	"unit": "",
	"transactionFee": 0.5,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 20000.0,
	"freeUserChargeAmount": 1.0E7,
	"minProductWithdraw": "1.000000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "30",
	"createTime": null,
	"test": 0,
	"url": "https://etherscan.io/tx/",
	"addressUrl": "https://etherscan.io/address/",
	"blockUrl": "https://etherscan.io/blocks/",
	"enableCharge": true,  //Доступен ли ввод
	"enableWithdraw": true,  //Доступен ли вывод
	"regEx": "^(0x)[0-9A-Fa-f]{40}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "ETH",
	"isLegalMoney": false,
	"reconciliationAmount": 20.0,
	"seqNum": "0",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000497111-%E5%B8%81%E5%AE%89%E5%B8%81-BNB-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000497111-Binance-Coin-BNB-",
	"logoUrl": "/file/resources/img/20170912/image_1505205843840.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": true,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "ETH",
	"feeRate": 0.006,
	"feeDigit": 2,
	"legalMoney": false
 },
 {
	"id": "1",
	"assetCode": "BTC",
	"assetName": "Bitcoin",
	"unit": "฿",
	"transactionFee": 5.0E-4,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 1.0,
	"freeUserChargeAmount": 500.0,
	"minProductWithdraw": "0.002000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "2",
	"createTime": null,
	"test": 0,
	"url": "https://btc.com/",
	"addressUrl": "https://btc.com/",
	"blockUrl": "",
	"enableCharge": true,
	"enableWithdraw": true,
	"regEx": "^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "BTC",
	"isLegalMoney": false,
	"reconciliationAmount": 1.0,
	"seqNum": "1",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000494172-%E6%AF%94%E7%89%B9%E5%B8%81-BTC-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000494172-Bitcoin-BTC-",
	"logoUrl": "/file/resources/img/20170912/image_1505205865716.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": false,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "",
	"feeRate": null,
	"feeDigit": 8,
	"legalMoney": false
 }]
*/
function check_coins_and_get_unavailable(uses_currencys, responce_currencys) {
    //Проходимся по используемым монетам, если монета не обнаруживается в списке возвращаемых сервером то помечаем ее как неиспользуемую
    var unused_currencys = [];
    for (var i = 0; i < uses_currencys.length; i++) {
        var find_flag = false; //пометка о том найденна ли монета в списке вернувшихся от сервера
        for (var k = 0; k < responce_currencys.length; k++) {
            if (uses_currencys[i].currency_local === responce_currencys[k].assetCode) {
                find_flag = true;
                if (responce_currencys[k].enableCharge && responce_currencys[k].enableWithdraw) { //Если достпен ввод и вывод
                }
                else {
                    unused_currencys.push(uses_currencys[i].currency_local); //добавляем монету в список неиспользуемых
                }
            }
        }
        if (!find_flag) {
            unused_currencys.push(uses_currencys[i].currency_local); //добавляем монету в список неиспользуемых
        }
    }
    return unused_currencys;
}



/** Устанавливает комисии вывода для списка монет, и удаляет монеты которых нет в списке возвращаемых сервером
 * Возвращает массив монет uses_currencys но с установленными комиссиями
 * 
 * @param uses_currencys         [{
            currency_local: 'CND',  
            currency_common: 'CND',  
            exchange: "binance",
            balance: 0,
            min_differences_for_operation: 5,
            use_as_bridge_between_exchanges: true,
            wallet_status: true,
            input_wallet_address: "",
            input_min: 0,
            input_max: 0,
            input_fixed_comission: 0,
            input_percent_comission: 0,
            output_min: 30,
            output_max: 0,
            output_fixed_comission: 40,
            output_percent_comission: 0
        },
        {
            currency_local: 'QSP',  
            currency_common: 'QSP',  
            exchange: "binance",
            balance: 0,
            min_differences_for_operation: 5,
            use_as_bridge_between_exchanges: true,
            wallet_status: true,
            input_wallet_address: "",
            input_min: 0,
            input_max: 0,
            input_fixed_comission: 0,
            input_percent_comission: 0,
            output_min: 30,
            output_max: 0,
            output_fixed_comission: 40,
            output_percent_comission: 0
        }
]
*  @param responce_currency [{
	"id": "10",
	"assetCode": "BNB",
	"assetName": "Binance Coin",
	"unit": "",
	"transactionFee": 0.5,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 20000.0,
	"freeUserChargeAmount": 1.0E7,
	"minProductWithdraw": "1.000000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "30",
	"createTime": null,
	"test": 0,
	"url": "https://etherscan.io/tx/",
	"addressUrl": "https://etherscan.io/address/",
	"blockUrl": "https://etherscan.io/blocks/",
	"enableCharge": true,  //Доступен ли ввод
	"enableWithdraw": true,  //Доступен ли вывод
	"regEx": "^(0x)[0-9A-Fa-f]{40}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "ETH",
	"isLegalMoney": false,
	"reconciliationAmount": 20.0,
	"seqNum": "0",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000497111-%E5%B8%81%E5%AE%89%E5%B8%81-BNB-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000497111-Binance-Coin-BNB-",
	"logoUrl": "/file/resources/img/20170912/image_1505205843840.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": true,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "ETH",
	"feeRate": 0.006,
	"feeDigit": 2,
	"legalMoney": false
 },
 {
	"id": "1",
	"assetCode": "BTC",
	"assetName": "Bitcoin",
	"unit": "฿",
	"transactionFee": 5.0E-4,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 1.0,
	"freeUserChargeAmount": 500.0,
	"minProductWithdraw": "0.002000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "2",
	"createTime": null,
	"test": 0,
	"url": "https://btc.com/",
	"addressUrl": "https://btc.com/",
	"blockUrl": "",
	"enableCharge": true,
	"enableWithdraw": true,
	"regEx": "^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "BTC",
	"isLegalMoney": false,
	"reconciliationAmount": 1.0,
	"seqNum": "1",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000494172-%E6%AF%94%E7%89%B9%E5%B8%81-BTC-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000494172-Bitcoin-BTC-",
	"logoUrl": "/file/resources/img/20170912/image_1505205865716.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": false,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "",
	"feeRate": null,
	"feeDigit": 8,
	"legalMoney": false
 }]
 */
function set_comission_by_responce_currency_arr(uses_currencys, responce_currencys) {
    //Проходимся по используемым монетам, если монета не обнаруживается в списке возвращаемых сервером то помечаем ее как неиспользуемую
    for (var i = 0; i < uses_currencys.length; i++) {
        var find_flag = false; //пометка о том найденна ли монета в списке вернувшихся от сервера
        for (var k = 0; k < responce_currencys.length; k++) {
            if (uses_currencys[i].currency_local === responce_currencys[k].assetCode) {
                find_flag = true;
                uses_currencys[i].output_fixed_comission = responce_currencys[k].transactionFee;
            }
        }
    }
    return uses_currencys;
}



/** Функция которая ставит задержку если производится загрузка списка монет, и не разрешится пока монеты не будут загруженны  */
function await_currency_loading() {
    return new Promise((resolve, reject) => {
        if (list_vertexs.length > 0) {
            resolve();
            return;
        }
        var interv = setInterval(() => {
            if (list_vertexs.length > 0) {
                resolve();
                clearInterval(interv);
                return;
            }
        }, 1000);
    })
}


/******************* Функции в которой выполняется наш код ***********************/
/******************* Функции в которой выполняется наш код ***********************/
/******************* Функции в которой выполняется наш код ***********************/

/** Функция которая загружает список монет из базы данных */
var main_loading_currencys_from_db = async () => {
    try {
        var currencys = await currencys_db.find({ "exchange": "binance" });
        current_curr_hash = hash(currencys[0].currencys);
        last_curr_hash = last_curr_hash === "" ? current_curr_hash : last_curr_hash; //Если мы установили хеш первый раз то установим его значение равное текущему
        list_vertexs = currencys[0].currencys;
        setTimeout(main_loading_currencys_from_db, config.update_module_currency_from_db_interval);
    }
    catch (e) {
        console.log(get_log_date() + " [ERROR] Ошибка загрузки монет из базы данных " + stringify_error(e));
        setTimeout(main_loading_currencys_from_db, config.update_module_currency_from_db_interval);
    }
}
setImmediate(main_loading_currencys_from_db);


/** Функция в которой постоянно проверяются доступные используемые монеты, и если монета не доступна для ввода или вывода, тогда массив с исключаемыми монетами записывается в базу данных*/
var main_check_available_currencys = async () => {
    try {
        await await_currency_loading(); //устанавливает ожидание если монеты еще не загруженны
        var unused_curr = [];
        var coin_array = await binanceApi.get_coin_info();
        if (coin_array && coin_array.length > 0) {
            unused_curr = check_coins_and_get_unavailable(list_vertexs, coin_array);
        }
        if (!equal(unused_curr, unused_currencys)) {
            await edges_and_vertexes.update({ "exchange": "binance" }, { $set: { "exclude_exchanges_currencys": unused_curr } })
                .then((val) => {
                    console.log(get_log_date() + ' [INFO] Обновление списка неиспользуемых для ввода и вывода монет для маркета binance успешно ' + JSON.stringify(unused_curr));
                    unused_currencys = unused_curr;
                })
                .catch((error) => {
                    console.log(get_log_date() + ' [ERROR] Ошибка обновления в базе списка неиспользуемых для ввода и вывода монет ' + stringify_error(error));
                })
        }
    }
    catch (e) {
        console.log(get_log_date() + " [ERROR] Произошла ошибка загрузки доступных монет: " + stringify_error(e));
    }
    setTimeout(main_check_available_currencys, 90000);
}
setImmediate(main_check_available_currencys);


/** Главная функция в которой выполняется весь основной код */
var main = async () => {
    try {
        second_events_list = {};
        first_load_events = {};
        first_load_events_flag = true;
        cur_names_by_market = [];

        //Загрузка первичных данных
        while (true) {
            await await_currency_loading(); //устанавливает ожидание если монеты еще не загруженны
            var reload_error = null;
            var responce_currencys = await binanceApi.get_coin_info();
            list_vertexs = set_comission_by_responce_currency_arr(list_vertexs, responce_currencys);

            await binanceApi.get_exchange_info()
                .then(async (val) => {
                    var parse_value = parseBinance.getGraphByJson(list_vertexs, val);
                    var list_edges_without_orders = parse_value.full_matrix;
                    // cur_names_by_market = parse_value.cur_names_by_market;
                    var markets = get_used_markets_by_edges(list_edges_without_orders);
                    await binanceApi.get_order_books(markets, 50)
                        .then(async (orders) => {
                            list_edges = parseBinance.set_orders_for_edges(list_edges_without_orders, orders);
                            await edges_and_vertexes.update({ "exchange": "binance" }, {
                                $currentDate: {
                                    "last_sync": { $type: "timestamp" }
                                },
                                $inc: {
                                    "version": 1
                                },
                                $set: {
                                    "edges": two_dimensial_to_one_dimensional(list_edges),
                                    "vertexes": list_vertexs
                                }
                            })
                                .then((val) => {
                                    console.log(get_log_date() + ' [INFO] Успешная запись в базу ', val);
                                })
                                .catch((error) => {
                                    console.log(get_log_date() + ' [ERROR] Ошибка записи в базу: ' + stringify_error(error));
                                    reload_error = error;
                                })

                        })
                        .catch((error) => {
                            console.log(get_log_date() + ' [ERROR] Ошибка загрузки списка ордеров: ' + stringify_error(error));
                            reload_error = error;
                        })
                })
                .catch(async (error) => {
                    console.log(get_log_date() + ' [ERROR] Ошибка загрузки списка маркетов: ' + stringify_error(error));
                    reload_error = error;
                })
            if (!reload_error) {
                console.log(get_log_date() + ' [INFO] Первичная загрузка данных с binance успешна');
                break;
            }
            else {
                console.log(get_log_date() + ' [ERROR] Ошибка первичной загрузки данных с binance');
                throw reload_error;
            }
        }





        //Постоянная
        while (true) {
            var reload_error = null;
            if (current_curr_hash !== last_curr_hash) {
                last_curr_hash = current_curr_hash;
                throw new Error("Был обновлен список монет");
            }
            var markets = get_used_markets_by_edges(list_edges);
            await binanceApi.get_order_books(markets, 100)
                .then(async (orders) => {
                    list_edges = parseBinance.set_orders_for_edges(list_edges, orders);
                    await edges_and_vertexes.update({ "exchange": "binance" }, {
                        $currentDate: {
                            "last_sync": { $type: "timestamp" }
                        },
                        $inc: {
                            "version": 1
                        },
                        $set: {
                            "edges": two_dimensial_to_one_dimensional(list_edges),
                            "vertexes": list_vertexs
                        }
                    })
                        .then((val) => {
                            console.log(get_log_date() + ' [INFO] Успешная запись в базу ', val);
                        })
                        .catch((error) => {
                            console.log(get_log_date() + ' [ERROR] Ошибка записи в базу: ' + stringify_error(error));
                            reload_error = error;
                        })

                })
                .catch((error) => {
                    console.log(get_log_date() + ' [ERROR] Ошибка загрузки списка ордеров: ' + stringify_error(error));
                    reload_error = error;
                })

            if (!reload_error) {
                // console.log(get_log_date() + ' [INFO] Первичная загрузка данных с binance успешна');
                // break;
            }
            else {
                console.log(get_log_date() + ' [ERROR] Ошибка загрузки данных с binance');
                throw reload_error;
            }
        }
    }
    catch (e) {
        console.log(get_log_date() + ' [ERROR] Произошла ошибка в выполнении программы, модуль будет перезапущен: ' + stringify_error(e));
        setTimeout(main, 5000);
    }
}
main();



