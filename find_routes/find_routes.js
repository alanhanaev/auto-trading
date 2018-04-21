const config = require("./../config");
const db = require('monk')(config.mongodb_connection_string);
var api = require('./../execute_routes/common_api_adapter');
const edges_and_vertexes = db.get('edges_and_vertexes');
const taks_collection = db.get('tasks');
const settings_collection = db.get('settings');
var findRoutes = require('./findRoutes'); //модуль для расчета циклов в графе
var calculateRoutes = require('./calculateRoutes');
var deepcopy = require("deepcopy");
const prettyMs = require('pretty-ms');
var equal = require('deep-equal');
const axios = require("axios");
var dateFormat = require('dateformat');
var amqp = require('amqplib/callback_api');
var fs = require('fs');
const serializeError = require('serialize-error');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/routes_' + get_log_date() + '.log', { flags: 'w' });
var log_stdout = process.stdout;


var fullMatrix = [];
var vertexes = [];
var max_edges = 7; //ограничение на максимальное количество ребер
var max_bridge = 2; //ограничение на максимальное количество переходов между двумя биржами
var start_not_end = true;  //стартовая биржа не равна конечной
var exclude_currencys = []; //[{ exchange: "livecoin", currency_local: "NEO" }]
var last_console_message = "";
var last_telegram_message = ""; //Последнее отправленное в телеграм сообщение, записываем его чтобы нас не заспамило одинаковыми сообщениями

//Динамические настройки, которые постоянно обновляются
var min_percent_profit_by_task = 2;
var max_percent_profit_by_task = 30;
var enable_finding_routes = false;
var max_exchange_sync_time = 40000; //максимальное время последней синхронизации модуля биржи (миллисекунды)
var update_settings_interval=60000;


console.log = function (d) {
    var text = util.format(d);
    if (text !== last_console_message) {
        log_file.write(get_log_date() + " " + text + '\n');
        log_stdout.write(get_log_date() + " " + text + '\n');
        last_console_message = text;
    }
};

/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
}


function get_log_date(date) {
    if (date) {
        return '' + dateFormat(date, "dd.mm.yyyy HH.MM.ss");
    }
    else {
        return '' + dateFormat(new Date(), "dd.mm.yyyy HH.MM.ss");
    }
}

function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

