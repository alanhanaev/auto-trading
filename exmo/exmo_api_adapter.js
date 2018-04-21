const config = require("../config");
var socket = require('socket.io-client')(config.exmo_api_module_address);


//-------------- Публичные методы ----------------------
//-------------- Публичные методы ----------------------

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
module.exports.get_info_pairs = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_info_pairs',config.api_modules_secret_key , (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.get_pair_settings = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_pair_settings',config.api_modules_secret_key, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
    })
}

/** Получает список валют биржи
 * Вовзращает результат 
 * { success: true, value: ["USD","EUR","RUB","BTC","DOGE","LTC"] }
 * либо 
 * { success: false, error_msg: "" }
 */
module.exports.get_currency_list = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_currency_list',config.api_modules_secret_key, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.get_order_books = async (pairs, limit) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_order_books',config.api_modules_secret_key, pairs, limit, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
    })
}


//-------------- Конец Публичные методы ----------------------
//-------------- Конец Публичные методы ----------------------





//-------------- Приватные методы ----------------------
//-------------- Приватные методы ----------------------

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
module.exports.user_info = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('user_info', config.api_modules_secret_key, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.order_create = async (pair, quantity, price, type) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_create', config.api_modules_secret_key, pair, quantity, price, type, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.order_cancel = async (order_id) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_cancel', config.api_modules_secret_key, order_id, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.user_open_orders = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('user_open_orders', config.api_modules_secret_key, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.user_trades = async (pair, limit) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('user_trades', config.api_modules_secret_key, pair, limit, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
    })
}

/** Функция получает отмененные сделки пользователя
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
module.exports.user_cancelled_orders = async (limit) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('user_cancelled_orders', config.api_modules_secret_key, limit, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.deposit_address = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('deposit_address', config.api_modules_secret_key, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.withdraw_crypt = async (amount, currency, address) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('withdraw_crypt', config.api_modules_secret_key, amount, currency, address, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.wallet_history = async (date) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('wallet_history', config.api_modules_secret_key, date, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
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
module.exports.wallet_history = async (date) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('wallet_history', config.api_modules_secret_key, date, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
    })
}


/** Функция получает историю кошелька
 * Возвращает 
 * { 
 *   success: true, 
 *   value: [{
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
            }]
   }
   либо 
   { success: false, error_msg: "" }	
    @param count_days - количество дней за которое мы получаем историю
 */
module.exports.wallet_history_by_days = async (count_days) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('wallet_history_by_days', config.api_modules_secret_key, count_days, (res, error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(res);
        });
        // socket.on('disconnect', (val) => {
        //     reject(new Error("Disconnect api module"));
        // })
    })
}


//-------------- Конец Приватные методы ----------------------
//-------------- Конец Приватные методы ----------------------