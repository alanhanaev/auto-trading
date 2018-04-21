const config = require("../config");
var parseExmo = require('./exmo_parse');
var exmoApi = require('./exmo_api_adapter');
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
var unused_currencys = []; //Массив с исключаемыми монетами который при изменении мы будем записывать в базу данных


function get_log_date() {
    return '' + dateFormat(new Date(), "dd.mm.yyyy HH:MM:ss");
}

console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};

/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
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


/******************* Функция в которой выполняется наш код ***********************/
/******************* Функция в которой выполняется наш код ***********************/
/******************* Функция в которой выполняется наш код ***********************/


/** Функция которая загружает список монет из базы данных */
var main_loading_currencys_from_db = async () => {
    try {
        var currencys = await currencys_db.find({ "exchange": "exmo" });
        current_curr_hash = hash(currencys[0].currencys);
        last_curr_hash = last_curr_hash === "" ? current_curr_hash : last_curr_hash; //Если мы установили хеш первый раз то установим его значение равное текущему
        list_vertexs = currencys[0].currencys;
        setTimeout(main_loading_currencys_from_db, config.update_module_currency_from_db_interval);
    }
    catch (e) {
        console.log(get_log_date()+" [ERROR] Ошибка загрузки монет из базы данных " + stringify_error(e));
        setTimeout(main_loading_currencys_from_db, config.update_module_currency_from_db_interval);
    }

}
setImmediate(main_loading_currencys_from_db);




var main = async () => {
    try {

        await await_currency_loading(); //устанавливает ожидание если монеты еще не загруженны

        var reload_error = null;  //если сюда записывется ошибка то модуль перезагружается
        var markets = [];

        //Загружаем пары криптовалют и создаем для них ребра
        var pairs = await exmoApi.get_pair_settings();
        if (pairs.success) {
            list_edges = parseExmo.getGraphByJson(list_vertexs, pairs.value);
            markets = get_used_markets_by_edges(list_edges);
        }
        else {
            throw new Error(pairs.error_msg);
        }


        //загружаем ордеры и записываем их к ребрам
        var orders = await exmoApi.get_order_books(markets, 80);
        if (orders.success) {
            list_edges = parseExmo.set_orders_to_edges(list_edges, orders.value);
        }
        else {
            throw new Error(orders.error_msg);
        }




        while (true) {
            if (current_curr_hash !== last_curr_hash) {
                last_curr_hash = current_curr_hash;
                throw new Error("Был обновлен список монет");
            }
            //загружаем ордеры и записываем их к ребрам
            var orders = await exmoApi.get_order_books(markets, 80);
            if (orders.success) {
                list_edges = parseExmo.set_orders_to_edges(list_edges, orders.value);
            }
            else {
                throw new Error(orders.error_msg);
            }

            var db_res = await edges_and_vertexes.update({ "exchange": "exmo" }, {
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
            if (db_res) {
                console.log(get_log_date() + ' [INFO] Успешная запись в базу ', JSON.stringify(db_res));
            }
            else {
                console.log(get_log_date() + ' [ERROR] Ошибка записи в базу ', JSON.stringify(db_res));
                throw new Error(JSON.stringify(db_res));
            }
        }
    }
    catch (e) {
    console.log(get_log_date() + ' [ERROR] Произошла ошибка в выполнении программы либо был обновлен список монет, модуль будет перезапущен: ' + stringify_error(e));
    setTimeout(main, 5000);
}
}

main();