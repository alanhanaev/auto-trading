const config = require("../config");
var socket = require('socket.io-client')(config.binance_api_module_address);
const WebSocket = require('ws');
var dateFormat = require('dateformat');
var ws=null;

/** Возвращает текущее время для вывода его в логах  */
function get_log_date() {
    return "" + dateFormat(new Date(), "dd.mm.yyyy HH:MM:ss");
}


// ------------ Публичные методы  -------------


/** Получает информацию о маркетах и лимитах */
module.exports.get_exchange_info = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('get_exchange_info', config.api_modules_secret_key, (res, error) => {
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


/** Получает ордера по заданным парам валют*/
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




/** Получает информацию по кошелькам
 * Возвращает
 * [{
	"id": "10",
	"assetCode": "BNB",
	"assetName": "Binance Coin",
	"unit": "",
	"transactionFee": 0.5,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 20000.0,
	"freeUserChargeAmount": 1.0E7,
	"minProductWithdraw": "1.000000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "30",
	"createTime": null,
	"test": 0,
	"url": "https://etherscan.io/tx/",
	"addressUrl": "https://etherscan.io/address/",
	"blockUrl": "https://etherscan.io/blocks/",
	"enableCharge": true,  //Доступен ли ввод
	"enableWithdraw": true,  //Доступен ли вывод
	"regEx": "^(0x)[0-9A-Fa-f]{40}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "ETH",
	"isLegalMoney": false,
	"reconciliationAmount": 20.0,
	"seqNum": "0",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000497111-%E5%B8%81%E5%AE%89%E5%B8%81-BNB-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000497111-Binance-Coin-BNB-",
	"logoUrl": "/file/resources/img/20170912/image_1505205843840.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": true,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "ETH",
	"feeRate": 0.006,
	"feeDigit": 2,
	"legalMoney": false
},
{
	"id": "1",
	"assetCode": "BTC",
	"assetName": "Bitcoin",
	"unit": "฿",
	"transactionFee": 5.0E-4,
	"commissionRate": 0.0,
	"freeAuditWithdrawAmt": 1.0,
	"freeUserChargeAmount": 500.0,
	"minProductWithdraw": "0.002000000000000000",
	"withdrawIntegerMultiple": "0E-18",
	"confirmTimes": "2",
	"createTime": null,
	"test": 0,
	"url": "https://btc.com/",
	"addressUrl": "https://btc.com/",
	"blockUrl": "",
	"enableCharge": true,
	"enableWithdraw": true,
	"regEx": "^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$",
	"regExTag": "",
	"gas": 1.0,
	"parentCode": "BTC",
	"isLegalMoney": false,
	"reconciliationAmount": 1.0,
	"seqNum": "1",
	"chineseName": "",
	"cnLink": "https://binance.zendesk.com/hc/zh-cn/articles/115000494172-%E6%AF%94%E7%89%B9%E5%B8%81-BTC-",
	"enLink": "https://binance.zendesk.com/hc/en-us/articles/115000494172-Bitcoin-BTC-",
	"logoUrl": "/file/resources/img/20170912/image_1505205865716.png",
	"forceStatus": false,
	"resetAddressStatus": false,
	"chargeDescCn": null,
	"chargeDescEn": null,
	"assetLabel": null,
	"sameAddress": false,
	"depositTipStatus": false,
	"dynamicFeeStatus": false,
	"depositTipEn": null,
	"depositTipCn": null,
	"assetLabelEn": null,
	"supportMarket": null,
	"feeReferenceAsset": "",
	"feeRate": null,
	"feeDigit": 8,
	"legalMoney": false
}]
 * 
 * 
 * 
 * 
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


// ------------ Конец Публичные методы  -------------




// ------------ Приватные методы  -------------

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
module.exports.order_buy_limit = async (symbol, quantity, price) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_buy_limit', config.api_modules_secret_key, symbol, quantity, price, (res, error) => {
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
module.exports.order_sell_limit = async (symbol, quantity, price) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_sell_limit', config.api_modules_secret_key, symbol, quantity, price, (res, error) => {
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
module.exports.order_buy_market = async (symbol, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_buy_market', config.api_modules_secret_key, symbol, quantity, (res, error) => {
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
module.exports.order_sell_market = async (symbol, quantity) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_sell_market', config.api_modules_secret_key, symbol, quantity, (res, error) => {
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

/** Функция отменяет лимитный ордер, возвращает ответ в виде 
 { symbol: 'BTCUSDT',
  origClientOrderId: 'eJgWVZkLnNG5yaRozmnVec',
  orderId: 40783385,
  clientOrderId: 'Pz19FjZRk0muUOAR2qRByP' }
  ----либо такой, если ошибка---
 { code: -1100,
  msg: 'Illegal characters found in parameter \'orderId\'; legal range is \'^[0-9]{1,20}$\'.' }
 * */
module.exports.order_cancel = async (symbol, order_id) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_cancel', config.api_modules_secret_key, symbol, order_id, (res, error) => {
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
 { symbol: 'BTCUSDT',
  orderId: 40841546,
  clientOrderId: 'Q8bP4dLQVsaho8jydFPmod',
  price: '11000.00000000',
  origQty: '0.00100000',
  executedQty: '0.00000000',
  status: 'NEW',  //'FILLED', 'NEW'
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
module.exports.order_info = async (symbol, order_id) => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('order_info', config.api_modules_secret_key, symbol, order_id, (res, error) => {
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
module.exports.currency_balances = async () => {
    return await new Promise(async (resolve, reject) => {
        socket.emit('currency_balances', config.api_modules_secret_key, (res, error) => {
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

/** Функция отправляет запрос на вывод средств, при отправке необходимо указывать всю сумму вместе с комиссией, комиссия вычтется из нее автоматический, возвращает ответ в виде 
  {
    "msg": "success",
    "success": true,
    "id":"7213fea8e94b4a5593d507237e5a555b"
  }
  ----либо такой, если ошибка---
 { code: -1100,  msg: '' }, { msg: 'Illegal ip address.', success: false }
 * */
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


// ------------ Конец Приватные методы  -------------



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
module.exports.disconnect_with_api_module = async (currency) => {
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




