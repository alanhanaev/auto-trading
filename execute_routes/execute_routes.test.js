var assert = require("assert");
var test = require('./execute_routes');



it("Проверяет функцию (find_quantity) которая находит количество монет которое мы можем купить на определенную сумму", function () {


    var start_balance = 4200.45;
    var orders = [
        { course: 976.5, count: 3.5688, cost: 3484.9332 },
        { course: 1003.78, count: 18.445, cost: 18514.7221 }
    ]
    var expectedResult = 4.281622331586602642013190141266;
    var result = test.find_quantity(orders, start_balance);
    assert.equal(result, expectedResult);
    


    var start_balance = 4000;
    var orders = [
        { course: 1000, count: 2, cost: 2000 },
        { course: 2000, count: 1, cost: 2000 }
    ]
    var expectedResult = 3;
    var result = test.find_quantity(orders, start_balance);
    assert.equal(result, expectedResult);

});


it("Проверяет функцию (find_sum) которая находит сумму которую мы получим продав определенное количество монет", function () {

    var start_quantity = 19.3;
    var orders = [
        { course: 1003.78, count: 18.445, cost: 18514.7221 },
        { course: 976.5, count: 3.5688, cost: 3484.9332 }
    ]
    var expectedResult = 19349.6296;
    var result = test.find_sum(orders, start_quantity);
    assert.equal(result, expectedResult);
});



it("Проверяет функцию (find_increment) которая находит разницу для инкрементирования при покупке определенного количества ордеров", function () {

    //Находим среднее между первыми четырьмя курсами 
    //average_course=(1100+1200+1310+1340)/4=1237.5
    //Находим среднюю разницу между 4-мя курсами
    //1-ая разница 100
    //2-ая разница 110
    //3-ая разница 30
    //average_difference=(100+110+30)/3=80
    //Находим inc=(80/1237,5)/3=0,02154882154882154882154882154882


    var orders = [    //Ордера которые у нас есть
        { course: 1100, count: 0.2, cost: 220 },
        { course: 1200, count: 0.6, cost: 720 },
        { course: 1310, count: 0.1, cost: 131 },
        { course: 1340, count: 0.3, cost: 402 }
    ]
    var expectedResult = 0.02154882154882154882154882154882;
    var result = test.find_increment(orders, 4);
    assert.equal(result, expectedResult);
});