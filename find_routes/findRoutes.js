var deepcopy = require("deepcopy");
var EventEmitter = require('events');
class MyEmitter extends EventEmitter { }
var myEmitter = new MyEmitter();
myEmitter.setMaxListeners(15000);
var countRec = 0;
var mass = [];
var n = 0;
var arrayRoutes = [];
var stepDepth = 0;
var startVertex = 0;
var endVertex = 0;
var end_arr_v=[];



    //Список вершин свзяанных с переданной в параметре
    function getRelatedVertex(vertex) {
        var buff = [];
        for (var i = 0; i < n; i++) {
            if (mass[i][vertex] === 1) {
                buff.push(i);
            }
        }
        return buff;
    }

    //проверядет были ли мы уже в данной вершине
    function checkStack(checkedVertex, vertexs) {
        for (var i = 0; i < vertexs.length; i++) {
            if (vertexs[i] === checkedVertex) {
                return true; //мы уже были в данной вершине
            }
        }
        return false; //мы еще не были в данной вершине
    }


    //находит в массиве end_arr_v совпадения, если есть конечная вершина то возвращает true
    function findInEndArr(id) {
       var flag=false;
         for (var i=0;i<end_arr_v.length;i++) {
             if (id===end_arr_v[i]) {
                 flag=true;
             }
         }
       return flag;
    }

    //Рекурсивная функция для прохода в глубину
    function vert(listVertex, step) {
        if (!step) {
            step = 0;
        }
        countRec++;
        var curr = listVertex[listVertex.length - 1]; //получаем последний элемент на котором сейчас находимся
        var relatedVertexs = getRelatedVertex(curr); //получаем список смежных вершин
        for (var i = 0; i < relatedVertexs.length; i++) {
            if (relatedVertexs.length > 0) {
                if (findInEndArr(relatedVertexs[i])) {
                    myEmitter.emit('action', { type: 'new_item', listVertexes: [...listVertex, relatedVertexs[i]] });
                }
                if (!findInEndArr(relatedVertexs[i]) && !checkStack(relatedVertexs[i], listVertex) && step < stepDepth) {
                    var listVertexNew = [...listVertex, relatedVertexs[i]]; //добавляем в стек новую зависимую вершину
                    step++; //увеличиваем количество шагов
                    vert(listVertexNew, step);
                }
            }
        }
        countRec--;
        if (countRec === 0) {
            myEmitter.emit('action', { type: 'end' });
        }
    }



    /** Функция для поиска маршрутов в графе с началом в  startVertex_, и концом в точках endArrayVertexes (массив конечных точек). stepDepth_ указывает на какую глубину должна уходить рекурсивная функция
     * Функция возвращает массив найденных маршрутов
     * 
    */
    module.exports.findRoutes = async (lightMatrix, startVertex_, endArrayVertexes, stepDepth_) => {
        mass = lightMatrix;
        n = lightMatrix.length;
        startVertex = startVertex_;
        listVertexes=[];
        end_arr_v=endArrayVertexes;
        stepDepth = stepDepth_;
        arrayRoutes = [];
        return new Promise((resolve, reject) => {
            myEmitter.on('action', (action) => {
                if (action.type === 'new_item') {
                    arrayRoutes.push(action.listVertexes);
                }
                if (action.type === 'end') {
                    resolve(deepcopy(arrayRoutes));
                    myEmitter.removeAllListeners('action');
                }
            });
            vert([startVertex]);
        });
    }
    return this;