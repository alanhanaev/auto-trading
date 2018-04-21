const config = require("../config");
var server = require('http').createServer();
var io = require('socket.io')(server);
var dateFormat = require('dateformat');
var fs = require('fs');
const request = require("request");
var CryptoJS = require("crypto-js")
const queryString = require('qs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/logs/exmo/api_module_' + dateFormat(new Date(), "dd_mm_yyyy hh.MM.ss") + '.log', { flags: 'w' });
const serializeError = require('serialize-error');
var log_stdout = process.stdout;

var api_key = config.exmo_api_key;
var secret_key = config.exmo_secret_key;


var success_requests = {}; //Сюда будут записываться количество успешных методов и сумма времени выполнения запросов(необходимо чтобы потом найти среднее) в формате {"get_all_order_book": {count:1, summ_requests_time: 100}, "get_user_info":  {count:1, summ_requests_time: 100}}
var nonce = Math.floor(Date.now() / 1000)
var req_interval = 350;       //Интервал между запросами
var req_interval_wallet_history = 7000; //интервал между запросами для wallet api
var stackFunctions = [];     //стек функций для выполнения
var list_proxys = config.proxy_list;
var cur_proxy = -1; //текущий прокси сервер который будет возращать функция балансировщик
req_interval = req_interval / list_proxys.length; //делим интервал на количество прокси серверов
req_interval_wallet_history = req_interval_wallet_history / list_proxys.length; //делим интервал на количество прокси серверов
var last_time_wallet_request = Date.now();  //время последнего запроса для wallet api




/** Сериализует ошибку в текст */
function stringify_error(error) {
    return JSON.stringify(serializeError(error));
}

/** Возвращает текущее время для вывода его в логах  */
function get_log_date() {
    return "" + dateFormat(new Date(), "dd.mm.yyyy HH:MM:ss");
}

console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};


function get_nonce() {
    nonce++;
    return nonce;
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

var ttt = 1;
/** Постоянно выполняемая функция, она отслеживает изменения в стеке функций и если они есть то выполняет их */
async function repeat() {
    if (stackFunctions.length > 0) {
        var obj = stackFunctions[stackFunctions.length - 1];
        if (obj.wallet_request) {

            if (Date.now() - last_time_wallet_request < req_interval_wallet_history) {
                stackFunctions.unshift(obj);
                //Если еще не прошло достаточно времени с последнего запроса на wallet history
                stackFunctions.splice(stackFunctions.length - 1, 1);
                //добавили функцию в начало, то есть она выполнится последней в очереди
            }
            else {
                //Если прошло достаточно времени с последнего запроса wallet history
                console.log(ttt);
                ttt++;
                obj.func();
                stackFunctions.splice(stackFunctions.length - 1, 1);
                last_time_wallet_request = Date.now();
            }
        }
        else {
            obj.func();
            stackFunctions.splice(stackFunctions.length - 1, 1);
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
 */
function addFunctionToStack(func, high_priority, wallet_req) {
    if (high_priority) {
        stackFunctions.push({ func: func, wallet_request: wallet_req }); //добавляем функцию в конец, то есть она выполнится первой в очереди
    }
    else {
        stackFunctions.unshift({ func: func, wallet_request: wallet_req });  //добавляем функцию в начало, то есть она выполнится последней в очереди
    }
}


/** Асинхронная функция которая блокирует выполнение функции до тех пор пока до нее не дойдет очередь, если выполняется операция с начислени е баллов то нужно указать любое значение параметра ball */
async function delayFunction(high_priority, wallet_req = false) {
    return await new Promise((resolve, reject) => {
        addFunctionToStack(resolve, high_priority, wallet_req);
    })
}


/** Конвертировать список пар в строку разделив их запятыми 
 * @param pairs ["ETH_USD", "BTC_USD"]
*/
function get_str_split_dot(pairs) {
    var s = "";
    pairs.map((val, index) => {
        if (index !== pairs.length - 1)
            s += val + ',';
        else
            s += val;
    })
    return s;
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


function get_signature(obj) {
    var query = queryString.stringify(obj);
    const hash = CryptoJS.HmacSHA512(query, config.exmo_secret_key).toString(CryptoJS.enc.hex);
    return hash;
}



//-------------- Публичные данные ----------------------

/** Получает информацию по всем валютным парам 
 * Вовзращает результат 
 * { success: true, value: {
        "BTC_USD": {
            "buy_price": "589.06",
            "sell_price": "592",
            "last_trade": "591.221",
            "high": "602.082",
            "low": "584.51011695",
            "avg": "591.14698808",
            "vol": "167.59763535",
            "vol_curr": "99095.17162071",
            "updated": 1470250973
        },
            "ETH_USD": {
            "buy_price": "589.06",
            "sell_price": "592",
            "last_trade": "591.221",
            "high": "602.082",
            "low": "584.51011695",
            "avg": "591.14698808",
            "vol": "167.59763535",
            "vol_curr": "99095.17162071",
            "updated": 1470250973
        }
      }
    }
    либо 
    { success: false, error_msg: "" }
*/
async function get_info_pairs() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/ticker/";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_info_pairs";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                resolve({ success: false, error_msg: error.message });
                return;
            }
            if (response.statusCode == 200) {
                try {
                    print_req_success(func_name, proxy, start_time);
                    resolve({ success: true, value: JSON.parse(body) });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    resolve({ success: false, error_msg: e.message });
                }
            }
            else {
                print_req_error(func_name, proxy, start_time, new Error(response.statusCode + " " + response.statusMessage));
                resolve({ success: false, error_msg: response.statusCode + " " + response.statusMessage });
            }
            return;
        });
    })
}


