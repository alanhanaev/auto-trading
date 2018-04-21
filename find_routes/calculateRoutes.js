var deepcopy = require("deepcopy");
var dateFormat = require('dateformat');
var BigNumber = require("bignumber.js");
var calcRoutes = [];
var exclude_currencys = []; //данные в виде [{exchange: "livecoin", currency_local:"NEO"}]
var unused_markets = []; // [{exchange: "livecoin", market: "ETH/USD"}, {exchange: "binance", market:"BTCUSDT"}]

/** Функция проверяет есть ли валюта в списке(exclude_currencys) исключаемых, если исключать то true, если не исключать то false */
function exclude_currency(exchange, currency_local) {
    for (var i = 0; i < exclude_currencys.length; i++) {
        if (exclude_currencys[i].exchange === exchange && exclude_currencys[i].currency_local === currency_local) {
            return true;
        }
    }
    return false;
}

/** Функция проверяет есть ли маркет в списке неиспользуемых 
 * если есть то возвращает true
*/
function unused_market(exchange, market) {
    for (var i = 0; i < unused_markets.length; i++)
        if (unused_markets[i].exchange === exchange && unused_markets[i].market === market)
            return true;
    return false;
}

function get_log_date() {
    return '' + dateFormat(new Date(), "dd.mm.yyyy h.MM.ss");
}

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
module.exports.trim_float = trim_float;

/** Обрезает число до 14 знаков после запятой */
function trim(number) {
    return trim_digits(number);
}
module.exports.trim = trim;



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
    return trim(quantity.toNumber());
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
        if ((new BigNumber(trim(item.count))).isGreaterThanOrEqualTo(quantity)) {
            sum = sum.plus(quantity.multipliedBy(trim(item.course)));
            break;
        }

        //Если текущая стоимость ордера не закрывает наш оставшийся баланс
        if ((new BigNumber(trim(item.count))).isLessThan(quantity)) {
            quantity = quantity.minus(new BigNumber(trim(item.count)));
            sum = sum.plus(new BigNumber(trim(item.cost)));
        }
    }
    return trim(sum.toNumber());
}
exports.find_sum = find_sum;


/** Функция находит по рыночному ордеру какое количество монет мы можем купить за определенную сумму
 * 12,3
 * либо
 * 0
*/
function find_quantity_by_upper_price(orders, start_balance) {
    //баланс который будет меняться проходя по итерациям
    var balance = new BigNumber(trim(start_balance));
    //Количество покупаемых монет которое будет меняться проходя по итерациям
    var quantity = new BigNumber(0);

    if (orders.length > 0) {
        var item = orders[0];
        quantity = quantity.plus(balance.dividedBy(trim(item.course)));
    }


    return trim(quantity.toNumber());
}
module.exports.find_quantity = find_quantity;




/** Функция находит по рыночному ордеру сколько мы получим продав определенное количество монет
 * 12,3
 * либо
 * 0
*/
function find_sum_by_upper_price(orders, start_quantity) {
    //баланс который будет меняться проходя по итерациям
    var quantity = new BigNumber(trim(start_quantity));
    //Количество покупаемых монет которое будет меняться проходя по итерациям
    var sum = new BigNumber(0);
    //Текущий элемент списка ордеров
    if (orders.length > 0) {
        var item = orders[0];
        sum = sum.plus(quantity.multipliedBy(trim(item.course)));
    }
    return trim(sum.toNumber());
}


/** Функция расчитывает по рыночным ордерам, количество если мы покупаем, либо сумму если мы продаем которую мы получим после выполнения рыночного ордера. Комиссия не учитывается
 * Возращает
 * {
 *   success: true,
 *   end_balance: 150
 * }
 * либо
 * {
 *   success: false,
 *   error_msg:""
 * }
 * @param edge {
            percent_comission: 0.001,
            fixed_comission: 0,
            orders: [],
            buy: false, //купить
            sell: false,  //продать
            start_vertex_currency_local: "USD",
            end_vertex_currency_local: "DASH",
            start_vertex_currency_common: "USD",
            end_vertex_currency_common: "DASH",
            start_exchange: "binance",
            end_exchange: "binance",
            market_name: "BTCUSDT",
            precisions: {price_precision: 5, quantity_precision: 8 }
        }
 */

function calc_end_balance_by_market(start_balance, edge) {
    var end_balance = 0;
    if (edge.buy) { //если мы покупаем
        end_balance = find_quantity(edge.orders, start_balance);
    }
    else {  //если мы продаем
        end_balance = find_sum(edge.orders, start_balance);
    }
    if (end_balance !== 0) {
        return {
            success: true,
            end_balance: end_balance
        }
    }
    else {
        return {
            success: false,
            error_msg: "Ошибка расчета конечного баланса по рыночному ордеру"
        }
    }
}


