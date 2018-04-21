const config = require("../config");
var server = require('http').createServer();
var io = require('socket.io')(server);
var dateFormat = require('dateformat');
var fs = require('fs');
const request = require("request");
const crypto = require('crypto');
const queryString = require('qs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/livecoin/api_module_' + dateFormat(new Date(), "dd_mm_yyyy hh.MM.ss") + '.log', { flags: 'w' });
const serializeError = require('serialize-error');
var log_stdout = process.stdout;

var api_key = config.livecoin_api_key;

var secret_key = config.livecoin_secret_key;



console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};

var success_requests = {}; //Сюда будут записываться количество успешных методов и сумма времени выполнения запросов(необходимо чтобы потом найти среднее) в формате {"get_all_order_book": {count:1, summ_requests_time: 100}, "get_user_info":  {count:1, summ_requests_time: 100}}
var req_interval = 1200;       //Интервал между запросами
var balls = 0;                  //счетчик баллов, баллы начисляются при вызовах методов создания и отмены ордеров
var balls_max_count = 11;        //максимальное количество баллов после которого блокируются вызовы к api на промежуток balls_max_count_interval
var balls_max_count_interval = 10000;  //промежуток на который блокируются вызовы api по достижению определенного количества баллов
var stackFunctions = [];     //стек функций для выполнения
var list_proxys = config.proxy_list;
var cur_proxy = -1; //текущий прокси сервер который будет возращать функция балансировщик
req_interval = req_interval / list_proxys.length; //делим интервал на количество прокси серверов


/*
При работе с API действуют следующие ограничения:
1. Разрешается не более 60 любых запросов к API в течении 60 секунд подряд с одного IP адреса.
2. Разрешается создать/отменить не более 10 ордеров одновременно.

При работе с API действует бальная система. Вы начинаете с 0 баллов. Каждый новый ордер или отмена ордера - увеличивают ваш счетчик на 1 балл, максимальное количество баллов 10, по достижении 11 баллов происходит блокировка работы с АPI на 2 секунды, пока счетчик не опустится до 10. Каждые 2 секунды счетчик падает на 1 балл.

Однако, если вы превысили лимит 10 баллов и не делаете новые запросы, то счетчик обнуляется быстрее, потребуется всего 10 секунд до полного обнуления счетчика.

В случае превышения лимита 60 запросов за 60 секунд, Ваш IP блокируется на 20 минут и автоматически разблокируется спустя указанное время. Подсчитываются все запросы, как приватные так и публичные с одного IP адреса.

*/

/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
}

/** Возвращает текущее время для вывода его в логах  */
function get_log_date() {
    return "" + dateFormat(new Date(), "dd.mm.yyyy HH:MM:ss");
}

function get_signature(obj) {
    var query = queryString.stringify(obj);
    const hash = crypto.createHmac('sha256', secret_key).update(query).digest('hex');
    return hash.toUpperCase();
}


/** Функция балансировщик которая возвращает нам один из прокси серверов по очередно */
function balancer_get_proxy() {
    cur_proxy++;
    if (cur_proxy >= list_proxys.length) {
        cur_proxy = 0;
    }
    return list_proxys[cur_proxy];
}


/** Функция выполняет выполнения асинхронной программы на заданный промежуток времени */
async function stop_running(time) {
    return await new Promise((resolve, reject) => {
        setTimeout(() => { resolve() }, time)
    });
}

/** Постоянно выполняемая функция, она отслеживает изменения в стеке функций и если они есть то выполняет их */
async function repeat() {
    if (stackFunctions.length > 0) {
        var obj = stackFunctions[stackFunctions.length - 1];
        if (obj.ball) { //прибавляем баллы
            balls++;
        }
        obj.func();
        stackFunctions.splice(stackFunctions.length - 1, 1);
        if (balls >= balls_max_count) {
            balls = 0;
            await stop_running(balls_max_count_interval);
        }
        else {
            await stop_running(req_interval);
        }
    }
    setTimeout(repeat, 5);
}
repeat();