/** Получает настройки валютных пар
 * Вовзращает результат 
 *  { success: true, value: {
        "BTC_USD": {
            "min_quantity": "0.001",
            "max_quantity": "100",
            "min_price": "1",
            "max_price": "10000",
            "max_amount": "30000",
            "min_amount": "1"
        },
        "ETH_USD": {
            "min_quantity": "0.001",
            "max_quantity": "100",
            "min_price": "1",
            "max_price": "10000",
            "max_amount": "30000",
            "min_amount": "1"
        }
      }
    }
    либо 
    { success: false, error_msg: "" }
*/
async function get_pair_settings() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/pair_settings/";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_pair_settings";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                resolve({ success: false, error_msg: error.message });
                return;
            }
            if (response.statusCode == 200) {
                try {
                    print_req_success(func_name, proxy, start_time);
                    resolve({ success: true, value: JSON.parse(body) });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    resolve({ success: false, error_msg: e.message });
                }
            }
            else {
                print_req_error(func_name, proxy, start_time, new Error(response.statusCode + " " + response.statusMessage));
                resolve({ success: false, error_msg: response.statusCode + " " + response.statusMessage });
            }
            return;
        });
    })
}


/** Получает список валют биржи
 * Вовзращает результат 
 * { success: true, value: ["USD","EUR","RUB","BTC","DOGE","LTC"] }
 * либо 
 * { success: false, error_msg: "" }
 */
async function get_currency_list() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/currency/";
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_currency_list";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                resolve({ success: false, error_msg: error.message });
                return;
            }
            if (response.statusCode == 200) {
                try {
                    print_req_success(func_name, proxy, start_time);
                    resolve({ success: true, value: JSON.parse(body) });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    resolve({ success: false, error_msg: e.message });
                }
            }
            else {
                print_req_error(func_name, proxy, start_time, new Error(response.statusCode + " " + response.statusMessage));
                resolve({ success: false, error_msg: response.statusCode + " " + response.statusMessage });
            }
            return;
        });
    })
}


/** Получает список ордеров по валютным парам
 * Вовзращает результат 
 *  * { success: true, value: {
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
  }
   либо 
   { success: false, error_msg: "" }
  @param pairs ['ETH_USD', 'BTC_USD']
  @param limit 1000 количество отображаемых позиций
*/
async function get_order_books(pairs, limit = 100) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/order_book/?limit=" + limit + "&pair=" + get_str_split_dot(pairs);
        var proxy = balancer_get_proxy();
        request.get({ url: url, proxy: proxy }, (error, response, body) => {
            var func_name = "get_order_books";
            if (error) {
                print_req_error(func_name, proxy, start_time, error);
                resolve({ success: false, error_msg: error.message });
                return;
            }
            if (response.statusCode == 200) {
                try {
                    print_req_success(func_name, proxy, start_time);
                    resolve({ success: true, value: JSON.parse(body) });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    resolve({ success: false, error_msg: e.message });
                }
            }
            else {
                print_req_error(func_name, proxy, start_time, new Error(response.statusCode + " " + response.statusMessage));
                resolve({ success: false, error_msg: response.statusCode + " " + response.statusMessage });
            }
            return;
        });
    })
}

//-------------- Конец Публичные данные ----------------------





//-------------- Приватные данные ----------------------

/** Функция возвращает список доступных балансов пользователя
 * Возвращает 
 * { success: true, value: 
 *   {
        "uid": 10542,
        "server_date": 1435518576,
        "balances": {
             "BTC": "970.994",
             "USD": "949.47"
        },
        "reserved": {
             "BTC": "3",
             "USD": "0.5"
        }
    }
   }
   либо 
   { success: false, error_msg: "" }
 */
