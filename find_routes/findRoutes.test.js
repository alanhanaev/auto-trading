var assert = require("assert");
var findRoutes = require('./findRoutes');

function arrEq(arr1, arr2) {
    for (var i = 0; i < arr1.length; i++)
        if (arr1[i] != arr2[i])
            return false;
    return i == arr2.length;
}

function matchArrayRoutes(expectedResult, result) {
    var flag = true;
    //проходимся по эталонному массиву
    for (var i = 0; i < expectedResult.length; i++) {
        var find_route_flag = false;
        //проходимся по полученному массиву
        for (var k = 0; k < result.length; k++) {
            if (arrEq(expectedResult[i], result[k])) {
                find_route_flag = true;
            }
        }
        if (!find_route_flag) {
            console.log(i, k);
            return false;
        }
    }
    if (expectedResult.length === result.length) {
        return true;
    }
}

it("Проверяет функцию (findRoutes) которая ищет саршруты в графе с началом в указаной точке, и конце в указанных в массиве точках", async function () {

    var graph = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]
    ]
    var expectedResult = [
        [0, 1, 4, 5, 6, 8, 10],
        [0, 1, 4, 5, 6, 8, 7, 10],
        [0, 1, 4, 5, 6, 9, 7, 10]
    ];
    var result = await findRoutes.findRoutes(graph, 0, [10], 10);
    if (!matchArrayRoutes(expectedResult, result)) {
        throw new Error("Полученный и ожидаемый маршруты не совпадают")
    }





    var graph = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]
    ]
    var expectedResult = [
    ];
    var result = await findRoutes.findRoutes(graph, 10, [0], 10);
    if (!matchArrayRoutes(expectedResult, result)) {
        throw new Error("Полученный и ожидаемый маршруты не совпадают")
    }



    var graph = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]
    ]
    var expectedResult = [
        [6,9,7,3],
        [6,8,7,3],
        [6,8,10],
        [6,9,7,10],
        [6,8,7,10]
    ];
    var result = await findRoutes.findRoutes(graph, 6, [3, 10], 10);
    if (!matchArrayRoutes(expectedResult, result)) {
        throw new Error("Полученный и ожидаемый маршруты не совпадают")
    }

});