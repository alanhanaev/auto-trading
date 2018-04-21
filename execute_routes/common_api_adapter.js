var livecoin_api = require('./../livecoin/livecoin_api_adapter');
var binance_api = require('./../binance/binance_api_adapter');
var exmo_api = require('./../exmo/exmo_api_adapter');
var functions = require('./functions_for_common_adapter');
var BigNumber = require("bignumber.js");

/** Открывает лимитный ордер на покупку  
 * Возвращает результат 
 * {
 *   success: true,   //статус размещения ордера если
 *   order_id: "ryh56gh744q"
 * }
 * 
 * {
 *   success: false,   //статус размещения ордера если
 *   error_msg: "22344"
 * }
 * 
*/
module.exports.order_buy_limit = async (exchange, pair, quantity, price) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                var val = await livecoin_api.order_buy_limit(pair, price, quantity)
                if (val.value && val.value.success && val.value.added)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });

                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.order_buy_limit(pair, quantity, price);
                if (val.value && val.value.orderId)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.order_create(pair, quantity, price, "buy")
                if (val.success && val.value.order_id)
                    resolve({ success: true, order_id: val.value.order_id });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}


/** Открывает лимитный ордер на продажу  
 * Возвращает результат 
 * {
 *   success: true,   //статус размещения ордера если
 *   order_id: "ryh56gh744q"
 * }
 * 
 * {
 *   success: false,   //статус размещения ордера если
 *   error_msg: "22344"
 * }
 * 
*/
module.exports.order_sell_limit = async (exchange, pair, quantity, price) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                var val = await livecoin_api.order_sell_limit(pair, price, quantity);
                if (val.value && val.value.success && val.value.added)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.order_sell_limit(pair, quantity, price)
                if (val.value && val.value.orderId)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.order_create(pair, quantity, price, "sell")
                if (val.success && val.value.order_id)
                    resolve({ success: true, order_id: val.value.order_id });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}


/** Открывает рыночный ордер на покупку  
 * Возвращает результат 
 * {
 *   success: true,   //статус размещения ордера если
 *   order_id: "ryh56gh744q"
 * }
 * 
 * {
 *   success: false,   //статус размещения ордера если
 *   error_msg: "22344"
 * }
 * 
*/
module.exports.order_buy_market = async (exchange, pair, quantity) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                var val = await livecoin_api.order_buy_market(pair, quantity)
                if (val.value && val.value.success)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.order_buy_market(pair, quantity)
                if (val.value && val.value.orderId)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.order_create(pair, quantity, 0, "market_buy")
                if (val.success && val.value.order_id)
                    resolve({ success: true, order_id: val.value.order_id });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}


/** Открывает рыночный ордер на продажу  
 * Возвращает результат 
 * {
 *   success: true,   //статус размещения ордера если
 *   order_id: "ryh56gh744q"
 * }
 * 
 * {
 *   success: false,   //статус размещения ордера если
 *   error_msg: "22344"
 * }
 * 
*/
module.exports.order_sell_market = async (exchange, pair, quantity) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                var val = await livecoin_api.order_sell_market(pair, quantity)
                if (val.value && val.value.success)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.order_sell_market(pair, quantity)
                if (val.value && val.value.orderId)
                    resolve({ success: true, order_id: val.value.orderId });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.order_create(pair, quantity, 0, "market_sell")
                if (val.success && val.value.order_id)
                    resolve({ success: true, order_id: val.value.order_id });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}


/** Отменяет ордер
 * Возвращает результат 
 * {
 *   success: true   //статус отмены ордера
 * }
 * 
 * {
 *   success: false,   //статус отмены ордера
 *   error_msg: "22344"
 * }
 * 
*/
module.exports.order_cancel = async (exchange, pair, order_id) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                var val = await livecoin_api.order_cancel(pair, order_id)
                if (val.value && val.value.success && val.value.cancelled)
                    resolve({ success: true });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.order_cancel(pair, order_id)
                if (val.value && val.value.orderId)
                    resolve({ success: true });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.order_cancel(order_id)
                if (val.success && val.value.result)
                    resolve({ success: true });
                else
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                find_exch = true;
            }
            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}