async function user_info() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/user_info";
        var params = {
            nonce: get_nonce()
        };
        var proxy = balancer_get_proxy();
        var sign = get_signature(params);
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "user_info";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция создает ордер 
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
        "result": true,
        "error": "",
        "order_id": 123456
     } 
   }
   либо 
   { success: false, error_msg: "" }
   @param pair "ETH_USD"
   @param quantity 0.2
   @param price 150
   @param type  buy - ордер на покупку
                sell - ордер на продажу
                market_buy - ордера на покупку по рынку
                market_sell - ордер на продажу по рынку
                market_buy_total - ордер на покупку по рынку на определенную сумму
                market_sell_total - ордер на продажу по рынку на определенную сумму
 */
async function order_create(pair, quantity = "", price = "", type) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/order_create";
        var params = {
            nonce: get_nonce(),
            pair: pair,
            quantity: quantity,
            price: price,
            type: type
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "order_create";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция отменяет ордер
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
        "result": true,
        "error": ""
     } 
   }
   либо 
   { success: false, error_msg: "" }
   @param order_id "ETH_USD"
 */
async function order_cancel(order_id) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/order_cancel";
        var params = {
            nonce: get_nonce(),
            order_id: order_id
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "order_cancel";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает список открытых ордеров пользователя
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
        "BTC_USD": [
        {
            "order_id": "14",
            "created": "1435517311",
            "type": "buy",
            "pair": "BTC_USD",
            "price": "100",
            "quantity": "1",
            "amount": "100"
        }
        ]
     } 
   }
   либо 
   { success: false, error_msg: "" }
 */
async function user_open_orders() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/user_open_orders";
        var params = {
            nonce: get_nonce()
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "user_open_orders";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}



/** Функция получает отмененные ордера пользователя
 * Возвращает 
 * { 
 *   success: true, 
 *   value: [
        {
            "date": 1435519742,
            "order_id": 15,
            "order_type": "sell",
            "pair": "BTC_USD",
            "price": 100,
            "quantity": 3,
            "amount": 300
        }
        ]
   }
   либо 
   { success: false, error_msg: "" }
   @param limit кол-во возвращаемых сделок 
 */
async function user_cancelled_orders(limit = 100) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/user_cancelled_orders";
        var params = {
            nonce: get_nonce(),
            limit: limit
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "user_cancelled_orders";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}



/** Функция получает сделки пользователя
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
         "BTC_USD": [
            {
                "trade_id": 3,
                "date": 1435488248,
                "type": "buy",
                "pair": "BTC_USD",
                "order_id": 7,
                "quantity": 1,
                "price": 100,
                "amount": 100
            }
        ]
     } 
   }
   либо 
   { success: false, error_msg: "" }
   @param pair одна или несколько валютных пар разделенных запятой (пример BTC_USD,BTC_EUR)
   @param limit кол-во возвращаемых сделок 
 */
async function user_trades(pair, limit = 100) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/user_trades";
        var params = {
            nonce: get_nonce(),
            pair: pair,
            offset: 0,
            limit: limit
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "user_trades";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает список адресов для депозита
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
            "BTC": "16UM5DoeHkV7Eb7tMfXSuQ2ueir1yj4P7d",
            "DOGE": "DEVfhgKErG5Nzas2FZJJH8Y8pjoLfVfWq4",
            "LTC": "LSJFhsVJM6GCFtSgRj5hHuK9gReLhNuKFb",
            "XRP": "rB2yjyFCoJaV8QCbj1UJzMnUnQJMrkhv3S,1234"
        } 
   }
   либо 
   { success: false, error_msg: "" }
 */
async function deposit_address() {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/deposit_address";
        var params = {
            nonce: get_nonce()
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "deposit_address";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает список адресов для депозита
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
            "result": true,
            "error": "",
            "task_id": "467756"
        } 
   }
   либо 
   { success: false, error_msg: "" }	
    @param amount - кол-во выводимой валюты
    @param currency - наименование выводимой валюты
    @param address - адрес вывода
 */
async function withdraw_crypt(amount, currency, address) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/withdraw_crypt";
        var params = {
            nonce: get_nonce(),
            amount: amount,
            currency: currency,
            address: address
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "withdraw_crypt";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}


/** Функция получает историю кошелька
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
        "result": true,
         "error": "",
        "begin": "1493942400",
        "end": "1494028800",
        "history": [{
            "dt": 1461841192,
            "type": "deposit",
            "curr": "RUB",
            "status": "processing",
            "provider": "Qiwi (LA) [12345]",
            "amount": "1",
            "account": "",
             },
            {
            "dt": 1463414785,
            "type": "deposit",
            "curr": "DASH",
            "status": "transferred",
            "provider": "DASH",
            "amount": "0.0601121",
            "account": "",
            },
            {
            "dt": 1463414785,
            "type": "withdrawal",
            "curr": "USD",
            "status": "paid",
            "provider": "EXCODE",
            "amount": "-1",
            "account": "EX-CODE_19371_USDda...",
            }
        ]
        }
   }
   либо 
   { success: false, error_msg: "" }	
    @param date - дата timestamp за которую нужно получить историю
 */