//Функция возвращает нам один роут в формате {success: true, value: 2345}, {success: false, error: "it is prohibited to use as a bridge"}
function calc_one_edge_by_market(startBalance_, edge) {
    var balance = new BigNumber(trim(startBalance_));
    var error = "";
    if (edge.exchange) { //для операции одной биржи
        var result = calc_end_balance_by_market(startBalance_, edge.exchange)
        if (result.success) {
            balance = new BigNumber(trim(result.end_balance));
        }
        else {
            error = error + result.message;
        }
        if (unused_market(edge.exchange.start_exchange, edge.exchange.market_name)) {
            error=error+" ребро находится в списке неиспользуемых маркетов, т.е. в данный момент используется | ";
        } 
        if (edge.exchange.fixed_comission !== 0)
            balance = balance.minus(trim(edge.exchange.fixed_comission));

        if (edge.exchange.percent_comission !== 0)
            balance = balance.minus((balance.multipliedBy(trim(edge.exchange.percent_comission))));
    }

    if (edge.exchanges) {  //для операции между биржами
        if (edge.exchanges.use_as_bridge_between_exchanges) {
            if (edge.exchanges.start_fixed_comission !== 0)
                balance = balance.minus(trim(edge.exchanges.start_fixed_comission));
            if (edge.exchanges.start_percent_comission !== 0)
                balance = balance.minus(balance.multipliedBy(trim(edge.exchanges.start_percent_comission)));
            if (edge.exchanges.start_min !== 0)
                if (!(edge.exchanges.start_min <= balance))
                    error = error + "ошибка минимальной суммы вывода |";
            if (edge.exchanges.start_max !== 0)
                if (!(edge.exchanges.start_max >= balance))
                    error = error + "ошибка максимальной суммы вывода |";
            if (exclude_currency(edge.exchanges.start_exchange, edge.exchanges.start_vertex_currency_common))
                error = error + "ошибка, валюта " + edge.exchanges.start_vertex_currency_common + " находится в списке исключенных |";

            if (edge.exchanges.end_fixed_comission !== 0)
                balance = balance.minus(trim(edge.exchanges.end_fixed_comission));
            if (edge.exchanges.end_percent_comission !== 0)
                balance = balance.minus(balance.multipliedBy(trim(edge.exchanges.end_percent_comission)));
            if (edge.exchanges.end_min !== 0)
                if (!(edge.exchanges.end_min <= balance))
                    error = error + "ошибка минимальной суммы ввода |";
            if (edge.exchanges.end_max !== 0)
                if (!(edge.exchanges.end_max >= balance))
                    error = error + "ошибка максимальной суммы ввода |";
            if (exclude_currency(edge.exchanges.end_exchange, edge.exchanges.end_vertex_currency_common))
                error = error + "ошибка, валюта " + edge.exchanges.start_vertex_currency_common + " находится в списке исключенных |";
        }
        else {
            error = error + "запрет использования в качестве моста |";
        }
    }

    if (error === "") { //если не обнаруженно ошибок
        return { success: true, value: trim(balance.toNumber()) }

    }
    else //если обнаруженны ошибки
    {
        return { success: false, error: error }
    }
}



/** Функция расчитывает переданные маршруты 
 * Возвращает 
 *   * [
 *  {
 *   start_balance: 120,
 *   end_balance: 123,
 *   earning: 3,
 *   route:[0,1,8,2]
 *   edges:[
 *      {
 *          exchange: {
 *          ...
 *          }
 *      },
 *      {
 *          exchanges: {
 *          ...
 *          }
 *      }
 *   ]
 *  }
 * ]
 * 
 * 
 * @param fullRoutes {array}
 * [
 *  {
 *   route:[0,1,8,2]
 *   edges:[
 *      {
 *          exchange: {
 *          ...
 *          }
 *      },
 *      {
 *          exchanges: {
 *          ...
 *          }
 *      }
 *   ]
 *  }
 * ]
 * @param unused_markets_  [{exchange: "livecoin", market: "ETH/USD"}, {exchange: "binance", market:"BTCUSDT"}]
*/
module.exports.calculate = (fullMatrix, fullRoutes, startBalance_, exclude_currencys_, unused_markets_) => {
    unused_markets=unused_markets_;
    exclude_currencys = exclude_currencys_;
    calcRoutes = [];
    var balance = 0;
    //Проходим по всем маршрутам
    for (var i = 0; i < fullRoutes.length; i++) {
        if (fullRoutes[i].edges[0].exchange && fullRoutes[i].edges[0].exchange.start_balance != 0) {

            var edges = fullRoutes[i].edges;
            balance = startBalance_;
            fullRoutes[i].start_balance = balance;
            for (var j = 0; j < edges.length; j++) {
                if (fullRoutes[i].edges[j].exchange) { //записываем начальное значение баланса на ребре
                    fullRoutes[i].edges[j].exchange.start_balance = balance;
                }
                if (fullRoutes[i].edges[j].exchanges) { //записываем начальное значение баланса на ребре
                    fullRoutes[i].edges[j].exchanges.start_balance = balance;
                }
                var result = calc_one_edge_by_market(balance, edges[j]);
                if (fullRoutes[i].edges[j].exchange) { //удаляем ордера чтобы они нас не захламляли в логах
                    delete fullRoutes[i].edges[j].exchange.orders;
                }
                if (result.success) {
                    balance = result.value;
                    if (fullRoutes[i].edges[j].exchange) { //записываем конечное значение баланса на ребре
                        fullRoutes[i].edges[j].exchange.end_balance = balance;
                        fullRoutes[i].edges[j].exchange.course = result.course;
                    }
                    if (fullRoutes[i].edges[j].exchanges) { //записываем конечное значение баланса на ребре
                        fullRoutes[i].edges[j].exchanges.end_balance = balance;
                    }
                }
                else {
                    fullRoutes[i].error = result.error;
                    //    console.log(get_log_date() + " Ошибка расчета для маршрута "+ JSON.stringify(fullRoutes[i]));
                    break;
                }
            }
            fullRoutes[i].end_balance = trim(balance);
            fullRoutes[i].earning = ((new BigNumber(trim(fullRoutes[i].end_balance))).minus(trim(fullRoutes[i].start_balance))).toNumber();
        }
        else {
            fullRoutes[i].error = "Стартовый баланс равен 0";
        }
    }


    // for () {

    // }
    return fullRoutes;
}