function guid_() {
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

function fillMatrix(n) {
    var tempMatrix = [];
    for (var i = 0; i < n; i++) {
        tempMatrix.push([]);
        for (var j = 0; j < n; j++) {
            tempMatrix[i].push(0);
        }
    }
    return tempMatrix;
}


/** Функция вовращает легкую матрицу по полной*/
function fullToLightMatrix(matrix) {
    var n = matrix.length;
    var tempMatrix = [];
    for (var i = 0; i < n; i++) {
        var row = [];
        for (var j = 0; j < n; j++) {
            if (matrix[i][j] === 0)
                row.push(0);
            else
                row.push(1);
        }
        tempMatrix.push(row);
    }
    return tempMatrix;
}


function getEmptyEdgeBetweenExchanges() {  //пустое ребро между двумя биржами
    return {
        exchanges: {
            start_vertex_currency_id: 0,
            //id валюты в массиве vertexes откуда идет транзакция
            end_vertex_currency_id: 0,
            //id валюты в массиве vertexes куда идет транзакции
            start_vertex_currency_local: "USD",
            //идентификатор валюты откуда идет транзакция
            end_vertex_currency_local: "DASH",
            //id валюты в массиве vertexes куда идет транзакции
            start_vertex_currency_common: "USD",
            //идентификатор валюты откуда идет транзакция
            end_vertex_currency_common: "DASH",
            //идентификатор валюты куда идет транзакции
            start_exchange: "livecoin",
            //идентификатор биржи откуда идет транзакция
            end_exchange: "livecoin",
            //идентификатор биржи куда идет транзакции
            start_fixed_comission: 0,
            //фиксированная комиссия вывода
            start_percent_comission: 0,
            //процентная комиссия вывода
            start_min: 0,
            //минимальное количество вывода
            start_max: 0,
            //максимальная комиссия вывода
            end_fixed_comission: 0,
            //фиксированная комиссия ввода
            end_percent_comission: 0,
            //процентная комиссия ввода
            end_min: 0,
            //минимальное количество ввода
            end_max: 0,
            //максимальная комиссия ввода
            use_as_bridge_between_exchanges: true
            //разрешенна ли операция, так как может быть запрет использовать между биржами
        }
    }
}


function joinFullMatrixesAndVertexes(vertexes_array, matrix_edges_array) {
    //****** Соединяем вершины *******
    vertexes = [];
    for (var i = 0; i < vertexes_array.length; i++) {
        vertexes = vertexes.concat(vertexes_array[i]);
    }

    //****** Соединяем ребра *******
    //заполняем пустыми элементами
    var n = 0;
    for (var i = 0; i < matrix_edges_array.length; i++) {  //определяем в цикле размерность
        n = n + matrix_edges_array[i].length;
    }
    fullMatrix = fillMatrix(n);

    //заполняем элементами
    var offset = 0;
    for (var k = 0; k < matrix_edges_array.length; k++) {
        for (var i = 0; i < matrix_edges_array[k].length; i++) {
            for (var j = 0; j < matrix_edges_array[k].length; j++) {
                fullMatrix[i + offset][j + offset] = matrix_edges_array[k][i][j];
            }
        }
        offset = offset + matrix_edges_array[k].length;
    }

    //Находим пути между биржами и соединяем их
    for (var i = 0; i < vertexes.length; i++) {
        for (var j = i; j < vertexes.length; j++) {
            if (vertexes[i].exchange !== vertexes[j].exchange) {  //если вершины находятся на разных биржах

                if ((vertexes[i].currency_common === vertexes[j].currency_common)) {  //если вершины совпадают
                    fullMatrix[i][j] = getEmptyEdgeBetweenExchanges();
                    fullMatrix[j][i] = getEmptyEdgeBetweenExchanges();
                    //ребро в одну сторону
                    fullMatrix[j][i].exchanges.start_exchange = vertexes[i].exchange;
                    fullMatrix[j][i].exchanges.end_exchange = vertexes[j].exchange;
                    fullMatrix[j][i].exchanges.start_vertex_currency_local = vertexes[i].currency_local;
                    fullMatrix[j][i].exchanges.end_vertex_currency_local = vertexes[j].currency_local;
                    fullMatrix[j][i].exchanges.start_vertex_currency_common = vertexes[i].currency_common;
                    fullMatrix[j][i].exchanges.end_vertex_currency_common = vertexes[j].currency_common;
                    fullMatrix[j][i].exchanges.start_vertex_currency_id = i;
                    fullMatrix[j][i].exchanges.end_vertex_currency_id = j;
                    fullMatrix[j][i].exchanges.start_fixed_comission = vertexes[i].output_fixed_comission;
                    fullMatrix[j][i].exchanges.start_percent_comission = vertexes[i].output_percent_comission;
                    fullMatrix[j][i].exchanges.start_min = vertexes[i].output_min;
                    fullMatrix[j][i].exchanges.start_max = vertexes[i].output_max;
                    fullMatrix[j][i].exchanges.end_fixed_comission = vertexes[j].input_fixed_comission;
                    fullMatrix[j][i].exchanges.end_percent_comission = vertexes[j].input_percent_comission;
                    fullMatrix[j][i].exchanges.end_min = vertexes[j].input_min;
                    fullMatrix[j][i].exchanges.end_max = vertexes[j].input_max;
                    fullMatrix[j][i].exchanges.use_as_bridge_between_exchanges = vertexes[i].use_as_bridge_between_exchanges && vertexes[j].use_as_bridge_between_exchanges ? true : false;


                    //ребро в обратну юсторону
                    fullMatrix[i][j].exchanges.start_exchange = vertexes[j].exchange;
                    fullMatrix[i][j].exchanges.end_exchange = vertexes[i].exchange;
                    fullMatrix[i][j].exchanges.start_vertex_currency_local = vertexes[j].currency_local;
                    fullMatrix[i][j].exchanges.end_vertex_currency_local = vertexes[i].currency_local;
                    fullMatrix[i][j].exchanges.start_vertex_currency_common = vertexes[j].currency_common;
                    fullMatrix[i][j].exchanges.end_vertex_currency_common = vertexes[i].currency_common;
                    fullMatrix[i][j].exchanges.start_vertex_currency_id = j;
                    fullMatrix[i][j].exchanges.end_vertex_currency_id = i;
                    fullMatrix[i][j].exchanges.start_fixed_comission = vertexes[j].output_fixed_comission;
                    fullMatrix[i][j].exchanges.start_percent_comission = vertexes[j].output_percent_comission;
                    fullMatrix[i][j].exchanges.start_min = vertexes[j].output_min;
                    fullMatrix[i][j].exchanges.start_max = vertexes[j].output_max;
                    fullMatrix[i][j].exchanges.end_fixed_comission = vertexes[i].input_fixed_comission;
                    fullMatrix[i][j].exchanges.end_percent_comission = vertexes[i].input_percent_comission;
                    fullMatrix[i][j].exchanges.end_min = vertexes[i].input_min;
                    fullMatrix[i][j].exchanges.end_max = vertexes[i].input_max;
                    fullMatrix[i][j].exchanges.use_as_bridge_between_exchanges = vertexes[i].use_as_bridge_between_exchanges && vertexes[j].use_as_bridge_between_exchanges ? true : false;
                }
            }
        }
    }
}


function getFullRoutesByLight(light_routes, full_matrix) {
    var full_routes = [];
    for (var i = 0; i < light_routes.length; i++) {
        var obj = {};
        obj.route = light_routes[i];
        var edges = [];
        for (var j = 0; j < light_routes[i].length; j++) {
            if (j === 0)
                continue;
            var start_id = light_routes[i][j - 1];
            var end_id = light_routes[i][j];
            edges.push(full_matrix[end_id][start_id]);
        }
        obj.edges = deepcopy(edges);
        full_routes.push(obj);
    }
    return full_routes;
}


function printProfitRoute(route) {
    console.log("Маршрут " + JSON.stringify(route.route));
    console.log("Заработок " + JSON.stringify(route.earning));
    console.log("Стартовый баланс " + JSON.stringify(route.start_balance));
    console.log("Конечный баланс " + JSON.stringify(route.end_balance));
    for (var i = 0; i < route.edges.length; i++) {
        if (route.edges[i].exchange)
            console.log(route.edges[i].exchange.start_exchange + "-" + route.edges[i].exchange.start_vertex_currency_common + " -->> " + route.edges[i].exchange.end_vertex_currency_common + "-" + route.edges[i].exchange.end_exchange + "        " + route.edges[i].exchange.start_balance + "-->" + route.edges[i].exchange.end_balance);
        if (route.edges[i].exchanges)
            console.log(route.edges[i].exchanges.start_exchange + "-" + route.edges[i].exchanges.start_vertex_currency_common + " -->> " + route.edges[i].exchanges.end_vertex_currency_common + "-" + route.edges[i].exchanges.end_exchange + "        " + route.edges[i].exchanges.start_balance + "-->" + route.edges[i].exchanges.end_balance);
    }
    console.log("");
}


//функция будет возращать массив идентификаторов вершин для валюты, необходимо чтобы найти на разных биржах одинаковые валюты
function getIdsByCurrency(cur, exch = undefined) {
    var arr = [];
    for (var i = 0; i < vertexes.length; i++) {
        if (!exch) {
            if (vertexes[i].currency_common === cur) {
                arr.push(i);
            }
        }
        else {
            if (vertexes[i].currency_common === cur && vertexes[i].exchange === exch) {
                arr.push(i);
            }
        }
    }
    return arr;
}


function one_dimension_to_two_dimension(one_arr) {
    var n = Math.sqrt(one_arr.length);
    var two_arr = fillMatrix(n);
    var k = 0;
    for (var i = 0; i < two_arr.length; i++) {
        for (var j = 0; j < two_arr.length; j++) {
            two_arr[i][j] = one_arr[k];
            k++;
        }
    }
    return two_arr;
}

/** Функция проверки ограничений подсчитанного маршрута, true-прошел проверку, false-проверку не прошел */
function check_calc_route_restrict(calc_route) {

    //Если не выполняется условие что ребер больше нуля, первая и последнее ребро не равно переходу между биржами, тогда прерываем функция и возвращаем false
    if (!(calc_route.edges.length > 0 && !calc_route.edges[0].exchanges && !calc_route.edges[calc_route.edges.length - 1].exchanges)) {
        return false;
    }

    //условие стартовая биржа не равна конечной
    if (start_not_end) {
        if (calc_route.edges[0].exchange.start_exchange === calc_route.edges[calc_route.edges.length - 1].exchange.end_exchange) {
            return false;
        }
    }

    var edges = 0;
    var bridges = 0;
    for (var i = 0; i < calc_route.edges.length; i++) {
        if (calc_route.edges[i].exchanges) {
            bridges++;
        }
        edges++;
    }

    if (max_edges >= edges && bridges <= max_bridge) {
        return true;
    }
    else {
        return false;
    }

}


/** Функция отправляет задачу в rabbitmq и записывает задачу в базу данных 
 * @param full_route  {
 *   start_balance: 120,
 *   end_balance: 123,
 *   earning: 3,
 *   route:[0,1,8,2]
 *   edges:[
 *      {
 *          exchange: {
 *          ...
 *          }
 *      },
 *      {
 *          exchanges: {
 *          ...
 *          }
 *      }
 *   ]
 *  }
*/
async function send_task_to_rabbit(full_route) {
    var guid = guid_();
    var new_record = await taks_collection.insert(
        {
            "send_to_rabbit_time": new Date(),
            "time": Date.now(),
            "task_id": guid,
            "status": "sended",
            "planned_earning": full_route.earning,
            "route": full_route.edges
        })
    if (new_record) {
        amqp.connect('amqp://buron:541236952@194.58.121.42:5672', function (err, conn) {
            conn.createChannel(function (err, ch) {
                var q = 'trade_tasks';
                var obj = {
                    task_id: guid,
                    time: Date.now(),
                    planned_earning: full_route.earning,
                    status: "sended",
                    route: full_route.edges
                };
                ch.assertQueue(q, { durable: true });
                ch.sendToQueue(q, new Buffer(JSON.stringify(obj)), { persistent: true });
                send_message_to_telegram("Задача на выполнение была успешно отправленна с модуля подсчета, планируемый заработок " + full_route.earning + ", id: " + guid);
            });
        });
    }
    else {
        console.log("Ошибка добавление записи о новой задаче " + JSON.stringify(new_record))
    }
}


/** Функция возвращает занятые маркеты, которые находятся в выполнении
 * Возвращает
 * [{exchange: "livecoin", market: "ETH/USD"}, {exchange: "binance", market:"BTCUSDT"}]
 * либо
 * []
 * @param tasks [
 * {
    "_id" : ObjectId("5aa2d9ed8cacb42280d66861"),
    "send_to_rabbit_time" : ISODate("2018-03-09T19:01:01.415Z"),
    "task_id" : "19d9cb49-919f-165c-defc-21483def61a2",
    "status" : "sended",
    "planned_earning" : 3.397034298311,
    "route" : [ 
        {
            "exchange" : {
                "percent_comission" : 0.001,
                ...
            }
        }, 
        {
            "exchanges" : {
                "start_vertex_currency_id" : 37,
                ...
            }
        }, 
        {
            "exchange" : {
                "percent_comission" : 0.002,
                ...
            }
        }
     ]
   },
    {
    "_id" : ObjectId("5aa2d9ed8cacb42280d66861"),
    "send_to_rabbit_time" : ISODate("2018-03-09T19:01:01.415Z"),
    "task_id" : "19d9cb49-919f-165c-defc-21483def61a2",
    "status" : "execute",
    "planned_earning" : 3.397034298311,
    "route" : [ 
        {
            "exchange" : {
                "percent_comission" : 0.001,
                ...
            }
        }, 
        {
            "exchanges" : {
                "start_vertex_currency_id" : 37,
                ...
            }
        }, 
        {
            "exchange" : {
                "percent_comission" : 0.002,
                ...
            }
        }
    ]
    }
  ]
 */
function get_used_markets_by_tasks(tasks) {
    var arr = [];
    for (var i = 0; i < tasks.length; i++) {
        for (var k = 0; k < tasks[i].route.length; k++) {
            if (tasks[i].route[k].exchange) {
                arr.push({ exchange: tasks[i].route[k].exchange.start_exchange, market: tasks[i].route[k].exchange.market_name });
            }
        }
    }
    return arr;
}


/** Функция находит currency в списке vertexes и возвращает его
 * {
            "currency_local" : "BNB",
            "currency_common" : "BNB",
            "exchange" : "binance",
            "transaction_amount" : 12.4390796076216,
            "use_as_bridge_between_exchanges" : false,
            "input_min" : 0,
            "input_max" : 0,
            "input_fixed_comission" : 0,
            "input_percent_comission" : 0,
            "output_min" : 0,
            "output_max" : 0,
            "output_fixed_comission" : 0,
            "output_percent_comission" : 0,
            "decription" : "",
            "min_transaction_amount" : 3.7317238822865
    }
 */
function get_currency(exchange, local_currency, vertexes) {
    var curr = null;
    for (var i = 0; i < vertexes.length; i++) {
        if (vertexes[i].currency_local === local_currency && vertexes[i].exchange === exchange) {
            curr = vertexes[i];
            curr.vertex_id = i;
            break;
        }
    }
    return curr;
}


/** Получает конечные вершины на других биржах */
function get_ids_by_common_currency_name(exchange_, common_currency_, vertexes_) {
    var end_ids = [];
    for (var i = 0; i < vertexes_.length; i++) {
        if (vertexes_[i].currency_common === common_currency_ && vertexes_[i].exchange !== exchange_) {
            end_ids.push(i);
        }
    }
    return end_ids;
}


async function send_message_to_telegram(message) {
    return new Promise(async (resolve, reject) => {
        if (last_telegram_message !== message) { //чтобы нас не заспамило одинаковыми сообщениями
            await axios.request(
                {
                    baseURL: config.telegram_bot_api_address + "/send_notify",
                    method: "post",
                    headers: {
                        "access_key": "584^54&*^*%gffg"
                    },
                    data: {
                        message: get_log_date() + " " + message
                    }
                }
            )
                .then((val) => {
                    if (val) resolve(val);
                })
                .catch((error) => {
                    if (error) resolve(error.response);
                });
            last_telegram_message = message;
        }
        else {
            resolve();
        }

    })
}


/** Функция выполняет выполнения асинхронной программы на заданный промежуток времени */
async function stop_running(time) {
    return await new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, time)
    });
}