function repeat_print_success() {
    for (var key in success_requests) {
        var obj = success_requests[key];
        var average_request_time = obj["summ_requests_time"] > 0 ? obj["summ_requests_time"] / obj["count"] : "0";
        console.log(get_log_date() + " [INFO] Method: " + key + " , Requests count: " + obj["count"] + " , Average request time (ms): " + parseInt(average_request_time));
    }
    success_requests = {};
    setTimeout(repeat_print_success, config.printing_success_methods_info_interval);
}
setImmediate(repeat_print_success);



/** Функция добавляет ставит в очередь, функции для выполнения
 * @param high_priority {boolean} устанавливает высокий приоритет запроса, добавляется в начало очереди
 * @param ball {boolean} является ли запрос запросом который начисляет баллы
 */
function addFunctionToStack(func, ball, high_priority) {
    if (high_priority) {
        stackFunctions.push({ func: func, ball: ball ? true : false }); //добавляем функцию в конец, то есть она выполнится первой в очереди
    }
    else {
        stackFunctions.unshift({ func: func, ball: ball ? true : false });  //добавляем функцию в начало, то есть она выполнится последней в очереди
    }

}


/** Асинхронная функция которая блокирует выполнение функции до тех пор пока до нее не дойдет очередь, если выполняется операция с начислени е баллов то нужно указать любое значение параметра ball */
async function delayFunction(ball, high_priority) {
    return await new Promise((resolve, reject) => {
        addFunctionToStack(resolve, ball, high_priority);
    })
}


async function print_req_success(method, proxy = "", start_time) {
    if (!success_requests[method]) {
        success_requests[method] = {};
        success_requests[method]["count"] = 0;
        success_requests[method]["summ_requests_time"] = 0;
    }
    success_requests[method]["count"] += 1;
    success_requests[method]["summ_requests_time"] += Date.now() - start_time;
}

async function print_req_error(method, proxy, start_time, error) {
    var s = get_log_date() + " [ERROR] Error method:" + method + " прокси:" + proxy + " request_time:" + (Date.now() - start_time) + " Error info:" + stringify_error(error) + "\n";
    console.log(s);
}



//-------------- Публичные данные ----------------------

/** Получает информацию по заданной паре валют, возвращает объект */
async function get_course_info_pair(pair) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, false);
        var start_time = Date.now();
        var url = pair ? "https://api.livecoin.net/exchange/ticker?currencyPair=" + pair : "https://api.livecoin.net/exchange/ticker";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_course_info_pair";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                return reject(error);
            }
            try {
                resolve(JSON.parse(body));
                print_req_success(func_name, proxy, start_time);
            }
            catch (e) {
                print_req_error(func_name, proxy, start_time, e);
                reject(e);
            }
        });
    })
}


/** Получает информацию по всем парам валют, возвращает массив */
async function get_course_info_pairs() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, false);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/ticker";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_course_info_pairs";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                return reject(error);
            }
            try {
                resolve(JSON.parse(body));
                print_req_success(func_name, proxy, start_time);
            }
            catch (e) {
                print_req_error(func_name, proxy, start_time, e);
                reject(e);
            }
        });
    })
}


/** Получает информацию по всем парам валют, возвращает массив */
async function get_all_order_books() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, false);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/all/order_book";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_all_order_books";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                return reject(error);
            }
            try {
                resolve(JSON.parse(body));
                print_req_success(func_name, proxy, start_time);
            }
            catch (e) {
                print_req_error(func_name, proxy, start_time, e);
                reject(e);
            }
        });
    })
};


/** Получает информацию по паре валют */
async function get_order_book(pair, depth) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, false);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/order_book?currencyPair=" + pair + "&depth=" + depth;
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_order_book";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                return reject(error);
            }
            try {
                resolve(JSON.parse(body));
                print_req_success(func_name, proxy, start_time);
            }
            catch (e) {
                print_req_error(func_name, proxy, start_time, e);
                reject(e);
            }
        });
    })
};


