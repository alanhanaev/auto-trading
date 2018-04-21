const config = require("../config");
var server = require('http').createServer();
var io = require('socket.io')(server);
const WebSocket = require('ws');
var dateFormat = require('dateformat');
const serializeError = require('serialize-error');
var fs = require('fs');
const crypto = require('crypto');
const queryString = require('qs');
const request = require("request");
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/binance/api_module_' + dateFormat(new Date(), "dd_mm_yyyy hh.MM.ss") + '.log', { flags: 'w' });
var log_stdout = process.stdout;


var api_key = config.binance_api_key;
var secret_key = config.binance_secret_key;


console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};

//var axios = require('axios');
var success_requests = {}; //Сюда будут записываться количество успешных методов и сумма времени выполнения запросов(необходимо чтобы потом найти среднее) в формате {"get_all_order_book": {count:1, summ_requests_time: 100}, "get_user_info":  {count:1, summ_requests_time: 100}}
var req_interval = 1050;       //Интервал между запросами
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
    return hash;
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
        //Берем функцию из очереди
        obj.func();
        //Запускаем функцию
        stackFunctions.splice(stackFunctions.length - 1, 1);
        //Удаляем функцию из очереди
        await stop_running(req_interval * obj.weight);
        //Ставим задержку, умноженную на вес выполненной функции
    }
    setTimeout(repeat, 5);
}
repeat();


function repeat_print_success() {
    for (var key in success_requests) {
        var obj = success_requests[key];
        var average_request_time = obj["summ_requests_time"] > 0 ? obj["summ_requests_time"] / obj["count"] : "0";
        if (average_request_time == "0") { //Если это не методы а успешно принятые events для subscribe
            console.log(get_log_date() + " [INFO] Method: " + key + " , Receive events count: " + obj["count"]);
        }
        else
            console.log(get_log_date() + " [INFO] Method: " + key + " , Requests count: " + obj["count"] + " , Average request time (ms): " + parseInt(average_request_time));
    }
    success_requests = {};
    setTimeout(repeat_print_success, config.printing_success_methods_info_interval);
}
setImmediate(repeat_print_success);


/** Функция добавляет ставит в очередь, функции для выполнения
 * @param high_priority {boolean} устанавливает высокий приоритет запроса, добавляется в начало очереди
 */
function addFunctionToStack(func, weight, order, high_priority) {
    if (high_priority) {
        stackFunctions.push({ func: func, weight: weight, order: order }); //добавляем функцию в конец, то есть она выполнится первой в очереди
    }
    else {
        stackFunctions.unshift({ func: func, weight: weight, order: order });  //добавляем функцию в начало, то есть она выполнится последней в очереди
    }
}


/** Асинхронная функция которая блокирует выполнение функции до тех пор пока до нее не дойдет очередь, если выполняется операция с начислени е баллов то нужно указать любое значение параметра ball */
async function delayFunction(weight = 1, order = false, high_priority = false) {
    return await new Promise((resolve, reject) => {
        addFunctionToStack(resolve, weight, order, high_priority);
    })
}


async function print_req_success(method, proxy = "", start_time) {
    if (!success_requests[method]) {
        success_requests[method] = {};
        success_requests[method]["count"] = 0;
        success_requests[method]["summ_requests_time"] = 0;
    }
    success_requests[method]["count"] += 1;
    if (start_time)
        success_requests[method]["summ_requests_time"] += Date.now() - start_time;
}

async function print_req_error(method, proxy, start_time, error) {
    var s = get_log_date() + " [ERROR] Error method:" + method + " proxy:" + proxy + " request_time:" + (Date.now() - start_time) + " Error info:" + stringify_error(error) + "\n";
    console.log(s);
}


// --------------------  Публичные методы --------------------------/

/** Получает информацию по всем парам валют, возвращает массив */
async function get_exchange_info() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, false);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v1/exchangeInfo";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_exchange_info";
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
        await delayFunction(1, false, false);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v1/depth?symbol=" + pair + "&limit=" + depth;
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


