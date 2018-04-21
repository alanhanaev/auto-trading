module.exports = {
	rabbit_connection_string: "amqp://login:pass@id_addr:port",
	mongodb_connection_string: "login:pass@id_addr:port/auto_trading",
    binance_api_module_address: "http://id_addr:port",
    binance_api_module_port: port,
    livecoin_api_module_address: "http://id_addr:port",
    livecoin_api_module_port: port,
    exmo_api_module_address: "http://id_addr:port",
    exmo_api_module_port: port,
    binance_api_key: "******",
    binance_secret_key: "******",
    livecoin_api_key: "******",
    livecoin_secret_key: "******",
    exmo_api_key: "******",
    exmo_secret_key: "******",
    proxy_list: [
        'http://login:pass@id_addr:port',
        'http://login:pass@id_addr:port',
        'http://login:pass@id_addr:port'
    ],
    api_modules_secret_key:"etert344343htrthgfh",
    printing_success_methods_info_interval: 90000,
    printing_success_methods_info_interval_for_binance_modules: 120000,
    update_module_currency_from_db_interval: 60000,
	telegram_bot_api_address: "http://id_addr:port"
}