/** В этой функции будут с определенным интервалом загружаться настройки из базы данных */
async function loading_settings() {
    try {
        var settings_res = await settings_collection.find({});
        var settings = settings_res[0];
        min_percent_profit_by_task = settings.min_percent_profit_by_task;
        max_percent_profit_by_task = settings.max_percent_profit_by_task;
        enable_finding_routes = settings.enable_finding_routes;
        max_exchange_sync_time = settings.max_exchange_sync_time;
        update_settings_interval=settings.update_settings_interval;
    }
    catch (e) {
        console.log("[ERROR] Произошла ошибка загрузки настроек из базы mongodb: " + stringify_error(e));
    }
    setTimeout(loading_settings, update_settings_interval);
}

setImmediate(loading_settings);



// /** В этой функции будут с определенным интервалом загружаться настройки из базы данных */
// async function checking_exchanges_sync() {
//     try {
//         var settings_res = await settings_collection.find({});
//         var settings = settings_res[0];
//         min_percent_profit_by_task = settings.min_percent_profit_by_task;
//         max_percent_profit_by_task = settings.max_percent_profit_by_task;
//         stop_executing_find_routes = settings.stop_executing_find_routes;
//         max_exchange_sync_time = settings.max_exchange_sync_time;
//     }
//     catch (e) {
//         console.log(get_log_date() + " [ERROR] Произошла ошибка загрузки настроек из базы mongodb: " + stringify_error(e));
//     }
//     setTimeout(checking_exchanges_sync, 90000);
// }

