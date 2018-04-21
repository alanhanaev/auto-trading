//Модуль периодически запрашивает данные из биржи livecoin и вносит эти данные в базу данных, если произошла первая загрузка модуля то делаем первичную загрузку данных т. е. добавляем недостающие вершины в общий граф и недостающие ребра в матрицу смежности
const config = require("../config");
var parseLivecoin = require('./livecoin_parse');
var livecoinApi = require('./livecoin_api_adapter');
var fs = require("fs");
const db = require('monk')(config.mongodb_connection_string);
const edges_and_vertexes = db.get('edges_and_vertexes');
var dateFormat = require('dateformat');
var deepcopy = require("deepcopy");
var equal = require('deep-equal');
// var currencys = require("./livecoin_currencys");
const currencys_db = db.get('currencys');
const hash = require('js-hash-code');
const serializeError = require('serialize-error');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/' + dateFormat(new Date(), "dd_mm_yyyy HH.MM.ss") + '.log', { flags: 'w' });
var log_stdout = process.stdout;


var list_edges = [];  //матрица для хранения полного графа может содержать Object либо 0
var list_vertexs = [];
var current_curr_hash = ""; //хеш списка монет, если он сменился то нам необходимо перезагрузить модуль
var last_curr_hash = ""; //предыдущий хеш списка монет
var json = {};
var unused_currencys = []; //Массив с исключаемыми монетами который при изменении мы будем записывать в базу данных


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

/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
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
*  @param responce_currency [
        {
            "name": "MaidSafeCoin",
            "symbol": "MAID",
            "walletStatus": "normal",
            "withdrawFee": 2,
            "minDepositAmount": 10,
            "minWithdrawAmount": 1
        },
        {
            "name": "Bitcoin",
            "symbol": "BTC",
            "walletStatus": "down",
            "withdrawFee": 0.0004,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.002
        },
        {
            "name": "Litecoin",
            "symbol": "LTC",
            "walletStatus": "down",
            "withdrawFee": 0.0001,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.01
        },
        {
            "name": "Emercoin",
            "symbol": "EMC",
            "walletStatus": "normal",
            "withdrawFee": 0.01,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.2
        },
        {
            "name": "Dash",
            "symbol": "DASH",
            "walletStatus": "down",
            "withdrawFee": 0.0001,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.01
        }
    ]
 */