/** Получает информацию по всем кошелькам
 * возвращает
 * 
 */
async function get_coin_info() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, false);
        var start_time = Date.now();
        var url = "https://www.binance.com/assetWithdraw/getAllAsset.html";
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



// -------------------- Конец Публичные методы --------------------------/







// --------------------  Приватные методы --------------------------/


/** Функция размещает лимитный ордер на покупку, возвращает ответ в виде 
 * { symbol: 'BTCUSDT',
  orderId: 40487539,
  clientOrderId: 'gRdQy9XIk5SwUnO4QuJcXk',
  transactTime: 1518263510785,
  price: '1000.00000000',
  origQty: '0.01000000',
  executedQty: '0.00000000',
  status: 'NEW',
  timeInForce: 'GTC',
  type: 'LIMIT',
  side: 'BUY' }
  ----либо такой, если ошибка---
  { code: -1013, msg: 'Filter failure: MIN_NOTIONAL' }
 * */
async function order_buy_limit(symbol, quantity, price) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, true, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            symbol: symbol,
            side: "BUY",
            type: "LIMIT",
            recvWindow: 5000000,
            quantity: quantity,
            price: price,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: { 'X-MBX-APIKEY': api_key },
            form: obj,
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


/** Функция размещает лимитный ордер на продажу, возвращает ответ в виде 
 * { symbol: 'BTCUSDT',
  orderId: 40487539,
  clientOrderId: 'gRdQy9XIk5SwUnO4QuJcXk',
  transactTime: 1518263510785,
  price: '1000.00000000',
  origQty: '0.01000000',
  executedQty: '0.00000000',
  status: 'NEW',
  timeInForce: 'GTC',
  type: 'LIMIT',
  side: 'SELL' }
  ----либо такой, если ошибка---
  { code: -1013, msg: 'Filter failure: MIN_NOTIONAL' }
 * */
async function order_sell_limit(symbol, quantity, price) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, true, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            symbol: symbol,
            side: "SELL",
            type: "LIMIT",
            recvWindow: 5000000,
            quantity: quantity,
            price: price,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: { 'X-MBX-APIKEY': api_key },
            form: obj,
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


/** Функция размещает рыночный ордер на покупку, возвращает ответ в виде 
 * { symbol: 'BTCUSDT',
  orderId: 40775400,
  clientOrderId: 'He9bSz4NIbN4pwP1hPFPej',
  transactTime: 1518283318918,
  price: '0.00000000',
  origQty: '0.00100000',
  executedQty: '0.00100000',
  status: 'FILLED',
  timeInForce: 'GTC',
  type: 'MARKET',
  side: 'SELL' }
  ----либо такой, если ошибка---
  { code: -1013, msg: 'Filter failure: MIN_NOTIONAL' }
 * */
