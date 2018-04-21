const config = require("./../config");
var api = require('./common_api_adapter');
const db = require('monk')(config.mongodb_connection_string);
const edges_and_vertexes = db.get('edges_and_vertexes');
const settings_collection = db.get('settings');
const serializeError = require('serialize-error');
const taks_collection = db.get('tasks');
var dateFormat = require('dateformat');
var BigNumber = require("bignumber.js");
const prettyMs = require('pretty-ms');
var deepcopy = require("deepcopy");
const axios = require("axios");
var amqp = require('amqplib/callback_api');
var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/routes_' + get_log_date() + '.log', { flags: 'w' });
var log_stdout = process.stdout;

var current_task_id = "";

var last_telegram_message = ""; //Последнее отправленное в телеграм сообщение, записываем его чтобы нас не заспамило одинаковыми сообщениями
var last_console_message = "";


//Динамические настройки, которые постоянно обновляются
var enable_execute_routes = false;
var overdue_time = 120000; //Время после которого задача считается просроченной
var update_settings_interval = 60000;// Интервал загрузки настроек


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


/** В этой функции будут с определенным интервалом загружаться настройки из базы данных */
async function loading_settings() {
    try {
        var settings_res = await settings_collection.find({});
        var settings = settings_res[0];
        enable_execute_routes = settings.enable_execute_routes;
        overdue_time = settings.overdue_time;
        update_settings_interval = settings.update_settings_interval;
    }
    catch (e) {
        console.log("[ERROR] Произошла ошибка загрузки настроек из базы mongodb: " + stringify_error(e));
    }
    setTimeout(loading_settings, update_settings_interval);
}

setImmediate(loading_settings);


function get_log_date() {
    return '' + dateFormat(new Date(), "dd.mm.yyyy HH.MM.ss");
}


async function stop_running(time) {
    return await new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, time)
    });
}

/** Функция обрезает число до 15 чисел, для использования в библиотеке BigNumber */
function trim_digits(number_) {
    var count = 15;
    var s = parseFloat(number_).toFixed(15);
    if (s.indexOf(".") > -1)
        return parseFloat(s.length > count + 1 ? s.substr(0, count + 1) : s);
    else
        return parseFloat(s.length > count ? s.substr(0, count) : s);
}


/** Обрезает число до указанного количества знаков после запятой */
function trim_float(number, count) {
    var count_ = 1;
    for (var i = 0; i < count; i++) {
        count_ = count_ * 10;
    }
    return (Math.floor(number * count_)) / count_;
}