/** Получает информацию об ордере
 * Возвращает результат 
 * {
 *   success: true   //статус отмены ордера,
 *   status: "OPEN"  //Варианты параметра "OPEN", "CANCELLED", "EXECUTED", "PARTIALLY_FILLED", "PARTIALLY_FILLED_AND_CANCELLED"
 *   total_quantity: 1,        // Количество
 *   executed_quantity: 0.8,    // Выполненное количество
 *   price: 934               //Прайс
 * }
 * 
 * {
 *   success: false   //статус отмены ордера,
 *   error_msg: "" 
 * }
 * 
 * @param exchange_comission парметр необходим т.к. некоторые биржи при отображении количества не учитывают комиссию, и необходимо ее вычитать самому из информации по ордеру. К примеру биржа exmo
*/
module.exports.order_info = async (exchange, pair, order_id, exchange_comission = 0) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;
            if (exchange === "livecoin") {
                //На livecoin комиссия уже бывает включенна в quantity
                var val = await livecoin_api.order_info(order_id);
                if (val.value && val.value.id && val.value.status) {
                    if (val.value.status === "PARTIALLY_FILLED") {
                        resolve({ success: true, status: "PARTIALLY_FILLED", total_quantity: val.value.quantity, executed_quantity: val.value.quantity - val.value.remainingQuantity, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "PARTIALLY_FILLED_AND_CANCELLED") {
                        resolve({ success: true, status: "PARTIALLY_FILLED_AND_CANCELLED", total_quantity: val.value.quantity, executed_quantity: val.value.quantity - val.value.remaining_quantity, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "OPEN") {
                        resolve({ success: true, status: "OPEN", total_quantity: val.value.quantity, executed_quantity: val.value.quantity - val.value.remaining_quantity, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "EXECUTED") {
                        resolve({ success: true, status: "EXECUTED", total_quantity: val.value.quantity, executed_quantity: val.value.quantity - val.value.remaining_quantity, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "CANCELLED") {
                        resolve({ success: true, status: "CANCELLED", total_quantity: val.value.quantity, executed_quantity: val.value.quantity - val.value.remaining_quantity, price: val.value.price });
                        return;
                    }
                    //"PARTIALLY_FILLED", "PARTIALLY_FILLED_AND_CANCELLED", "OPEN", "EXECUTED", "CANCELLED" 
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }

                find_exch = true;
            }
            if (exchange === "binance") {
                //На binance комиссия не бывает включенна в quantity
                var val = await binance_api.order_info(pair, order_id)
                if (val.value && val.value.orderId) {
                    //'NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'
                    if (val.value.status === "NEW") {
                        resolve({ success: true, status: "OPEN", total_quantity: val.value.origQty, executed_quantity: val.value.executedQty, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "FILLED") {
                        resolve({ success: true, status: "EXECUTED", total_quantity: functions.binance_get_quantity_without_comission(val.value.origQty,  exchange_comission), executed_quantity: functions.binance_get_quantity_without_comission(val.value.executedQty,  exchange_comission), price: val.value.price });
                        return;
                    }
                    if (val.value.status === "PARTIALLY_FILLED") {
                        resolve({ success: true, status: "PARTIALLY_FILLED", total_quantity: val.value.origQty, executed_quantity: val.value.executedQty, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "CANCELED" || val.value.status === "REJECTED" || val.value.status === "EXPIRED") {
                        resolve({ success: true, status: "CANCELLED", total_quantity: val.value.origQty, executed_quantity: val.value.executedQty, price: val.value.price });
                        return;
                    }
                    if (val.value.status === "CANCELED" && val.value.executedQty > 0) {
                        resolve({ success: true, status: "PARTIALLY_FILLED_AND_CANCELLED", total_quantity: val.value.origQty, executed_quantity: val.value.executedQty, price: val.value.price });
                        return;
                    }
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }


            if (exchange === "exmo") {
                //На exmo комиссия не бывает включенна в quantity
                var open_orders = await exmo_api.user_open_orders();
                var finded_open_orders = functions.exmo_find_order_in_open_orders(open_orders.value ? open_orders.value : [], pair, order_id)
                if (finded_open_orders) {
                    //Если ордер найденн в открытых ордерах
                    resolve({ success: true, status: "OPEN", total_quantity: finded_open_orders.quantity, executed_quantity: 0, price: finded_open_orders.price });
                    return;
                }
                else {
                    var cancelled_orders = await exmo_api.user_cancelled_orders(100);
                    var finded_cancelled_orders = functions.exmo_find_order_in_cancelled_orders(cancelled_orders.value ? cancelled_orders.value : [], pair, order_id)
                    if (finded_cancelled_orders) {
                        //Если ордер найденн в отмененных ордерах
                        resolve({ success: true, status: "CANCELLED", total_quantity: finded_cancelled_orders.quantity, executed_quantity: 0, price: finded_cancelled_orders.price });
                        return;
                    }
                    else {
                        await functions.stop_running(2000);
                        var user_trades = await exmo_api.user_trades(pair, 100);
                        var finded_user_trades = functions.exmo_find_order_in_user_trades(user_trades.value ? user_trades.value : [], pair, order_id)
                        if (finded_user_trades) {
                            //Если ордер найденн в сделках пользователя
                            resolve({ success: true, status: "EXECUTED", total_quantity: functions.exmo_get_quantity_without_comission(finded_user_trades.quantity, exchange_comission), executed_quantity: functions.exmo_get_quantity_without_comission(finded_user_trades.quantity, exchange_comission), price: finded_user_trades.price });
                        }
                        else {
                            //Если ордер нигде не найденн
                            resolve({ success: false, error_msg: "Ордер не найденн в списках" });
                        }
                    }
                }

                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }

    })
}



/** Получает информацию о балансе
 * Возвращает результат 
 * {
 *   success: true,
 *   available_balance: 20  
 * }
 * 
 * {
 *   success: false,
 *   error_msg: "" 
 * }
*/
module.exports.currency_balance = async (exchange, currency) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;

            if (exchange === "livecoin") {
                var val = await livecoin_api.currency_balance(currency);
                if (val.value && val.value.type === "available" && val.value.value >= 0) {
                    resolve({ success: true, available_balance: val.value.value });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.currency_balances();
                if (val.value && val.value.balances) {
                    var balance = functions.binance_find_currency_balance(val.value, currency);
                    resolve({ success: true, available_balance: balance });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.user_info();
                if (val && val.success) {
                    var balance = val.value.balances[currency] ? parseFloat(val.value.balances[currency]) : 0;
                    resolve({ success: true, available_balance: balance });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }

    })
}




/** Отправляет запрос на получение списка доступных балансов
 * Возвращает результат 
 * {
 *   success: true ,
 *   balances: [
 *   {
 *     local_currency: "USD",
 *     amount: 300
 *   },
 *   {
 *     local_currency: "ETH",
 *     amount: 1.5
 *   } 
 *  ]
 * }
 * либо
 * {
 *   success: false,
 *   error_msg: "" 
 * }
 * 
 * 
*/
module.exports.get_available_currency_balances = async (exchange) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;

            if (exchange === "livecoin") {
                var val = await livecoin_api.currency_balances();
                if (val && val.status_message === "OK" && val.value.length > 0) {
                    var balances = functions.livecoin_convert_balances_to_common_type(val.value);
                    resolve({ success: true, balances: balances });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.currency_balances();
                if (val && val.status_message === "OK" && val.value && val.value.balances.length > 0) {
                    var balances = functions.binance_convert_balances_to_common_type(val.value.balances);
                    resolve({ success: true, balances: balances });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.user_info();
                if (val && val.success) {
                    var balances = functions.exmo_convert_balances_to_common_type(val.value.balances);
                    resolve({ success: true, balances: balances });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }


            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}








/** Отправляет запрос на вывод средств, в параметре amount необходимо указывать всю сумму включая комиссию
 * Возвращает результат 
 * {
 *   success: true ,
 *   withdraw_id: ""
 * }
 * 
 * {
 *   success: false,
 *   error_msg: "" 
 * }
 * 
 * @param amount Вся сумма, включая комиссию
*/
module.exports.withdraw_request = async (exchange, amount, comission, currency, wallet) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;

            if (exchange === "livecoin") {
                var val = await livecoin_api.withdraw_request((new BigNumber(amount)).minus(comission).toNumber(), currency, wallet);
                if (val.value && val.value.id && val.value.fault === null) {
                    resolve({ success: true, withdraw_id: val.value.id });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.withdraw_request(amount, currency, wallet);
                if (val.value && val.value && val.value.msg === "Success" && val.value.success === true) {
                    resolve({ success: true, withdraw_id: val.value.id });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (exchange === "exmo") {
                var val = await exmo_api.withdraw_crypt(amount, currency, wallet);
                if (val.success && val.value && val.value.result) {
                    resolve({ success: true, withdraw_id: val.value.task_id });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }

    })
}



/** Получить список последних депозитов за определеннный промежуток времени
 * Возвращает результат 
 * {
 *   success: true,
 *   values: [
 *      {
 *      date: 111478785, //Дата прихода депозита seconds
 *      currency: "ETH",  
 *      amount: 0.125  
 *      }
 *   ]
 * }
 * 
 * {
 *   success: false,
 *   error_msg: "" 
 * }
 * 
 * 
*/
module.exports.get_deposits = async (exchange, start_time, end_time) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;

            if (exchange === "livecoin") {
                var val = await livecoin_api.get_deposit_transactions(start_time, end_time)
                if (val.value) {
                    var deposits = functions.livecoin_convert_deposits_to_common_type(val.value);
                    resolve({ success: true, values: deposits });

                    resolve({ success: true, withdraw_id: val.value.id });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.get_deposit_transactions(start_time, end_time)
                if (val.value && val.value.depositList) {
                    var deposits = functions.binance_convert_deposits_to_common_type(val.value.depositList);
                    resolve({ success: true, values: deposits });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (exchange === "exmo") {
                var val = await exmo_api.wallet_history_by_days(20)
                if (val.success) {
                    var deposits = functions.exmo_convert_deposits_to_common_type(val.value);
                    resolve({ success: true, values: deposits });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }

    })
}


/** Получить список последних депозитов за определеннный промежуток времени
 * Возвращает результат 
 * {
 *   success: true,
 *   value: "fffd44fdffddf"
 * }
 * 
 * {
 *   success: false,
 *   error_msg: "" 
 * }
 * 
 * 
*/
module.exports.get_deposit_address = async (exchange, currency) => {
    return await new Promise(async (resolve, reject) => {
        try {
            //Флаг, указывающий наден ли такой exchange
            var find_exch = false;

            if (exchange === "livecoin") {
                var val = await livecoin_api.get_deposit_address(currency)
                if (val.value && val.value.fault === null && val.value.currency) {
                    resolve({ success: true, value: val.value.wallet });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "binance") {
                var val = await binance_api.get_deposit_address(currency);
                if (val.value && val.value.success) {
                    resolve({ success: true, value: val.value.address });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }
            if (exchange === "exmo") {
                var val = await exmo_api.deposit_address();
                if (val.value && val.success && val.value[currency]) {
                    resolve({ success: true, value: val.value[currency] });
                }
                else {
                    resolve({ success: false, error_msg: JSON.stringify(val) });
                }
                find_exch = true;
            }

            if (!find_exch) {
                resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
            }
        }
        catch (e) {
            resolve({ success: false, error_msg: e.message });
        }
    })
}







/** Получить информацию по валютам для маркета, т. е. их доступность ввода и вывода
 * Возвращает результат 
 * {
 *   success: true,
 *   value: [
 * {
 *   currency: "ETH",
 *   enbableDeposit: true,
 *   enbableWithdrawal: true,
 *   comissionWithdraw: 0.002
 * },
 * {
 *   currency: "DASH",
 *   enbableDeposit: true,
 *   enbableWithdrawal: true,
 *   comissionWithdraw: 0.002
 * },
 *   ]
 * }
 * 
 * {
 *   success: false,
 *   error_msg: "" 
 * }
 * 
 * 
*/
// module.exports.get_coin_info = async (exchange) => {
//     return await new Promise(async (resolve, reject) => {
//         //Флаг, указывающий наден ли такой exchange
//         var find_exch = false;

//         if (exchange === "livecoin") {
//             livecoin_api.get_coin_info()
//                 .then((val) => {
//                     if (val.value && val.value.fault === null && val.value.currency) {
//                         resolve({ success: true, value: val.value.wallet });
//                     }
//                     else {
//                         resolve({ success: false, error_msg: JSON.stringify(val) });
//                     }
//                 })
//                 .catch((error) => {
//                     resolve({ success: false, error_msg: error.message });
//                 })
//             find_exch = true;
//         }
//         if (exchange === "binance") {
//             binance_api.get_coin_info()
//                 .then((val) => {
//                     if (val)
//                         resolve({ success: true, value: val });
//                 })
//                 .catch((error) => {
//                     resolve({ success: false, error_msg: error.message });
//                 })
//             find_exch = true;
//         }

//         if (!find_exch) {
//             resolve({ success: false, error_msg: "Не найденна биржа с таким именем" });
//         }
//     })
// }