/** Получает информацию по информации о кошельках 
 *  walletStatus - статус кошелька
    normal - Кошелек работает нормально
    delayed - Кошелек задерживается (нет нового блока 1-2 часа)
    blocked - Кошелек не синхронизирован (нет нового блока минимум 2 часа)
    blocked_long - Последний блок получен более 24 ч. назад
    down - Кошелек временно выключен
    delisted - Монета будет удалена с биржи, заберите свои средства
    closed_cashin - Разрешен только вывод
    closed_cashout - Разрешен только ввод
 * Возращает
 * {
    "success": true,
    "minimalOrderBTC": "0.0005",
    "info": [
        {
            "name": "MaidSafeCoin",
            "symbol": "MAID",
            "walletStatus": "down",
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
} 
 */
async function get_coin_info() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, false);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/info/coinInfo";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_coin_info";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                return reject(error);
            }
            try {
                resolve(JSON.parse(body));
                print_req_success(func_name, proxy, start_time);
            }
            catch (e) {
                print_req_error(func_name, proxy, start_time, e);
                reject(e);
            }
        });
    })
};

//-------------- Конец Публичные методы ----------------------



//-------------- Приватные методы ----------------------

/** Функция размещает лимитный ордер на покупку, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
async function order_buy_limit(currency_pair, price, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/buylimit";
        var params = {
            currencyPair: currency_pair,
            price: price,
            quantity: quantity
        }
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_buy_limit";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция размещает лимитный ордер на продажу, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
async function order_sell_limit(currency_pair, price, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/selllimit";
        var params = {
            currencyPair: currency_pair,
            price: price,
            quantity: quantity
        }
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_sell_limit";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция размещает рыночный ордер на покупку, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
async function order_buy_market(currency_pair, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/buymarket";
        var params = {
            currencyPair: currency_pair,
            quantity: quantity
        }
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_buy_market";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция размещает рыночный ордер на продажу, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
async function order_sell_market(currency_pair, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/sellmarket";
        var params = {
            currencyPair: currency_pair,
            quantity: quantity
        }
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_sell_market";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция отменяет лимитный ордер, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"cancelled": true,"message": null,"quantity": 0.0005,"tradeQuantity": 0} } */
async function order_cancel(currency_pair, order_id) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/cancellimit";
        var params = {
            currencyPair: currency_pair,
            orderId: order_id
        }
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_cancel";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает список ордеров по конкретной паре за последние 12 часов, возвращает ответ в виде  
 *  {
    "totalRows": 2,
    "startRow": 0,
    "endRow": 1,
    "data": [
        {
            "id": 4910,
            "currencyPair": "BTC/USD",
            "goodUntilTime": 0,
            "type": "MARKET_SELL",
            "orderStatus": "EXECUTED",
            "issueTime": 1409920636701,
            "price": null,
            "quantity": 2.85714285,
            "remainingQuantity": 0,
            "commission": null,
            "commissionRate": 0.005,
            "lastModificationTime": 1409920636701
        }
    ]
    }
 * @param {string} open_closed Возможные значения: ALL - Все ордера, OPEN - Открытые ордера, CLOSED - Закрытые (исполненные и отмененные) ордера, CANCELLED - Отмененные ордера, NOT_CANCELLED - Все ордера, кроме отмененных, PARTIALLY - Частично исполненные ордера
 * @param {string} record_count количество записей которое нам вернет запрос
 */