/** Обрезает число до 14 знаков после запятой */
function trim(number) {
    return trim_digits(number);
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




/** Функция возвращает ордера 
 * {
 *   success: true,
 *   value: [
 *   { course: 8754.96, count: 0.0035, cost: 30.642359999999996 },
     { course: 8754.97, count: 0.080601, cost: 705.65933697 }
    ]
 * }
 * либо 
 * {
 *   success: false,
 *   error_msg: ""
 * }
 * 
*/
function get_orders(exchange, market, buy, sell) {
    return new Promise((resolve, reject) => {
        edges_and_vertexes.find({
            'exchange': exchange,
            'edges': {
                '$elemMatch': {
                    'exchange.start_exchange': exchange,
                    'exchange.end_exchange': exchange,
                    'exchange.market_name': market,
                    'exchange.buy': buy,
                    'exchange.sell': sell,
                }
            }
        },
            {
                'edges.$.orders': 1
            })
            .then((val) => {
                if (val && val.length > 0) {
                    resolve({ success: true, value: val[0].edges[0].exchange.orders });
                }
                else {
                    resolve({ success: false, error_msg: get_log_date() + " Запись " + exchange + " " + market + " buy:" + buy + " sell:" + sell + " не найденна в базе данных mongodb" });
                }

            })
            .catch((error) => {
                resolve({ success: false, error_msg: get_log_date() + " " + error.message });
            })
    })
}




/** Функция находит по рыночному ордеру какое количество монет мы можем купить за определенную сумму
 * 12,3
 * либо
 * 0
*/
function find_quantity(orders, start_balance) {
    //баланс который будет меняться проходя по итерациям
    var balance = new BigNumber(trim(start_balance));
    //Количество покупаемых монет которое будет меняться проходя по итерациям
    var quantity = new BigNumber(0);
    for (var i = 0; i < orders.length; i++) {
        //Текущий элемент списка ордеров
        var item = orders[i];
        //Если текущая стоимость ордера полностью закрывает наш оставшийся баланс
        if ((new BigNumber(trim(item.cost))).isGreaterThanOrEqualTo(balance)) {
            quantity = quantity.plus(balance.dividedBy(trim(item.course)));
            break;
        }
        //Если текущая стоимость ордера не закрывает наш оставшийся баланс
        if ((new BigNumber(trim(item.cost))).isLessThan(balance)) {
            balance = balance.minus(new BigNumber(trim(item.cost)));
            quantity = quantity.plus(new BigNumber(trim(item.count)));
        }
    }
    return quantity.toNumber();
}
module.exports.find_quantity = find_quantity;



/** Функция находит по рыночному ордеру сколько мы получим продав определенное количество монет
 * 12,3
 * либо
 * 0
*/
function find_sum(orders, start_quantity) {
    //баланс который будет меняться проходя по итерациям
    var quantity = new BigNumber(trim(start_quantity));
    //Количество покупаемых монет которое будет меняться проходя по итерациям
    var sum = new BigNumber(0);
    for (var i = 0; i < orders.length; i++) {
        //Текущий элемент списка ордеров
        var item = orders[i];
        //Если текущая стоимость ордера полностью закрывает наш оставшийся баланс
        if ((new BigNumber(item.count)).isGreaterThanOrEqualTo(quantity)) {
            sum = sum.plus(quantity.multipliedBy(trim(item.course)));
            break;
        }

        //Если текущая стоимость ордера не закрывает наш оставшийся баланс
        if ((new BigNumber(item.count)).isLessThan(quantity)) {
            quantity = quantity.minus(new BigNumber(trim(item.count)));
            sum = sum.plus(new BigNumber(trim(item.cost)));
        }
    }
    return sum.toNumber();
}
exports.find_sum = find_sum;



/** Функция по ордерам разницу между ордерами для инкрементирования количества при покупке определенного количества монет
 * 0.5
 * либо
 * 0
 * @param count_first_orders {number} Количество первых ордеров для нахождения разницы
 * @param quantity Количество которое мы покупаем
 */
function find_increment(orders, count_first_orders, quantity) {

    var sum_courses = new BigNumber(0);
    var sum_differences = new BigNumber(0);
    for (var i = 0; i < count_first_orders; i++) {
        sum_courses = sum_courses.plus(orders[i].course);
        if (i !== count_first_orders - 1)
            sum_differences = sum_differences.plus((new BigNumber(trim(orders[i].course))).minus(trim(orders[i + 1].course)).absoluteValue());
    }

    var average_course = sum_courses.dividedBy(count_first_orders);
    var average_differences = sum_differences.dividedBy(count_first_orders - 1);
    var inc = 0;
    if (quantity <= 1)
        inc = average_differences.dividedBy(average_course).dividedBy(3);
    else
        inc = average_differences.dividedBy(average_course).dividedBy(3).multipliedBy(trim(quantity));
    return inc.toNumber();
}
module.exports.find_increment = find_increment;




/** Функция выполняет маршрут и возвращает значение
 * {
 *  success: true,
 *  earning: 2.4,
    execute_time_timestamp: 0,
    execute_time_text: "",
 *  trace_route: [
 *    {
 *          "type": "exchange",
 * 			"comission": 0.002,
			"buy": true,
			"sell": false,
			"start_cur_local": "BTC",
			"end_cur_local": "ETH",
			"exchange": "livecoin",
			"market_name": "ETH/BTC",
			"start_balance": 0.00836350952862869,
			"actual_end_balance": 0.6946025140002431,
            "planned_end_balance": 0.6946025140002431
 *    },
 *    {
 *          type: "exchanges", 
			"start_cur_common": "NEO",
			"end_cur_common": "NEO",
			"start_exchange": "livecoin",
			"end_exchange": "binance",
			"comission": 0.002,
			"start_balance": 0.6946025140002431,
			"actual_end_balance": 0.6946025140002431
 *    }    
 *  ]
 * }
 * либо
 * {
 *  success: false,
 *  execute_time_timestamp: 0,
    execute_time_text: "",
 *  error_msg: "",
 *  trace_route: [
 *    {
 *      type: "exchange" //тип покупка, продажа внутри биржи
 *    },
 *    {
 *       type: "exchanges" //тип, перевод между биржами
 *    },
 *    {
 *       type: "exchanges",
 *       start_cur_common: "BTC",
		 end_cur_common: "ETH",
 *       error_msg: ""
 *    },
 *    {
 *       type: "exchange",
 *       start_cur_local: "BTC",
		 end_cur_local: "ETH",
 *       error_msg: ""
 *    }        
 *  ]
 * }
 * @param {array} [{
		"exchanges": {
			"start_vertex_currency_id": 6,
			"end_vertex_currency_id": 17,
			"start_vertex_currency_local": "NEO",
			"end_vertex_currency_local": "NEO",
			"start_vertex_currency_common": "NEO",
			"end_vertex_currency_common": "NEO",
			"start_exchange": "livecoin",
			"end_exchange": "binance",
			"start_fixed_comission": 0,
			"start_percent_comission": 0,
			"start_min": 0,
			"start_max": 0,
			"end_fixed_comission": 0,
			"end_percent_comission": 0,
			"end_min": 0,
			"end_max": 0,
			"use_as_bridge_between_exchanges": true,
			"start_balance": 0.6946025140002431,
			"end_balance": 0.6946025140002431
		}
	},
	{
		"exchange": {
			"percent_comission": 0.001,
			"fixed_comission": 0,
			"buy": false,
			"sell": true,
			"start_vertex_currency_local": "NEO",
			"end_vertex_currency_local": "BTC",
			"start_vertex_currency_common": "NEO",
			"end_vertex_currency_common": "BTC",
			"start_exchange": "binance",
			"end_exchange": "binance",
			"market_name": "NEOBTC",
			"start_balance": 0.6946025140002431,
			"end_balance": 0.007910550190943168,
            "course": 0.0114,
            "precisions":  {price_precision: 5, quantity_precision: 8 }
		}
	}]
  */
async function execute_route(route_) {
    var route = deepcopy(route_)
    return new Promise(async (resolve, reject) => {
        var trace_route = [];
        var one_edge = null;
        var error = false;
        var start_time = Date.now();
        var start_balance = -1;
        var execute_time = 0;
        try {
            if (route.length > 0) {
                if (route[0].exchange) {
                    start_balance = route[0].exchange.start_balance;
                }
                else {
                    start_balance = route[0].exchanges.start_balance;
                }
            }
            //Выполняем по циклу маршруты
            for (var i = 0; i < route.length; i++) {
                var val = await execute_edge(route[i]);
                if (val.success) {
                    send_message_to_telegram(`\nЗадача ` + current_task_id + `, успешное выполнение ребра \n`
                        + val.value.start_exchange + " => " + val.value.end_exchange + "\n"
                        + (val.value.type === "exchange" ? val.value.start_cur_local : val.value.start_cur_common) + " => " + (val.value.type === "exchange" ? val.value.end_cur_local : val.value.end_cur_common) + "\n"
                        + val.value.start_balance + " => " + val.value.actual_end_balance);

                    trace_route.push(val.value);
                    //Если ребро не последнее то устанавливаем слудующему ребру стартовый баланс фактически полученный
                    if (i !== route.length - 1) {
                        if (route[i + 1].exchange) {
                            route[i + 1].exchange.start_balance = val.value.actual_end_balance;
                        }
                        else {
                            route[i + 1].exchanges.start_balance = val.value.actual_end_balance;
                        }
                    }

                }
                else {
                    error = true;
                    trace_route.push(val.value)
                    break;
                }
            }

            //Закончили проход маршрутов, и смотрим если произошла ошибка то записываем ее
            execute_time = Date.now() - start_time;
            if (!error) {
                var end_balance = trace_route[trace_route.length - 1].actual_end_balance;
                earning = new BigNumber(end_balance).minus(start_balance).toNumber();
                send_message_to_telegram("Задача " + current_task_id + " успешно выполненна, конечный заработок составил " + earning + " " + (trace_route[trace_route.length - 1].type === "exchange" ? trace_route[trace_route.length - 1].end_cur_local : trace_route[trace_route.length - 1].end_cur_common));
                resolve({
                    success: true,
                    earning: earning,
                    execute_time_timestamp: execute_time,
                    execute_time_text: prettyMs(execute_time),
                    trace_route: trace_route
                })
            }
            else {
                resolve({
                    success: false,
                    error_msg: "",
                    execute_time_timestamp: execute_time,
                    execute_time_text: prettyMs(execute_time),
                    trace_route: trace_route
                })
                send_message_to_telegram("Задача " + current_task_id + " завершенна с ошибкой,  " + stringify_error(trace_route[trace_route.length - 1]));
            }

        }
        catch (e) {
            error = true;
            trace_route.push(stringify_error(e));
            send_message_to_telegram("Задача " + current_task_id + " завершенна с ошибкой,  " + stringify_error(e));
            resolve({
                success: false,
                error_msg: stringify_error(e),
                execute_time_timestamp: execute_time,
                execute_time_text: prettyMs(execute_time),
                trace_route: trace_route
            })
        }
    })
}



/** Функция выполняет переход между валютами внутри биржи и возвращает значение
 * {
 *   success: true,
 *   value: {
 *          "type": "exchange", 
			"start_cur_local": "NEO",
			"end_cur_local": "NEO",
			"start_exchange": "livecoin",
			"end_exchange": "livecoin",
			"comission": 0.002,
			"start_balance": 0.6946025140002431,
            "actual_end_balance": 0.6946025140002431,
            "planned_end_balance": 0.6946025140002431
 *    }   
 * }
 * либо
 *  * {
 *   success: true,
 *   value: {
            "type": "exchanges", 
			"start_cur_common": "NEO",
			"end_cur_common": "NEO",
			"start_exchange": "livecoin",
            "end_exchange": "binance",
            "start_time": "",  //текстовое представление даты
            "end_time": "",   //текстовое представление даты
			"comission": 0.002,
			"start_balance": 0.6946025140002431,
			"actual_end_balance": 0.6946025140002431
 *    }   
 * }
 * либо 
 * {
 *   success: false,
 *   value: {
 *       type: "exchange", //либо exchanges
 *       ........  //дополнительные поля
 *       error_msg: ""
 *    }      
 * }
 * @param edge {object} 
*/
async function execute_edge(edge) {
    return new Promise(async (resolve, reject) => {
        if (edge.exchange) {
            //для exchanges
            var val = await execute_edge_exchange(edge.exchange)
            if (val.success) {
                resolve({ success: true, value: val.value });
            }
            else {
                resolve({ success: false, value: val.value });
            }
        }
        else {
            //для exchanges
            var val = await execute_edge_exchanges(edge.exchanges)
            if (val.success) {
                resolve({ success: true, value: val.value });
            }
            else {
                resolve({ success: false, value: val.value });
            }
        }
    })
}



/** Функция выполняет переход между биржами
 * {
 *   success: true,
 *   value: {
 *          type: "exchanges", 
			"start_cur_common": "NEO",
			"end_cur_common": "NEO",
			"start_exchange": "livecoin",
            "end_exchange": "binance",
            "start_time": "",  //текстовое представление даты
            "end_time": "",   //текстовое представление даты
			"comission": 0.002,
			"start_balance": 0.6946025140002431,
			"end_balance": 0.6946025140002431
 *    }      
 * }
 * либо
 * {
 *   success: false,
 *   value: {
 *       type: "exchanges",
 *       start_cur_common: "BTC",
         end_cur_common: "ETH",
         start_exchange: "livecoin",
         end_exchange: "binance",
         start_time: "",  //текстовое представление даты
         end_time: "",   //текстовое представление даты
 *       error_msg: ""
 *    }  
 * }
 * @param edge {object} {
			"start_vertex_currency_id": 6,
			"end_vertex_currency_id": 17,
			"start_vertex_currency_local": "NEO",
			"end_vertex_currency_local": "NEO",
			"start_vertex_currency_common": "NEO",
			"end_vertex_currency_common": "NEO",
			"start_exchange": "livecoin",
			"end_exchange": "binance",
			"start_fixed_comission": 0.002,
			"start_percent_comission": 0,
			"start_min": 0,
			"start_max": 0,
			"end_fixed_comission": 0,
			"end_percent_comission": 0,
			"end_min": 0,
			"end_max": 0,
			"use_as_bridge_between_exchanges": true,
			"start_balance": 0.6946025140002431,
			"end_balance": 0.6946025140002431
		}
*/
async function execute_edge_exchanges(edge) {
    return new Promise(async (resolve, reject) => {
        //Получаем адрес кошелька куда мы перечислим деньги  
        var wallet = "";
        var attempts_address = 5;       //Количество попыток получения адреса
        var attempts_withdraw = 5;      //Количество попыток отправки депозита
        var deposit_check_time = 7600000;  //1 час. Максимальное время при котором будет проверяться поступление депозита
        var count = 0;
        var error_msg = "";
        var start_time = 0;  //Время старта отравки запроса на вывод средств
        var start_time_log = "";
        var end_time = 0;    //Время получения депозита
        var quantity = 0; //Количество переводимых монет
        var receive_quantity = 0; //Количество принимаемых монет, с учетом комиссии
        var comission = 0;  //Комиссия за перевод

        try {
            start_time_log = get_log_date();
            while (true) {
                var get_wallet_flag = false;
                await api.get_deposit_address(edge.end_exchange, edge.end_vertex_currency_local)
                    .then((val) => {
                        if (val.success) {
                            wallet = val.value;
                            console.log("Кошелек для " + edge.end_exchange + " " + edge.end_vertex_currency_local + " успешно полученн " + wallet);
                            get_wallet_flag = true;
                        }
                        else {
                            console.log("Не удалось получить кошелек для " + edge.end_exchange + " " + edge.end_vertex_currency_local);
                        }
                        count++;
                        if (count >= attempts_address && wallet === "") {  //Если достигнуто максимальное количество попыток и кошелек не полученн
                            error_msg = JSON.stringify(val);
                        }

                    })
                if (get_wallet_flag || count >= attempts_address) {  //если мы получили кошелек либо достигнуто максимальное количество попыток
                    break;
                }
            }



            //Если ошибок не обнаруженно, то продолжаем операцию вывода
            if (error_msg === "") {
                //Отправляем запрос на вывод средств
                while (true) {
                    var withdraw_req_flag = false;
                    var count = 0;
                    quantity = edge.start_balance;
                    comission = edge.start_fixed_comission;
                    await api.withdraw_request(edge.start_exchange, trim_float(quantity, 7), comission, edge.start_vertex_currency_local, wallet)
                        .then((val) => {
                            if (val.success) {
                                console.log("Запрос на вывод " + edge.start_vertex_currency_local + " с биржи " + edge.start_exchange + " на биржу " + edge.end_exchange + " в количестве " + quantity + " и на кошелек " + wallet + " успешно отправлен");
                                withdraw_req_flag = true;
                                start_time = Date.now();
                            }
                            else {
                                console.log("Не удалось отправить запрос на вывод " + edge.start_vertex_currency_local + " с биржи " + edge.start_exchange + " на биржу " + edge.end_exchange + " в количестве " + quantity + " и на кошелек " + wallet);
                                console.log(val);
                            }
                            count++;
                            if (count >= attempts_withdraw && !withdraw_req_flag) {  //Если достигнуто максимальное количество попыток вывода средств
                                error_msg = JSON.stringify(val);
                            }
                        })
                    if (withdraw_req_flag || count >= attempts_withdraw) {
                        break;
                    }
                }



                //Если ошибок не обнаруженно, то продолжаем операцию вывода
                if (error_msg === "") {

                    //Функция постоянно проверяет список депозитов для livecoin, если депозит найден то выводит сообщение о времени операции
                    while (true) {
                        var get_deposit = false;
                        await api.get_deposits(edge.end_exchange, start_time, Date.now())
                            .then((val) => {
                                if (val.success) {
                                    for (var i = 0; i < val.values.length; i++) {
                                        if (val.values[i].currency === edge.end_vertex_currency_local && val.values[i].amount == quantity) {
                                            console.log("Депозит " + edge.end_vertex_currency_common + " " + edge.end_exchange + " успешно получен в количестве " + val.values[i].amount);
                                            get_deposit = true;
                                        }
                                    }
                                }
                                else {
                                    console.log("Ошибка получения депозитов для " + edge.end_exchange);
                                }
                                if (Date.now() - start_time >= deposit_check_time) {  //Если достигнуто ограничение максимального времени проверки получения депозита 
                                    error_msg = "Достигнуто ограничение максимального времени проверки получения депозита";
                                }
                            })
                        if (get_deposit || Date.now() - start_time >= deposit_check_time) {
                            break;
                        }
                    }

                    //Если ошибок не обнаруженно, то возвращаем успешный результат
                    if (error_msg === "") {
                        resolve({
                            success: true,
                            value: {
                                type: "exchanges",
                                start_cur_common: edge.start_vertex_currency_common,
                                end_cur_common: edge.end_vertex_currency_common,
                                start_exchange: edge.start_exchange,
                                end_exchange: edge.end_exchange,
                                start_time: start_time_log,
                                end_time: get_log_date(),
                                comission: comission,
                                start_balance: edge.start_balance,
                                actual_end_balance: quantity
                            }
                        });
                        return;
                    }
                    else {
                        resolve({
                            success: false,
                            value: {
                                type: "exchanges",
                                start_cur_common: edge.start_vertex_currency_common,
                                end_cur_common: edge.end_vertex_currency_common,
                                start_exchange: edge.start_exchange,
                                end_exchange: edge.end_exchange,
                                start_time: start_time_log,
                                end_time: get_log_date(),
                                error_msg: error_msg
                            }
                        });
                        return;
                    }
                }
                else {
                    resolve({
                        success: false,
                        value: {
                            type: "exchanges",
                            start_cur_common: edge.start_vertex_currency_common,
                            end_cur_common: edge.end_vertex_currency_common,
                            start_exchange: edge.start_exchange,
                            end_exchange: edge.end_exchange,
                            start_time: start_time_log,
                            end_time: get_log_date(),
                            error_msg: error_msg
                        }
                    });
                    return;
                }
            }
            else {
                resolve({
                    success: false,
                    value: {
                        type: "exchanges",
                        start_cur_common: edge.start_vertex_currency_common,
                        end_cur_common: edge.end_vertex_currency_common,
                        start_exchange: edge.start_exchange,
                        end_exchange: edge.end_exchange,
                        start_time: start_time_log,
                        end_time: get_log_date(),
                        error_msg: error_msg
                    }
                });
                return;
            }
        }
        catch (e) {
            resolve({
                success: false,
                value: {
                    type: "exchanges",
                    start_cur_common: edge.start_vertex_currency_common,
                    end_cur_common: edge.end_vertex_currency_common,
                    start_exchange: edge.start_exchange,
                    end_exchange: edge.end_exchange,
                    start_time: start_time_log,
                    end_time: get_log_date(),
                    error_msg: stringify_error(e)
                }
            });
        }
    })
}


/** Функция выполняет переход между валютами внутри биржи и возвращает значение
 * {
 *   success: true,
 *   value: {
 *          type: "exchange", 
			"start_cur_local": "NEO",
			"end_cur_local": "NEO",
			"start_exchange": "livecoin",
			"end_exchange": "binance",
			"comission": 0.002,
			"start_balance": 0.6946025140002431,
			"actual_end_balance": 0.6946025140002431,
            "planned_end_balance": 0.6946025140002431
 *    }   
 * }
 * либо
 * {
 *   success: false,
 *   value: {
 *       type: "exchange",
 *       start_cur_local: "BTC",
		 end_cur_local: "ETH",
 *       error_msg: ""
 *    }      
 * }
 * @param edge {object} {
			"percent_comission": 0.002,
			"fixed_comission": 0,
			"buy": false,
			"sell": true,
			"start_vertex_currency_local": "NEO",
			"end_vertex_currency_local": "USD",
			"start_vertex_currency_common": "NEO",
			"end_vertex_currency_common": "USD",
			"start_exchange": "livecoin",
			"end_exchange": "livecoin",
			"market_name": "NEO/USD",
			"start_balance": 0.6946025140002431,
			"end_balance": 90.12390669697447,
            "course": 130.00891,
            "precisions":  {price_precision: 5, quantity_precision: 8 }
		}
*/
async function execute_edge_exchange(edge) {
    return new Promise(async (resolve, reject) => {
        try {
            var error = "";
            if (edge.sell) {
                //Это мы продаем на маркете
                var quantity = edge.start_balance; //количество которое мы продаем
                await attempts_sell(edge.start_exchange, edge.market_name, quantity, edge.precisions.quantity_precision, edge)
                    .then((val) => {
                        if (val.success) {
                            resolve({
                                success: true,
                                value: {
                                    "type": "exchange",
                                    "start_cur_local": edge.start_vertex_currency_local,
                                    "end_cur_local": edge.end_vertex_currency_local,
                                    "start_exchange": edge.start_exchange,
                                    "end_exchange": edge.end_exchange,
                                    "comission": edge.percent_comission,
                                    "start_balance": edge.start_balance,
                                    "actual_end_balance": val.cost,
                                    "planned_end_balance": edge.end_balance,
                                }
                            });
                            console.log("Переход от " + edge.start_vertex_currency_local + " к " + edge.end_vertex_currency_local + " на бирже " + edge.start_exchange + " " + edge.market_name + " успешно выполнен");
                        }
                        else {
                            resolve({
                                success: false,
                                value: {
                                    type: "exchange",
                                    start_cur_local: edge.start_vertex_currency_local,
                                    end_cur_local: edge.end_vertex_currency_local,
                                    error_msg: val.error_msg
                                }
                            });
                        }
                    })
                    .catch((e) => {
                        resolve({
                            success: false,
                            value: {
                                type: "exchange",
                                start_cur_local: edge.start_vertex_currency_local,
                                end_cur_local: edge.end_vertex_currency_local,
                                error_msg: e.message
                            }
                        });
                    })
            }
            else {
                //Это мы покупаем на маркете
                var orders = [];
                await get_orders(edge.start_exchange, edge.market_name, true, false)
                    .then((val) => {
                        if (val.success) {
                            orders = val.value;
                        }
                        else {
                            error = val.error_msg;
                        }
                    })
                    .catch((e) => {
                        error = stringify_error(e);
                    })



                if (error === "" && orders.length > 0) {
                    var quantity = find_quantity(orders, edge.start_balance);
                    var inc = find_increment(orders, 6, quantity);

                    await attempts_buy(edge.start_exchange, edge.market_name, quantity, inc, edge.precisions.quantity_precision, edge)
                        .then((val) => {
                            if (val.success) {
                                resolve({
                                    success: true,
                                    value: {
                                        "type": "exchange",
                                        "start_cur_local": edge.start_vertex_currency_local,
                                        "end_cur_local": edge.end_vertex_currency_local,
                                        "start_exchange": edge.start_exchange,
                                        "end_exchange": edge.end_exchange,
                                        "comission": edge.percent_comission,
                                        "start_balance": edge.start_balance,
                                        "actual_end_balance": val.quantity,
                                        "planned_end_balance": edge.end_balance,
                                    }
                                });
                                console.log("Переход от " + edge.start_vertex_currency_local + " к " + edge.end_vertex_currency_local + " на бирже " + edge.start_exchange + " " + edge.market_name + " успешно выполнен");
                            }
                            else {
                                resolve({
                                    success: false,
                                    value: {
                                        type: "exchange",
                                        start_cur_local: edge.start_vertex_currency_local,
                                        end_cur_local: edge.end_vertex_currency_local,
                                        error_msg: val.error_msg
                                    }
                                });
                            }
                        })
                        .catch((e) => {
                            resolve({
                                success: false,
                                value: {
                                    type: "exchange",
                                    start_cur_local: edge.start_vertex_currency_local,
                                    end_cur_local: edge.end_vertex_currency_local,
                                    error_msg: stringify_error(e)
                                }
                            });
                        })
                }
                else {
                    resolve({
                        success: false,
                        value: {
                            type: "exchange",
                            start_cur_local: edge.start_vertex_currency_local,
                            end_cur_local: edge.end_vertex_currency_local,
                            error_msg: error
                        }
                    });
                }

            }
        }
        catch (e) {
            resolve({
                success: false,
                value: {
                    type: "exchange",
                    start_cur_local: edge.start_vertex_currency_local,
                    end_cur_local: edge.end_vertex_currency_local,
                    error_msg: stringify_error(e)
                }
            });
        }
    })
}



/** Функция которая пытается продать определенное количество монет, функция возвращает
 * {
 *   success: true,
 *   quantity: 0.5,
 *   cost: 600,
 *   order_id: "d4sg34f3w"
 * }
 * либо
 * {
 *   success: false,
 *   error_msg: "",
 *   sell: false, //была ли успешно проданна валюта
 *   order_info: false  //были ли успешно полученны данные об ордере
 * } 
*/
async function attempts_sell(start_exchange, market_name, quantity, quantity_precision, edge) {
    return new Promise(async (resolve, reject) => {
        var error = "";
        var error_last = ""; //сюда записывается последняя ошибка которая возращалась

        var balance_start_vertex_before = -1;  //Баланс стартововй вершины до выполнения операции
        var balance_end_vertex_before = -1;   //Баланс конечной вершины до выполнения операции
        var balance_start_vertex_after = -1;  //Баланс стартовой вершины после выполнения операции
        var balance_end_vertex_after = -1;    //Баланс конечной вершины после выполнения операции
        var count_check_balance = 0;
        var min_count_check_balance = 15; //максимальное количество попыток проверки баланса
        var min_timeout_check_balance = 180000; //минимальный интервал который будет проверяться баланс если его не получается получить



        var order_id = null;
        var max_count = 120; //Количество попыток продажи
        var count = 0;
        var start_time = 0;

        try {
            //Проверяем баланс стартовой вершины до выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.start_exchange, edge.start_vertex_currency_local)
                    if (val.success) {
                        balance_start_vertex_before = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }

                if (balance_start_vertex_before > -1) {
                    break;
                }

                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера продажи " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //Проверяем баланс конечной вершины до выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.end_exchange, edge.end_vertex_currency_local)
                    if (val.success) {
                        balance_end_vertex_before = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_end_vertex_before > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера продажи " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }


            //Пытаемся продать валюту
            while (true) {
                try {
                    var val = await api.order_sell_market(start_exchange, market_name, trim_float(quantity, quantity_precision));
                    if (val.success) {
                        order_id = val.order_id;
                    }
                    else {
                        var e = "Ошибка при попытке продать " + market_name + " " + start_exchange + " " + quantity + " " + val.error_msg;
                        console.log(e);
                        error_last = e;
                    }
                    count++;
                }
                catch (error) {
                    var e = "Ошибка при попытке продать " + market_name + " " + start_exchange + " " + quantity + " " + stringify_error(error);
                    console.log(e);
                    error_last = e;
                    count++;
                }
                if (order_id) {
                    break;
                }
                if (count >= max_count) {
                    error = "Достигнуто максимальное количество попыток при попытке продать " + market_name + " " + start_exchange + " " + quantity + " ";
                    break;
                }
            }


            await stop_running(1500);


            //Проверяем баланс стартовой вершины после выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.start_exchange, edge.start_vertex_currency_local);
                    if (val.success) {
                        balance_start_vertex_after = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_start_vertex_after > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера продажи " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //Проверяем баланс конечной вершины после выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.end_exchange, edge.end_vertex_currency_local)
                    if (val.success) {
                        balance_end_vertex_after = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_end_vertex_after > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера продажи " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //При операции продажи, баланс конечной вершины это cost, а баланс стартовой вершины это quantity
            if (error === "") {
                var quantity_ = ((new BigNumber(balance_start_vertex_after)).minus(balance_start_vertex_before)).absoluteValue().toNumber();
                var cost_ = ((new BigNumber(balance_end_vertex_after)).minus(balance_end_vertex_before)).absoluteValue().toNumber();
                resolve({
                    success: true,
                    quantity: quantity_,
                    cost: cost_,
                    order_id: order_id
                });
            }
            else {
                resolve({
                    success: false,
                    sell: order_id ? true : false,
                    order_info: quantity_ && price ? true : false,
                    error_msg: error + "\n" + error_last
                })
            }
        }
        catch (e) {
            resolve({
                success: false,
                sell: order_id ? true : false,
                order_info: false,
                error_msg: error + "\n" + error_last + "\n" + stringify_error(e) + "\n"
            })
        }
    })
}




/** Функция которая пытается купить определенное количество монет, функция возвращает
 * {
 *   success: true,
 *   quantity: 0.5,
 *   cost: 600,
 *   order_id: "d4sg34f3w"
 * }
 * либо
 * {
 *   success: false,
 *   error_msg: "",
 *   buy: false, //была ли успешно купленна валюта
 *   order_info: false  //были ли успешно полученны данные об ордере
 * } 
*/
async function attempts_buy(start_exchange, market_name, quantity, inc_, quantity_precision, edge) {
    return new Promise(async (resolve, reject) => {
        var error = "";
        var error_last = ""; //сюда записывается последняя ошибка которая возращалась

        var balance_start_vertex_before = -1;  //Баланс стартововй вершины до выполнения операции
        var balance_end_vertex_before = -1;   //Баланс конечной вершины до выполнения операции
        var balance_start_vertex_after = -1;  //Баланс стартовой вершины после выполнения операции
        var balance_end_vertex_after = -1;    //Баланс конечной вершины после выполнения операции
        var count_check_balance = 0;
        var min_count_check_balance = 15; //максимальное количество попыток проверки баланса
        var min_timeout_check_balance = 180000; //минимальный интервал который будет проверяться баланс если его не получается получить
        var inc = trim_float(inc_, 10);



        var order_id = null;
        var max_count = 120; //Количество попыток покупки
        var count = 0;

        try {
            //Проверяем баланс стартовой вершины до выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.start_exchange, edge.start_vertex_currency_local)
                    if (val.success) {
                        balance_start_vertex_before = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }

                if (balance_start_vertex_before > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера покупки " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //Проверяем баланс конечной вершины до выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.end_exchange, edge.end_vertex_currency_local)
                    if (val.success) {
                        balance_end_vertex_before = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_end_vertex_before > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера покупки " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }


            //Пытаемся купить валюту
            while (true) {
                try {
                    var val = await api.order_buy_market(start_exchange, market_name, trim_float(quantity, quantity_precision));
                    if (val.success) {
                        order_id = val.order_id;
                    }
                    else {
                        var e = "Ошибка при попытке купить " + market_name + " " + start_exchange + " " + quantity + " " + val.error_msg;
                        console.log(e);
                        error_last = e;
                    }
                    count++;
                }
                catch (error) {
                    var e = "Ошибка при попытке купить " + market_name + " " + start_exchange + " " + quantity + " " + stringify_error(error);
                    console.log(e);
                    error_last = e;
                    count++;
                }
                quantity = (new BigNumber(trim(quantity))).minus(inc).toNumber();
                if (order_id) {
                    break;
                }
                if (count >= max_count) {
                    error = "Достигнуто максимальное количество попыток при попытке купить " + market_name + " " + start_exchange + " " + quantity + " ";
                    break;
                }
            }


            await stop_running(1500);


            //Проверяем баланс стартовой вершины после выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.start_exchange, edge.start_vertex_currency_local);
                    if (val.success) {
                        balance_start_vertex_after = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_start_vertex_after > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера покупки " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //Проверяем баланс конечной вершины после выполнения операции
            start_time = Date.now();
            while (true) {
                try {
                    var val = await api.currency_balance(edge.end_exchange, edge.end_vertex_currency_local)
                    if (val.success) {
                        balance_end_vertex_after = val.available_balance;
                    }
                    else {
                        error_last = val.error_msg;
                    }
                    count_check_balance++;
                }
                catch (e) {
                    error_last = stringify_error(e);
                    count_check_balance++;
                }
                if (balance_end_vertex_after > -1) {
                    break;
                }
                if ((Date.now() - start_time) > min_timeout_check_balance) {
                    if (count_check_balance >= min_count_check_balance) {
                        error = error + "| Ошибка получения баланса до выполнения ордера покупки " + start_exchange + " " + market_name + " quantity:" + quantity;
                        break;
                    }
                }
            }

            //При операции покупки, баланс конечной вершины это quantity, а баланс стартовой вершины это cost
            if (error === "") {
                var quantity_ = ((new BigNumber(balance_end_vertex_after)).minus(balance_end_vertex_before)).absoluteValue().toNumber();
                var cost_ = ((new BigNumber(balance_start_vertex_after)).minus(balance_start_vertex_before)).absoluteValue().toNumber();
                resolve({
                    success: true,
                    quantity: quantity_,
                    cost: cost_,
                    order_id: order_id
                });
            }
            else {
                resolve({
                    success: false,
                    sell: order_id ? true : false,
                    order_info: quantity_ && price ? true : false,
                    error_msg: error + "\n" + error_last
                })
            }
        }
        catch (e) {
            resolve({
                success: false,
                sell: order_id ? true : false,
                order_info: false,
                error_msg: error + "\n" + error_last + "\n" + stringify_error(e) + "\n"
            })
        }
    })
}


/** Функция выполняет задачу принятую от rabbitmq
 * 
 * @param task {
 * task_id: "34gdgfdg-433gdg-435345", //уникальный идентификатор задачи
 * time: 2345533443, //timestamp времени постановки задачи в миллисекундах
 * planned_earning: 34, //Планируемый заработок
 * status: "sended", //статус задачи "sended"(поставленно в очередь), "execute"(принято модулем выполнения и выполняется), "end_success"(успешно выполненно), "end_error"(выполненно с ошибкой), "overdue"(просроченно)
 * route: [
            {
                exchange: {
                    "percent_comission": 0.0018,
                    "fixed_comission": 0,
                    "buy": true,    //купить
                    "sell": false,   //продать
                    "start_vertex_currency_local": "USD",
                    "end_vertex_currency_local": "DASH",
                    "start_vertex_currency_common": "USD",
                    "end_vertex_currency_common": "DASH",
                    "start_exchange": "livecoin",
                    "end_exchange": "livecoin",
                    "market_name": "DASH/USD",
                    "start_balance": 14.94992,
                    "end_balance": 0,
                    "course": 0,
                    "precisions": { price_precision: 5, quantity_precision: 8 }
                }
            },
            {
                exchanges: {
                    "start_vertex_currency_id": 6,
                    "end_vertex_currency_id": 17,
                    "start_vertex_currency_local": "DASH",
                    "end_vertex_currency_local": "DASH",
                    "start_vertex_currency_common": "DASH",
                    "end_vertex_currency_common": "DASH",
                    "start_exchange": "livecoin",
                    "end_exchange": "binance",
                    "start_fixed_comission": 0.002,
                    "start_percent_comission": 0,
                    "start_min": 0,
                    "start_max": 0,
                    "end_fixed_comission": 0,
                    "end_percent_comission": 0,
                    "end_min": 0,
                    "end_max": 0,
                    "use_as_bridge_between_exchanges": true,
                    "start_balance": 	0.03096380,
                    "end_balance": 0
                }
        }
    ]
 * }
 */
async function run_task(task) {
    return new Promise(async (resolve, reject) => {
        await taks_collection.update({ task_id: task.task_id },
            {
                $currentDate: {
                    "receive_rabbit_time": { $type: "timestamp" }
                },
                $set: {
                    "status": "execute"
                }
            })
        var value = await execute_route(task.route);



        if (value.success) {
            await taks_collection.update({ task_id: task.task_id },
                {
                    $set: {
                        "status": "end_success",
                        "execute_time_timestamp": value.execute_time_timestamp,
                        "execute_time_text": value.execute_time_text,
                        "actual_earning": value.earning,
                        "trace_route": value.trace_route
                    }
                })
        }
        else {
            await taks_collection.update({ task_id: task.task_id },
                {
                    $set: {
                        "status": "end_error",
                        "execute_time_timestamp": value.execute_time_timestamp,
                        "execute_time_text": value.execute_time_text,
                        "actual_earning": value.earning,
                        "trace_route": value.trace_route
                    }
                })
        }
        resolve();
    })
}


(async function () {


    amqp.connect(config.rabbit_connection_string, async (err, conn) => {
        conn.createChannel(async (err, ch) => {
            var q = 'trade_tasks';
            ch.assertQueue(q, { durable: true });
            ch.prefetch(1);
            console.log("Waiting tasks. To exit press CTRL+C", q);
            ch.consume(q, async (msg) => {
                var s = msg.content.toString();
                var task = JSON.parse(s);

                if (enable_execute_routes) {
                    if (task.time && !((Date.now() - task.time) > overdue_time)) { //если задание не просроченно
                        current_task_id = task.task_id;
                        send_message_to_telegram("Задача с id: " + task.task_id + ", была успешно принята к выполнению, планируемый заработок: " + task.planned_earning + " " + (task.route[0].exchange ? task.route[0].exchange.start_vertex_currency_common : task.route[0].exchanges.start_vertex_currency_common));
                        await run_task(task);
                        ch.ack(msg);
                    }
                    else {
                        try {
                            await taks_collection.update({ task_id: task.task_id },
                                {
                                    $currentDate: {
                                        "receive_rabbit_time": { $type: "timestamp" }
                                    },
                                    $set: {
                                        "status": "overdue"
                                    }
                                })
                        }
                        catch (err) {
                        }
                        send_message_to_telegram("Задача с id: " + task.task_id + ", была просроченна и пропущенна, планируемый заработок: " + task.planned_earning + " " + (task.route[0].exchange ? task.route[0].exchange.start_vertex_currency_common : task.route[0].exchanges.start_vertex_currency_common));
                        ch.ack(msg);
                    }
                }
                else {
                    await stop_running(100000);
                    ch.reject(msg, true);
                }


            }, { noAck: false });
        });
    });

})()
