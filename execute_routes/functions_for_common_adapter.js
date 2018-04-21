var BigNumber = require("bignumber.js");

/** Функция обрезает число до 15 чисел, для использования в библиотеке BigNumber */
function trim_digits(number_) {
  var count = 15;
  var s = number_.toString();
  if (s.indexOf(".") > -1)
    return parseFloat(s.length > count + 1 ? s.substr(0, count + 1) : s);
  else
    return parseFloat(s.length > count ? s.substr(0, count) : s);
}

/** Обрезает число до 14 знаков после запятой */
function trim(number) {
  return trim_digits(number);
}



module.exports.stop_running=async function (time) {
  return await new Promise((resolve, reject) => {
      setTimeout(() => { resolve() }, time)
  });
}

module.exports.exmo_get_quantity_without_comission = function (quantity, comission) {
  return (new BigNumber(trim(quantity))).minus(new BigNumber(trim(quantity)).multipliedBy(trim(comission))).toNumber();
}

module.exports.binance_get_quantity_without_comission = function (quantity, comission) {
  return (new BigNumber(trim(quantity))).minus(new BigNumber(trim(quantity)).multipliedBy(trim(comission))).toNumber();
}


module.exports.binance_find_currency_balance = function (json, currency) {
  balances = json.balances;
  var balance = 0;
  for (var i = 0; i < balances.length; i++) {
    if (balances[i].asset === currency) {
      balance = balances[i].free;
      break;
    }
  }
  return parseFloat(balance);
}


/** Функция принимает на вход
 *  [
        {
            "insertTime": 1508198532000,
            "amount": 0.04670582,
            "asset": "ETH",
            "address": "0x6915f16f8791d0a1cc2bf47c13a6b2a92000504b",
            "txId": "0xdf33b22bdb2b28b1f75ccd201a4a4m6e7g83jy5fc5d5a9d1340961598cfcb0a1",
            "status": 1 // 0(0:pending,1:success)
        }
    ]
 *  Функция возвращает 
 * [
 *      {
 *      date: 111478785, //Дата прихода депозита
 *      currency: "ETH",  
 *      amount: 0.125  
 *      }
 * ]
 * 
 */
module.exports.binance_convert_deposits_to_common_type = function (deposits_binance) {
  deposits = [];
  for (var i = 0; i < deposits_binance.length; i++) {
    if (deposits_binance[i].status == 1) {
      var obj = {};
      obj.date = deposits_binance[i].insertTime;
      obj.currency = deposits_binance[i].asset;
      obj.amount = deposits_binance[i].amount;
      deposits.push(obj);
    }
  }
  return deposits;
}



/** Функция принимает на вход
 * [
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
 *  Функция возвращает 
 * [
 *      {
 *      date: 111478785, //Дата прихода депозита
 *      currency: "ETH",  
 *      amount: 0.125  
 *      }
 * ]
 *
 */
module.exports.livecoin_convert_deposits_to_common_type = function (deposits_livecoin) {
  deposits = [];
  for (var i = 0; i < deposits_livecoin.length; i++) {
    var obj = {};
    obj.date = deposits_livecoin[i].date;
    obj.currency = deposits_livecoin[i].fixedCurrency;
    obj.amount = deposits_livecoin[i].amount;
    deposits.push(obj);
  }
  return deposits;
}

/** Функция конвертирует список балансов к общему типу
 * Возвращает [
 *   {
 *     local_currency: "USD",
 *     amount: 300
 *   },
 *   {
 *     local_currency: "ETH",
 *     amount: 1.5
 *   } 
 *  ]
 * 
 * @param balances [
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
 */
module.exports.livecoin_convert_balances_to_common_type = function (balances) {
  var arr = [];
  for (var i = 0; i < balances.length; i++) {
    if (balances[i].type === "available") {
      arr.push({ local_currency: balances[i].currency, amount: balances[i].value });
    }
  }
  return arr;
}



