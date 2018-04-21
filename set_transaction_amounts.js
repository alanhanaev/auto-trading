const config = require("./config");
const db = require('monk')(config.mongodb_connection_string);
const currencys_db = db.get('currencys');
const request = require("request");
var BigNumber = require("bignumber.js");

///********* Скрипт запускается один раз после добавления новых монет, для установки максимальной и минимальной суммы для осуществления операции *****/////

/** Функция обрезает число до 15 чисел, для использования в библиотеке BigNumber */
function trim_digits(number_) {
    var count = 15;
    var s = number_.toString();
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



/** Функция получает массив с информацией по криптовалютам с сайта coinmarketcap
 * Возвращает ответ в виде
 * [
    {
        "id": "bitcoin", 
        "name": "Bitcoin", 
        "symbol": "BTC", 
        "rank": "1", 
        "price_usd": "9324.89", 
        "price_btc": "1.0", 
        "24h_volume_usd": "5789690000.0", 
        "market_cap_usd": "157709766470", 
        "available_supply": "16912775.0", 
        "total_supply": "16912775.0", 
        "max_supply": "21000000.0", 
        "percent_change_1h": "-0.04", 
        "percent_change_24h": "-1.11", 
        "percent_change_7d": "-17.06", 
        "last_updated": "1520778266"
    }, 
    {
        "id": "ethereum", 
        "name": "Ethereum", 
        "symbol": "ETH", 
        "rank": "2", 
        "price_usd": "716.34", 
        "price_btc": "0.0775714", 
        "24h_volume_usd": "1560520000.0", 
        "market_cap_usd": "70288484922.0", 
        "available_supply": "98121681.0", 
        "total_supply": "98121681.0", 
        "max_supply": null, 
        "percent_change_1h": "-0.62", 
        "percent_change_24h": "-2.47", 
        "percent_change_7d": "-16.25", 
        "last_updated": "1520778251"
    }
  ]
 * 
 * 
 */
async function get_currencys_by_coinmarketcap() {
    return new Promise((resolve, reject) => {
        var url = "https://api.coinmarketcap.com/v1/ticker/?limit=0";
        request.get({ url: url }, (error, response, body) => {
            if (error) {
                return resolve([]);
            }
            try {
                resolve(JSON.parse(body));
            }
            catch (e) {
                resolve([]);
            }
        });
    })
}


/** Функция ищет в массиве монета с таким символом и возвращает ее 
 * @param array [
    {
        "id": "bitcoin", 
        "name": "Bitcoin", 
        "symbol": "BTC", 
        "rank": "1", 
        "price_usd": "9324.89", 
        "price_btc": "1.0", 
        "24h_volume_usd": "5789690000.0", 
        "market_cap_usd": "157709766470", 
        "available_supply": "16912775.0", 
        "total_supply": "16912775.0", 
        "max_supply": "21000000.0", 
        "percent_change_1h": "-0.04", 
        "percent_change_24h": "-1.11", 
        "percent_change_7d": "-17.06", 
        "last_updated": "1520778266"
    }, 
    {
        "id": "ethereum", 
        "name": "Ethereum", 
        "symbol": "ETH", 
        "rank": "2", 
        "price_usd": "716.34", 
        "price_btc": "0.0775714", 
        "24h_volume_usd": "1560520000.0", 
        "market_cap_usd": "70288484922.0", 
        "available_supply": "98121681.0", 
        "total_supply": "98121681.0", 
        "max_supply": null, 
        "percent_change_1h": "-0.62", 
        "percent_change_24h": "-2.47", 
        "percent_change_7d": "-16.25", 
        "last_updated": "1520778251"
    }
  ]
  @param symbol "ETH"
*/
function get_currency_by_asset(array, symbol) {
    for (var i = 0; i < array.length; i++) {
        if (array[i].symbol === symbol) {
            return array[i];
        }
    }
    return null;
}

(async function () {
    var return_db_currencys = await currencys_db.find({});
    var return_site_currencys = await get_currencys_by_coinmarketcap();
    for (var i = 0; i < return_db_currencys.length; i++) {
        var exchange = return_db_currencys[i].exchange;
        var sended_currencys=[];  //монеты которые мы впоследствии запишем в базу данных
        for (var k = 0; k < return_db_currencys[i].currencys.length; k++) {
            var currency = return_db_currencys[i].currencys[k];
            var coinmarket_currency = get_currency_by_asset(return_site_currencys, currency.currency_common);
            if (coinmarket_currency === null) {
                console.log("Монета " + currency.currency_common + " " + exchange + " не найденна в списке coinmarketcap");
                sended_currencys.push(currency);
                continue;
            }
            if (coinmarket_currency.price_usd === null) {
                console.log("Монета " + currency.currency_common + " " + exchange + " не найденн price в списке coinmarketcap");
                sended_currencys.push(currency);
                continue;
            }
            var transaction_amount = trim(100 / parseFloat(coinmarket_currency.price_usd));
            var min_transaction_amount = trim(20 / parseFloat(coinmarket_currency.price_usd));
            currency.transaction_amount=transaction_amount;
            currency.min_transaction_amount=min_transaction_amount;
            sended_currencys.push(currency);
        }
        var val =await currencys_db.update({exchange: exchange}, { $set: {currencys:sended_currencys}});
        console.log(val);
    }
})()