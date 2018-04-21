const config = require("../config");
var socket = require('socket.io-client')(config.livecoin_api_module_address);

//-------------- Публичные методы ---------------

/** Получает информацию по заданной паре валют, возвращает объект */
module.exports.get_course_info_pair = async (pair) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_course_info_pair', config.api_modules_secret_key, pair, (res, error) => {
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


/** Получает информацию по всем парам валют, возвращает массив */
module.exports.get_course_info_pairs = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_course_info_pairs', config.api_modules_secret_key, (res, error) => {
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


/** Получает информацию по всем парам валют, возвращает массив */
module.exports.get_all_order_books = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_all_order_books', config.api_modules_secret_key, (res, error) => {
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


/** Получает ордера по заданной паре валют, возвращает объект */
module.exports.get_order_book = async (pair, depth) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_order_book', config.api_modules_secret_key, pair, depth, (res, error) => {
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



/** Получает ордера по заданных пар валют, возвращает объект */
module.exports.get_order_books = async (pairs, depth) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_order_books', config.api_modules_secret_key, pairs, depth, (res, error) => {
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
module.exports.get_coin_info = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_coin_info', config.api_modules_secret_key, (res, error) => {
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


//-------------- Конец Публичные методы ---------------




//-------------- Приватные методы ---------------

/** Функция размещает лимитный ордер на покупку, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
module.exports.order_buy_limit = async (currency_pair, price, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_buy_limit', config.api_modules_secret_key, currency_pair, price, quantity, (res, error) => {
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


/** Функция размещает лимитный ордер на продажу, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
module.exports.order_sell_limit = async (currency_pair, price, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_sell_limit', config.api_modules_secret_key, currency_pair, price, quantity, (res, error) => {
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


/** Функция размещает рыночный ордер на покупку, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
module.exports.order_buy_market = async (currency_pair, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_buy_market', config.api_modules_secret_key, currency_pair, quantity, (res, error) => {
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


/** Функция размещает рыночный ордер на продажу, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"added": true,"orderId": 4912} } */
module.exports.order_sell_market = async (currency_pair, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_sell_market', config.api_modules_secret_key, currency_pair, quantity, (res, error) => {
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


/** Функция отменяет лимитный ордер, возвращает ответ в виде { status_code: "", status_message: "", value: {"success": true,"cancelled": true,"message": null,"quantity": 0.0005,"tradeQuantity": 0} } */
module.exports.order_cancel = async (currency_pair, order_id) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_cancel', config.api_modules_secret_key, currency_pair, order_id, (res, error) => {
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
module.exports.order_client_orders = async (currency_pair, open_closed, record_count) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_client_orders', config.api_modules_secret_key, currency_pair, open_closed, record_count, (res, error) => {
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
module.exports.order_info = async (order_id) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_info', config.api_modules_secret_key, order_id, (res, error) => {
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


/** Функция доступный баланс по одной валюте, возвращает ответ в виде
 * {
    "type": "available",
    "currency": "DMC",
    "value": 0
 }
 * @param {string} currency идентификатор валюты
 */
module.exports.currency_balance = async (currency) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('currency_balance', config.api_modules_secret_key, currency, (res, error) => {
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

module.exports.currency_balances = async (currencys) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('currency_balances', config.api_modules_secret_key, currencys, (res, error) => {
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


/** Функция получает адрес кошелька для депозита, возвращает ответ в виде
 * { fault: null,
  userId: 316489,
  userName: 'hanik',
  currency: 'ETH',
  wallet: '0xa7defc0023b9900a33bec3098bb2ff9a82ba903f' }
 }
 * @param {string} currency идентификатор валюты
 */
module.exports.currency_get_address = async (currency) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('currency_get_address', config.api_modules_secret_key, currency, (res, error) => {
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
module.exports.withdraw_request = async (amount, currency, wallet) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('withdraw_request', config.api_modules_secret_key, amount, currency, wallet, (res, error) => {
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

module.exports.get_deposit_transactions = async (start_time, end_time) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_deposit_transactions', config.api_modules_secret_key, start_time, end_time, (res, error) => {
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

/** Функция возвращает адрес кошелька для депозита
 * { 
  fault: null,
  userId: 316489,
  userName: 'hanik',
  currency: 'ETH',
  wallet: '0xa7defc0023b9900a33bec3098bb2ff9a82ba903f' 
  }
*/
module.exports.get_deposit_address = async (currency) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_deposit_address', config.api_modules_secret_key, currency, (res, error) => {
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



//-------------- Конец Приватные методы ---------------