async function wallet_history(date) {
    return new Promise(async (resolve, reject) => {
        await delayFunction(true, true);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/wallet_history";
        var params = {
            nonce: get_nonce(),
            date: date
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "wallet_history";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}



/** Функция получает список адресов для депозита
 * Возвращает 
 * { 
 *   success: true, 
 *   value: {
            "result": true,
            "error": "",
            "task_id": "467756"
        } 
   }
   либо 
   { success: false, error_msg: "" }	
    @param amount - кол-во выводимой валюты
    @param currency - наименование выводимой валюты
    @param address - адрес вывода
 */
async function withdraw_crypt(amount, currency, address) {
    return await new Promise(async (resolve, reject) => {
        await delayFunction(true, false);
        var start_time = Date.now();
        var url = "https://api.exmo.com/v1/withdraw_crypt";
        var params = {
            nonce: get_nonce(),
            amount: amount,
            currency: currency,
            address: address
        };
        var sign = get_signature(params);
        var proxy = balancer_get_proxy();
        request.post({
            url: url,
            headers: {
                'Key': api_key,
                'Sign': sign
            },
            form: queryString.stringify(params),
            proxy: proxy
        },
            (error, response, body_) => {
                var func_name = "withdraw_crypt";
                try {
                    var body = JSON.parse(body_);
                    if (error || (response.statusCode !== 200) || (body && body.result == false)) {
                        resolve({ success: false, error_msg: body.error ? body.error : error.message });
                        return;
                    }
                    resolve({ success: true, value: body });
                }
                catch (e) {
                    print_req_error(func_name, proxy, start_time, e);
                    reject(e);
                }
            });
    })
}






//-------------- Конец Приватные данные ----------------------




(async function () {
    io.on('connection', async function (client) {
        //-------------- Публичные методы ----------------------

        client.on('get_info_pairs', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_info_pairs().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_pair_settings', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_pair_settings().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_currency_list', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_currency_list().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('get_order_books', async function (secret_key, pairs, limit, cb) {
            if (secret_key === config.api_modules_secret_key)
                await get_order_books(pairs, limit).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        //-------------- Конец Публичные методы ----------------------



        //-------------- Приватные методы ----------------------

        client.on('user_info', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await user_info().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_create', async function (secret_key, pair, quantity, price, type, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_create(pair, quantity, price, type).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('order_cancel', async function (secret_key, order_id, cb) {
            if (secret_key === config.api_modules_secret_key)
                await order_cancel(order_id).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('user_open_orders', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await user_open_orders().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('user_trades', async function (secret_key, pair, limit, cb) {
            if (secret_key === config.api_modules_secret_key)
                await user_trades(pair, limit).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('user_cancelled_orders', async function (secret_key, limit, cb) {
            if (secret_key === config.api_modules_secret_key)
                await user_cancelled_orders(limit).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('deposit_address', async function (secret_key, cb) {
            if (secret_key === config.api_modules_secret_key)
                await deposit_address().then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('withdraw_crypt', async function (secret_key, amount, currency, address, cb) {
            if (secret_key === config.api_modules_secret_key)
                await withdraw_crypt(amount, currency, address).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('wallet_history', async function (secret_key, date, cb) {
            if (secret_key === config.api_modules_secret_key)
                await wallet_history(date).then((val) => { cb(val, null); }).catch((error) => { cb(null, error); })
            else
                cb(null, new Error("Your not have access"));
        });

        client.on('wallet_history_by_days', async function (secret_key, count_days, cb) {
            if (secret_key === config.api_modules_secret_key) {
                try {
                    var arr_promises = [];
                    var arr = [];
                    var current_time = Math.floor(Date.now() / 1000);
                    for (var i = 0; i < count_days; i++) {
                        var val = await wallet_history(current_time);
                        if (val.success) {
                            arr = arr.concat(val.value.history);
                        }

                        current_time -= 86400;
                        //Отняли от текущего времени 24 часа
                    }
                    cb({ success: true, value: arr }, null);
                }
                catch (e) {
                    cb({ success: false, error_msg: e.message }, e);
                }
            }
            else
                cb(null, new Error("Your not have access"));

        });



        //-------------- Конец Приватные методы ----------------------

    });
    io.on('disconnect', async function (client) {
        var t = 9;
    });
    server.listen(config.exmo_api_module_port);
})()