function set_comission_by_responce_currency_arr(uses_currencys, responce_currencys) {
    //Проходимся по используемым монетам, если монета не обнаруживается в списке возвращаемых сервером то помечаем ее как неиспользуемую
    for (var i = 0; i < uses_currencys.length; i++) {
        var find_flag = false; //пометка о том найденна ли монета в списке вернувшихся от сервера
        for (var k = 0; k < responce_currencys.length; k++) {
            if (uses_currencys[i].currency_local === responce_currencys[k].symbol) {
                if (responce_currencys[k].symbol === "DASH") {
                    var t = 9;
                }
                find_flag = true;
                uses_currencys[i].output_fixed_comission = responce_currencys[k].withdrawFee;
            }
        }
    }
    return uses_currencys;
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
* @param responce_currency [
        {
            "name": "MaidSafeCoin",
            "symbol": "MAID",
            "walletStatus": "normal",
            "withdrawFee": 2,
            "minDepositAmount": 10,
            "minWithdrawAmount": 1
        },
        {
            "name": "Bitcoin",
            "symbol": "BTC",
            "walletStatus": "down",
            "withdrawFee": 0.0004,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.002
        },
        {
            "name": "Litecoin",
            "symbol": "LTC",
            "walletStatus": "down",
            "withdrawFee": 0.0001,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.01
        },
        {
            "name": "Emercoin",
            "symbol": "EMC",
            "walletStatus": "normal",
            "withdrawFee": 0.01,
            "minDepositAmount": 0,
            "minWithdrawAmount": 0.2
        }]
*/
function check_coins_and_get_unavailable(uses_currencys, responce_currencys) {
    //Проходимся по используемым монетам, если монета не обнаруживается в списке возвращаемых сервером то помечаем ее как неиспользуемую
    var unused_currencys = [];
    for (var i = 0; i < uses_currencys.length; i++) {
        var find_flag = false; //пометка о том найденна ли монета в списке вернувшихся от сервера
        for (var k = 0; k < responce_currencys.length; k++) {
            if (uses_currencys[i].currency_local === responce_currencys[k].symbol) {
                find_flag = true;
                if (responce_currencys[k].walletStatus === "normal") { //Если достпен ввод и вывод
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




/******************* Функция в которой выполняется наш код ***********************/
/******************* Функция в которой выполняется наш код ***********************/
/******************* Функция в которой выполняется наш код ***********************/


/** Функция которая загружает список монет из базы данных */
var main_loading_currencys_from_db = async () => {
    try {
        var currencys = await currencys_db.find({ "exchange": "livecoin" });
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
        var get_coin_info = await livecoinApi.get_coin_info();
        if (get_coin_info && get_coin_info.success) {
            unused_curr = check_coins_and_get_unavailable(list_vertexs, get_coin_info.info);
        }
        if (!equal(unused_curr, unused_currencys)) {
            await edges_and_vertexes.update({ "exchange": "livecoin" }, { $set: { "exclude_exchanges_currencys": unused_curr } })
                .then((val) => {
                    console.log(get_log_date() + ' [INFO] Обновление списка неиспользуемых для ввода и вывода монет для маркета livecoin успешно ' + JSON.stringify(unused_curr));
                    unused_currencys = unused_curr;
                })
                .catch((error) => {
                    console.log(get_log_date() + ' [ERROR] Ошибка обновления в базе списка неиспользуемыхдля ввода и вывода монет:' + stringify_error(error));
                })
        }
    }
    catch (e) {
        console.log(get_log_date() + " [ERROR] Произошла ошибка загрузки доступных монет: " + stringify_error(e));
    }
    setTimeout(main_check_available_currencys, 60000);
}
setImmediate(main_check_available_currencys);



var main = async () => {
    try {
        while (true) {
            await await_currency_loading(); //устанавливает ожидание если монеты еще не загруженны
            var get_coin_info = await livecoinApi.get_coin_info();
            if (get_coin_info && get_coin_info.success) {
                list_vertexs = set_comission_by_responce_currency_arr(list_vertexs, get_coin_info.info);
            }
            else {
                throw new Error(get_log_date() + " [ERROR] Ошибка загрузки или установки комиссий для монет")
            }


            var reload_error = null;  //если сюда записывется ошибка то модуль перезагружается
            var markets = [];
            await livecoinApi.get_all_order_books()
                .then(async (all_orders_books_json) => {
                    list_edges = parseLivecoin.getGraphByJson(list_vertexs, all_orders_books_json);
                    markets = get_used_markets_by_edges(list_edges);
                    await edges_and_vertexes.update({ "exchange": "livecoin" }, {
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
                });
            if (!reload_error) {
                console.log(get_log_date() + ' [INFO] Первичная загрузка данных с livecoin успешна');
                break;
            }
            else {
                console.log(get_log_date() + ' [ERROR] Ошибка первичной загрузки данных с livecoin');
                throw reload_error;
            }
        }


        while (true) {
            if (current_curr_hash !== last_curr_hash) {
                last_curr_hash = current_curr_hash;
                throw new Error("Был обновлен список монет");
            }
            await livecoinApi.get_order_books(markets, 150)
                .then(async (order_books_array) => {
                    var orders_books_json = get_json_by_orders_array(order_books_array);
                    list_edges = parseLivecoin.getGraphByJson(list_vertexs, orders_books_json);
                    await edges_and_vertexes.update({ "exchange": "livecoin" }, {
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
                            //throw (new Error("Ошибочка для перезапуска модуля"));
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
            if (reload_error) {
                throw reload_error;
            }
        }
    }
    catch (e) {
        console.log(get_log_date() + ' [ERROR] Произошла ошибка в выполнении программы либо был обновлен список монет, модуль будет перезапущен: ' + stringify_error(e));
        setTimeout(main, 5000);
    }
}

main();