async function order_buy_market(symbol, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, true, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            symbol: symbol,
            side: "BUY",
            type: "MARKET",
            recvWindow: 5000000,
            quantity: quantity,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: { 'X-MBX-APIKEY': api_key },
            form: obj,
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


/** Функция размещает рыночный ордер на продажу, возвращает ответ в виде 
 { symbol: 'BTCUSDT',
  orderId: 40776432,
  clientOrderId: 'J0cUFyTwdQMDByaxDjwmQn',
  transactTime: 1518283401565,
  price: '0.00000000',
  origQty: '0.00100000',
  executedQty: '0.00100000',
  status: 'FILLED',
  timeInForce: 'GTC',
  type: 'MARKET',
  side: 'BUY' }
  ----либо такой, если ошибка---
  { code: -1013, msg: 'Filter failure: MIN_NOTIONAL' }
 * */
async function order_sell_market(symbol, quantity) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, true, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            symbol: symbol,
            side: "SELL",
            type: "MARKET",
            recvWindow: 5000000,
            quantity: quantity,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: { 'X-MBX-APIKEY': api_key },
            form: obj,
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


/** Функция отменяет лимитный ордер, возвращает ответ в виде 
 { symbol: 'BTCUSDT',
  origClientOrderId: 'eJgWVZkLnNG5yaRozmnVec',
  orderId: 40783385,
  clientOrderId: 'Pz19FjZRk0muUOAR2qRByP' }
  ----либо такой, если ошибка---
 { code: -1100,
  msg: 'Illegal characters found in parameter \'orderId\'; legal range is \'^[0-9]{1,20}$\'.' }
 * */
async function order_cancel(symbol, order_id) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            orderId: order_id,
            symbol: symbol,
            recvWindow: 5000000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.delete({
            url: url,
            headers: { 'X-MBX-APIKEY': api_key },
            form: obj,
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


/** Функция получает информацию об ордере, возвращает ответ в виде 
 { symbol: 'BTCUSDT',
  orderId: 40841546,
  clientOrderId: 'Q8bP4dLQVsaho8jydFPmod',
  price: '11000.00000000',
  origQty: '0.00100000',
  executedQty: '0.00000000',
  status: 'NEW',  //'NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'
  timeInForce: 'GTC',
  type: 'LIMIT',
  side: 'SELL',
  stopPrice: '0.00000000',
  icebergQty: '0.00000000',
  time: 1518288772096,
  isWorking: true }
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }
 * */
async function order_info(symbol, order_id) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/order";
        var obj = {
            orderId: order_id,
            symbol: symbol,
            recvWindow: 300000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(obj),
            headers: { 'X-MBX-APIKEY': api_key },
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


/** Функция получает информацию о балансах, возвращает ответ в виде 
  {
  "makerCommission": 15,
  "takerCommission": 15,
  "buyerCommission": 0,
  "sellerCommission": 0,
  "canTrade": true,
  "canWithdraw": true,
  "canDeposit": true,
  "updateTime": 123456789,
  "balances": [
    {
      "asset": "BTC",
      "free": "4723846.89208129",
      "locked": "0.00000000"
    },
    {
      "asset": "LTC",
      "free": "4763368.68006011",
      "locked": "0.00000000"
    }
  ]
 }
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }
 * */
async function currency_balances() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://api.binance.com/api/v3/account";
        var obj = {
            recvWindow: 300000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(obj),
            headers: { 'X-MBX-APIKEY': api_key },
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


/** Функция отправляет запрос на вывод средств, при отправке необходимо указывать всю сумму вместе с комиссией, комиссия вычтется из нее автоматический, возвращает ответ в виде 
 [
  {
    "msg": "success",
    "success": true,
    "id":"7213fea8e94b4a5593d507237e5a555b"
  }
 ]
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }, { msg: 'Illegal ip address.', success: false }
 * */
async function withdraw_request(amount, currency, wallet) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://www.binance.com/wapi/v3/withdraw.html";
        var obj = {
            address: wallet,
            amount: amount,
            asset: currency,
            name: "addressName",
            recvWindow: 500000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.post({
            url: url + "?" + queryString.stringify(obj),
            headers: { 'X-MBX-APIKEY': api_key },
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
 {
    "depositList": [
        {
            "insertTime": 1508198532000,
            "amount": 0.04670582,
            "asset": "ETH",
            "address": "0x6915f16f8791d0a1cc2bf47c13a6b2a92000504b",
            "txId": "0xdf33b22bdb2b28b1f75ccd201a4a4m6e7g83jy5fc5d5a9d1340961598cfcb0a1",
            "status": 1 // 0(0:pending,1:success)
        },
        {
            "insertTime": 1508298532000,
            "amount": 1000,
            "asset": "XMR",
            "address": "463tWEBn5XZJSxLU34r6g7h8jtxuNcDbjLSjkn3XAXHCbLrTTErJrBWYgHJQyrCwkNgYvyV3z8zctJLPCZy24jvb3NiTcTJ",
            "addressTag": "342341222",
            "txId": "b3c6219639c8ae3f9cf010cdc24fw7f7yt8j1e063f9b4bd1a05cb44c4b6e2509",
            "status": 1
        }
    ],
    "success": true
 }
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }
 * */
async function get_deposit_transactions(start_time, end_time) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://www.binance.com/wapi/v3/depositHistory.html";
        var obj = {
            startTime: start_time,
            endTime: end_time,
            recvWindow: 500000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(obj),
            headers: { 'X-MBX-APIKEY': api_key },
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



/** Функция получает адрес кошелька для депозита
  {
    "address": "0x6915f16f8791d0a1cc2bf47c13a6b2a92000504b",
    "success": true,
    "addressTag": "1231212",
    "asset": "BNB"
  }
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }
 * */

async function get_deposit_address(currency) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(1, false, true);
        var start_time = Date.now();
        var url = "https://www.binance.com/wapi/v3/depositAddress.html";
        var obj = {
            asset: currency,
            recvWindow: 500000,
            timestamp: Date.now()
        }
        obj.signature = get_signature(obj);
        var proxy = balancer_get_proxy();
        request.get({
            url: url + "?" + queryString.stringify(obj),
            headers: { 'X-MBX-APIKEY': api_key },
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






// -------------------- Конец Приватные методы --------------------------/


(async function () {
    var ws = null;
    io.on('connection', (client) => {
        client.on("disconnect", () => {
            console.log("disconnect");
            if (ws) {
                ws.close();
                ws.terminate();
                console.log(get_log_date() + " [WARN] Закрытие соединения по сокетам");
            }
        })

        client.on("close", () => {
            console.log("close");
            if (ws) {
                ws.close();
                ws.terminate();
                console.log(get_log_date() + " [WARN] Закрытие соединения по сокетам");
            }
        })

        client.on('subscribe_markets', (markets) => {
            var combine_string = "";
            for (var i = 0; i < markets.length; i++) {
                combine_string += i === 0 ? markets[i].toLowerCase() + '@depth' : "/" + markets[i].toLowerCase() + '@depth';
            }
            ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + combine_string, {
                perMessageDeflate: false
            });

            ws.on('open', (e) => {
                console.log(get_log_date() + ' [INFO] Connect wss for ' + combine_string);
            });
            ws.on('close', (e) => {
                console.log(get_log_date() + ' [WARN] Disconnect wss for ' + combine_string);
            });
            ws.on('message', (data) => {
                print_req_success("subscribe_markets", "");
                client.emit('subscribe_markets_data', data);
            });
        });

        client.on('close_connect_subscribe_markets', () => {
            console.log(get_log_date() + " [WARN] Команда закрытия соединения");
            if (ws) {
                ws.close();
                ws.terminate();
                console.log(get_log_date() + " [WARN] Закрытие соединения по сокетам");
            }
        });


        client.on('get_exchange_info', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_exchange_info().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
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

        //---------------- Приватные методы ----------------------------

        client.on('order_buy_limit', async function (secret_key, symbol, quantity, price, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_buy_limit(symbol, quantity, price).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_sell_limit', async function (secret_key, symbol, quantity, price, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_sell_limit(symbol, quantity, price).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_buy_market', async function (secret_key, symbol, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_buy_market(symbol, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_sell_market', async function (secret_key, symbol, quantity, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_sell_market(symbol, quantity).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_cancel', async function (secret_key, symbol, order_id, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_cancel(symbol, order_id).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_info', async function (secret_key, symbol, order_id, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_info(symbol, order_id).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('currency_balances', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await currency_balances().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
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

        //---------------- Конец Приватные методы ----------------------------

    });
    io.on('disconnect', async function (client) {
        console.log(get_log_date() + ' [ERROR] disconnect client');
        if (ws) {
            ws.close();
            ws.terminate();
            console.log(get_log_date() + " [WARN] Закрытие соединения по сокетам");
        }
    });
    server.listen(config.binance_api_module_port);
})()