/** Функция конвертирует список балансов к общему типу
 * Возвращает [
 *   {
 *     local_currency: "USD",
 *     amount: 300
 *   },
 *   {
 *     local_currency: "ETH",
 *     amount: 1.5
 *   } 
 *  ]
 * 
 * @param balances [
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
 */
module.exports.binance_convert_balances_to_common_type = function (balances) {
  var arr = [];
  for (var i = 0; i < balances.length; i++) {
    arr.push({ local_currency: balances[i].asset, amount: balances[i].free });
  }
  return arr;
}



/** Функция ищет ордер с списке открытых ордеров 
 *      Возвращает  {
            "order_id": "14",
            "created": "1435517311",
            "type": "buy",
            "pair": "BTC_USD",
            "price": "100",
            "quantity": "1",
            "amount": "100"
        }
    либо null
 * @param open_orders {
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
        ],
        "ETH_USD": [
        {
            "order_id": "14",
            "created": "1435517311",
            "type": "buy",
            "pair": "BTC_USD",
            "price": "100",
            "quantity": "1",
            "amount": "100"
        }
        ],
     } 
*/
module.exports.exmo_find_order_in_open_orders = (open_orders, pair, order_id) => {
  var res = null;
  var orders_arr = open_orders[pair];
  if (orders_arr)
    for (var i = 0; i < orders_arr.length; i++) {
      if (orders_arr[i].order_id == order_id) {
        res = orders_arr[i];
        break;
      }
    }
  return res;
}




/** Функция ищет ордер с списке отмененных ордеров 
 *    Возвращает  
      {
            "date": 1435519742,
            "order_id": 15,
            "order_type": "sell",
            "pair": "BTC_USD",
            "price": 100,
            "quantity": 3,
            "amount": 300
        }
    либо null
 * @param cancelled_orders [
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

*/
module.exports.exmo_find_order_in_cancelled_orders = (cancelled_orders, pair, order_id) => {
  var res = null;
  if (cancelled_orders && cancelled_orders.length > 0)
    for (var i = 0; i < cancelled_orders.length; i++) {
      if (cancelled_orders[i].order_id == order_id) {
        res = cancelled_orders[i];
        break;
      }
    }
  return res;
}








/** Функция ищет ордер с списке сделок пользователя 
 *  Возвращает  
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
    либо null
 * @param user_trades {
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
*/
module.exports.exmo_find_order_in_user_trades = (user_trades, pair, order_id) => {
  var res = null;
  var orders_arr = user_trades[pair];
  if (orders_arr)
    for (var i = 0; i < orders_arr.length; i++) {
      if (orders_arr[i].order_id == order_id) {
        res = orders_arr[i];
        break;
      }
    }
  return res;
}



/** Функция конвертирует список балансов к общему типу
 * Возвращает [
 *   {
 *     local_currency: "USD",
 *     amount: 300
 *   },
 *   {
 *     local_currency: "ETH",
 *     amount: 1.5
 *   } 
 *  ]
 * 
 * @param balances {
             "BTC": "970.994",
             "USD": "949.47"
        }
 */
module.exports.exmo_convert_balances_to_common_type = function (balances) {
  var arr = [];
  for (var key in balances) {
    arr.push({ local_currency: key, amount: parseFloat(balances[key]) });
  }
  return arr;
}


/** Функция конвертирует список депозитов к общему типу
 * Возвращает результат 
 *   values: [
 *      {
 *      date: 111478785, //Дата прихода депозита
 *      currency: "ETH",  
 *      amount: 0.125  
 *      }
 *   ]
 * либо
 * []
 * 
 * @param deposits [{
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
 */
module.exports.exmo_convert_deposits_to_common_type = function (deposits) {
  var arr = [];
  for (var i = 0; i < deposits.length; i++) {
    var obj = {};
    obj.date = deposits[i].dt;
    obj.currency = deposits[i].curr;
    obj.amount = parseFloat(deposits[i].amount);
    arr.push(obj);
  }
  return arr;
}