async function order_client_orders(currency_pair, open_closed, record_count) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/client_orders";
        var params = {
            currencyPair: currency_pair,
            endRow: record_count - 1,
            issuedFrom: Date.now() - 43200000, //за последние 12 часов
            issuedTo: Date.now(),
            openClosed: open_closed
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(params),
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_client_orders";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает информацию об ордере, возвращает ответ в виде  
 *  {
    "id": 88504958,
    "client_id": 1150,
    "status": "CANCELLED",  // "OPEN", "EXECUTED", "CANCELLED"    
    "symbol": "DASH/USD",
    "price": 1.5,
    "quantity": 1.2,
    "remaining_quantity": 1.2,
    "blocked": 1.8018,
    "blocked_remain": 0,
    "commission_rate": 0.001,
    "trades": null
 }
 * @param {string} order_id идентификатор ордера
 */
async function order_info(order_id) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/exchange/order";
        var params = {
            orderId: order_id,
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(params),
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "order_info";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция доступный баланс по одной валюте, возвращает ответ в виде
 * {
    "type": "available",
    "currency": "DMC",
    "value": 0
 }
 * @param {string} currency идентификатор валюты
 */
async function currency_balance(currency) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/payment/balance";
        var params = {
            currency: currency,
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(params),
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "currency_balance";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает баланс по всем валютам, возвращает ответ в виде
 [
    {
        "type": "total",  //общий 
        "currency": "USD",
        "value": 20
    },
    {
        "type": "available", //доступный
        "currency": "USD",
        "value": 10
    },
    {
        "type": "trade",   //средства в открытых ордерах
        "currency": "USD",
        "value": 10
    },
    {
        "type": "available_withdrawal", //доступный для вывода
        "currency": "USD",
        "value": 10
    },
    {
        "type": "total",
        "currency": "EUR",
        "value": 15
    }
 ]
 * @param {string} currencys Список валют, через запятую. Если не указан то возвращает все
 */
async function currency_balances(currencys) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/payment/balances";
        var sign = "";
        if (currencys) {
            //Если параметр currencys указан
            var params = {
                currency: currencys,
            };
            sign = get_signature(params);
            url = "https://api.livecoin.net/payment/balances?currency=" + currencys;
        }
        else {
            //Если параметр currencys не указан
            var params = {
            };
            sign = get_signature(params);
            url = "https://api.livecoin.net/payment/balances";
        }
        var proxy = balancer_get_proxy();
        request.get({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "currency_balances";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}



/** Функция отправляет запрос на вывод средств, при указании количества необходимо указывать сумму без комиссии, возвращает ответ в виде
 * {
    "fault": null,
    "userId": 797,
    "userName": "poorguy",
    "id": 11285042,
    "state": "APPROVED",
    "createDate": 1432197911364,
    "lastModifyDate": 1432197911802,
    "verificationType": "NONE",
    "verificationData": null,
    "comment": null,
    "description": "Transfer from Livecoin",
    "amount": 0.002,
    "currency": "BTC",
    "accountTo": "B1099909",
    "acceptDate": null,
    "valueDate": null,
    "docDate": 1432197911364,
    "docNumber": 11111111,
    "correspondentDetails": null,
    "accountFrom": "B0000001",
    "outcome": false,
    "external": null,
    "externalKey": "1111111",
    "externalSystemId": 18,
    "externalServiceId": null,
    "wallet": "1111111"
 }
 * @param {string} amount сумма вывода
 * @param {string} currency идентификатор валюты
 * @param {string} wallet кошелек
 */
async function withdraw_request(amount, currency, wallet) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/payment/out/coin";
        var params = {
            amount: amount,
            currency: currency,
            wallet: wallet
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            form: params,
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "withdraw_request";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает список депозитов, возвращает ответ в виде
 [
    {
        "id": "OK521780496",
        "type": "DEPOSIT",
        "date": 1431882524782,
        "amount": 27190,
        "fee": 269.2079208,
        "fixedCurrency": "RUR",
        "taxCurrency": "RUR",
        "variableAmount": null,
        "variableCurrency": null,
        "external": "OkPay",
        "login": null
    }
 ]
 */
async function get_deposit_transactions(start_time_t, end_time_t) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/payment/history/transactions";
        var params = {
            end: end_time_t,
            start: start_time_t,
            types: "DEPOSIT"
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(params),
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "get_deposit_transactions";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция возвращает адрес кошелька для депозита
 * { 
  fault: null,
  userId: 316489,
  userName: 'hanik',
  currency: 'ETH',
  wallet: '0xa7defc0023b9900a33bec3098bb2ff9a82ba903f' 
  }
*/
async function get_deposit_address(currency) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false, true);
        var start_time = Date.now();
        var url = "https://api.livecoin.net/payment/get/address";
        var params = {
            currency: currency
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(params),
            headers: {
                'Api-key': api_key,
                'Sign': sign
            },
            proxy: proxy
        },
            (error, response, body) => {
                var func_name = "get_deposit_address";
                if (error) {
                    print_req_error(func_name, proxy, start_time, error);
                    reject(new Error(error.message));
                    return;
                }
                try {
                    resolve({ status_code: response.statusCode, status_message: response.statusMessage, value: JSON.parse(body) });
                    print_req_success(func_name, proxy, start_time);
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


//-------------- Конец Приватные методы ----------------------


(async function () {
    io.on('connection', async function (client) {
        //-------------- Публичные методы ----------------------
        client.on('get_all_order_books', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_all_order_books().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_course_info_pairs', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_course_info_pairs().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_course_info_pair', async function (secret_key, pair, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_course_info_pair(pair).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_order_book', async function (secret_key, pair, depth, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_order_book(pair, depth).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_order_books', async function (secret_key, pairs, depth, cb) {
            if (secret_key === config.api_modules_secret_key) {
                var arr_promises = [];
                for (var i = 0; i < pairs.length; i++) {
                    arr_promises.push(get_order_book(pairs[i], depth));
                }
                var all_promise = Promise.all(arr_promises);
                if (arr_promises.length > 0)
                    all_promise
                        .then((val) => {
                            for (var i = 0; i < val.length; i++) {
                                val[i].market_name = pairs[i];
                            }
                            cb(val, null);
                        })
                        .catch((error) => {
                            cb(null, error);
                        })
                else
                    cb([], null);
            }
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_coin_info', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_coin_info().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });


        //-------------- Конец Публичные методы ----------------------



        //-------------- Приватные методы ----------------------

        client.on('order_buy_limit', async function (secret_key, currency_pair, price, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_buy_limit(currency_pair, price, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_sell_limit', async function (secret_key, currency_pair, price, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_sell_limit(currency_pair, price, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_buy_market', async function (secret_key, currency_pair, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_buy_market(currency_pair, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_sell_market', async function (secret_key, currency_pair, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_sell_market(currency_pair, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_cancel', async function (secret_key, currency_pair, order_id, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_cancel(currency_pair, order_id).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_client_orders', async function (secret_key, currency_pair, open_closed, record_count, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_client_orders(currency_pair, open_closed, record_count).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_info', async function (secret_key, order_id, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_info(order_id).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('currency_balance', async function (secret_key, currency, cb) {
            if (secret_key === config.api_modules_secret_key)
                await currency_balance(currency).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('currency_balances', async function (secret_key, currencys, cb) {
            if (secret_key === config.api_modules_secret_key)
                await currency_balances(currencys).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('withdraw_request', async function (secret_key, amount, currency, wallet, cb) {
            if (secret_key === config.api_modules_secret_key)
                await withdraw_request(amount, currency, wallet).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_deposit_transactions', async function (secret_key, start_time, end_time, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_deposit_transactions(start_time, end_time).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_deposit_address', async function (secret_key, currency, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_deposit_address(currency).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        //-------------- Конец Приватные методы ----------------------

    });
    io.on('disconnect', async function (client) {
        var t = 9;
    });
    server.listen(config.livecoin_api_module_port);
})()