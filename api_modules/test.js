const querystring = require('querystring');
const request = require("request");

var start_time = Date.now();
var url = "https://api.bibox.com/v1/mdata";

var form = get_orders_query_string([{cmd: "api/depth", body: {"pair": "BIX_BTC", "size": "10"}}]);


/** Передаем массив объектов [{cmd: "api/depth", body:{pair: "", size: ""}}] */
function get_orders_query_string(arr) {
  var s = "";
  var cmds = []
  for (var i = 0; i < arr.length; i++) {
    cmds.push(arr[i]);
  }
  s = "cmds=" + JSON.stringify(cmds);
  return s;
}


request.post({
  url: url,
  proxy: "http://185.22.153.22:3128",
  form: form
},

  (error, response, body) => {
    var func_name = "get_order_book";
    if (error) {
    }
  });