// setImmediate(checking_exchanges_sync);






async function main() {
    var error_flag = false;
    try {
        while (true) {
            await stop_running(1000);
            if (enable_finding_routes) {

                //флаг того что произошла ошибка

                var unused_markets = [];
                var list_exchanges = []; //список бирж
                var tasks = await taks_collection.find({ "$or": [{ status: "sended" }, { status: "execute" }] });
                if (tasks && tasks.length > 0) {
                    unused_markets = get_used_markets_by_tasks(tasks);
                    //Сейчас почистим список от повторений
                    for (var i = 0; i < unused_markets.length; i++) {
                        for (var j = i; j < unused_markets.length; j++) {
                            if (equal(unused_markets[i], unused_markets[j]) && i !== j) {
                                unused_markets.splice(j, 1);
                                j--;
                            }
                        }
                    }
                }

                //********** Скачиваем данные из базы, объединияем матрицы, вершины, находим ребра между биржами */
                var start_time = Date.now();
                await edges_and_vertexes.find({})
                    .then((val) => {
                        console.log("Скачивание данных из базы заняло " + (Date.now() - start_time));
                        var buff_vertexes_array = [];
                        var buff_matrix_edges_array = [];
                        //проходимся по всем биржам (документам в базе)
                        for (var i = 0; i < val.length; i++) {

                            var sync_time = (new Date(val[i].last_sync.high_ * 1000)).getTime();
                            var cur_time = (new Date()).getTime();
                            if (cur_time - sync_time < max_exchange_sync_time) {
                                list_exchanges.push(val[i].exchange);
                                console.log("Биржа " + val[i].exchange + " успешно загруженна , время последней синхронизации " + get_log_date(new Date(val[i].last_sync.high_ * 1000)));
                                buff_vertexes_array.push(val[i].vertexes);
                                buff_matrix_edges_array.push(one_dimension_to_two_dimension(val[i].edges));
                                if (val[i].exclude_exchanges_currencys && val[i].exclude_exchanges_currencys.length > 0) {
                                    for (var c = 0; c < val[i].exclude_exchanges_currencys.length; c++) {
                                        exclude_currencys.push({ exchange: val[i].exchange, currency_local: val[i].exclude_exchanges_currencys[c] })
                                    }
                                }
                            }
                            else {
                                console.log("Биржа " + val[i].exchange + " не загруженна , время последней синхронизации " + get_log_date(new Date(val[i].last_sync.high_ * 1000)));
                            }
                        }
                        joinFullMatrixesAndVertexes(buff_vertexes_array, buff_matrix_edges_array);
                    })
                    .catch((error) => {
                        console.log("Ошибка данных из базы заняло " + (Date.now() - start_time));
                        console.log(error);
                        error_flag = true;
                    })
                if (error_flag) continue;
                //********** Конец скачиваем данные из базы, объединияем матрицы, вершины, находим ребра между биржами */




                var start_vertexes = [];  //[{start_exchange: "livecoin" ,start_vertex_id: 1, start_vertex: "ETH", start_balance: 50, end_vertex_ids: []}]
                for (var i = 0; i < list_exchanges.length; i++) {
                    var value = await api.get_available_currency_balances(list_exchanges[i]);
                    if (value.success) {
                        var balances = value.balances;
                        //Проходимся по балансам
                        for (var k = 0; k < balances.length; k++) {
                            //Если баланс больше нуля
                            if (balances[k].amount > 0) {
                                //Находим для валюты его вершину в списке, плюс ко всему к вершине она добавляет поле vertex_id
                                var buff_currency = get_currency(list_exchanges[i], balances[k].local_currency, vertexes)
                                if (buff_currency) {
                                    var start_balance = 0;
                                    //Если баланс больше установленного ограничения транзакции
                                    if (balances[k].amount >= buff_currency.transaction_amount) {
                                        start_balance = buff_currency.transaction_amount;
                                    }
                                    // Если баланс находится в границах между минимальным и максимальным ограничение баланса
                                    if (balances[k].amount < buff_currency.transaction_amount && balances[k].amount >= buff_currency.min_transaction_amount) {
                                        start_balance = balances[k].amount;
                                    }
                                    if (start_balance > 0) {
                                        start_vertexes.push({
                                            start_exchange: list_exchanges[i],
                                            start_vertex_id: buff_currency.vertex_id,
                                            start_vertex_common: buff_currency.currency_common,
                                            start_balance: start_balance,
                                            end_vertex_ids: get_ids_by_common_currency_name(buff_currency.exchange, buff_currency.currency_common, vertexes)
                                        });
                                    }
                                }
                            }
                        }
                    }
                }





                for (var i = 0; i < start_vertexes.length; i++) {
                    //// ------------ Поиск маршрутов ---------------
                    var lightMatrix = fullToLightMatrix(fullMatrix);
                    start_time = Date.now();
                    var lightRoutes = [];
                    await findRoutes.findRoutes(lightMatrix, start_vertexes[i].start_vertex_id, start_vertexes[i].end_vertex_ids, max_edges).then((val) => { lightRoutes = val }).catch((error) => { console.log(error); error_flag = true; });
                    if (error_flag) continue;
                    console.log("Поиск маршрутов от " + vertexes[start_vertexes[i].start_vertex_id].currency_common + " " + vertexes[start_vertexes[i].start_vertex_id].exchange + ", в количестве " + lightRoutes.length + " заняло " + prettyMs(Date.now() - start_time));


                    //// ------------ Подсчет маршрутов ---------------
                    start_time = Date.now();
                    var fullRoutes = getFullRoutesByLight(lightRoutes, fullMatrix);
                    var calcFullRoutes = calculateRoutes.calculate(fullMatrix, fullRoutes, start_vertexes[i].start_balance, exclude_currencys, unused_markets);
                    console.log("Подсчет найденных маршрутов занял " + prettyMs(Date.now() - start_time));


                    //// ------------ Выбор из списка подсчитанных маршрутов необходимых нам -----------
                    handling_calculte_routes(calcFullRoutes);
                }



                function handling_calculte_routes(calc_full_routes) {
                    //Проходимся по всем посчитанным маршрутам
                    var max = -1000000;
                    var earning = 0;
                    var max_j = -1;
                    var max_earning = -1000;
                    var max_earning_calc_route = null;
                    for (var j = 0; j < calc_full_routes.length; j++) {
                        if (check_calc_route_restrict(calc_full_routes[j])) {
                            if (!calc_full_routes[j].error) {
                                if (calc_full_routes[j].earning > max_earning) {
                                    var percent_profit = (calc_full_routes[j].earning / calc_full_routes[j].start_balance)*100; //Подсчитываем процент выгоды при выполнении маршрута
                                    if (percent_profit >= min_percent_profit_by_task && percent_profit < max_percent_profit_by_task) {
                                        max_earning = calc_full_routes[j].earning;
                                        max_earning_calc_route = calc_full_routes[j];
                                    }
                                }
                            }
                        }
                        else {
                            //если маршрут не прошел ограничения
                            // console.log(get_log_date()+" Маршрут не прошел проверку ограничений "+ JSON.stringify(calcFullRoutes[j].route));
                        }
                    }
                    if (max_earning_calc_route) {
                        console.log("Максимальный заработок составил " + max_earning);
                        send_task_to_rabbit(max_earning_calc_route);
                        printProfitRoute(max_earning_calc_route);
                    }
                    else {
                        console.log("Не найденны маршруты с максимальным заработком");
                    }
                }
            }
            else {

                console.log("[WARN] Была включенна настройка остановки поиска и постановки задач");
            }
        }
    }
    catch (e) {
        await send_message_to_telegram(stringify_error(e));
        console.log(stringify_error(e));
        setImmediate(main);
    }
}

setImmediate(main);