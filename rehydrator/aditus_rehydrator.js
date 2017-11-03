
const aditus_pgconnect = require('../common/aditus_pgconnect.js');
const aditus_queuer = require('../common/aditus_queuer.js');
const aditus_utils = require('../common/aditus_utils.js');
var config = require('../aditus_config.json');

function rehydrator(config) {
    const CONST_CONNECTION_STR = config["CONNECTION_STRING"];
    const pgconnect = aditus_pgconnect(CONST_CONNECTION_STR);
    const utils = aditus_utils(config);

    var maxRehydrationLimit = config.Rehydrator["MAX_REHYDRATION_LIMIT"];
    var waitTimeInSecs = config.Rehydrator["WAITTIME_AFTER_NONADTIUS_TRANSFER_IN_SECONDS"];
    var rehydrationAmountInEth = config.Rehydrator["REHYDRATION_ETH_AMOUNT"];
    var rehydrationAmount = utils.fromEth(rehydrationAmountInEth);
    var tspContractAddress = config["TSP_CONTRACT_TOKEN"];

    var test  = (config["TEST"]) ? true :false;

    const emailNotifier = aditus_queuer(config, config["EMAIL_QUEUE_NAME"]);

    const query_db = pgconnect.query_db;
    const update_db = pgconnect.update_db;

    function _rehydrate(walletAddress) {
        var tspBalance = utils.getTspBalance(walletAddress);
        if (tspBalance<1) {
            return;
        }
    
        //check balance
        var walletBalance = utils.getWeiBalance(walletAddress);
        if (walletBalance < rehydrationAmount) {

            //check if max transaction limit has reached
            var sql = 'SELECT count(*) as cnt FROM public.aditus_rehydration_log WHERE "walletAddress"=' + "'" + walletAddress + "' AND " + ' UPPER("status")!=' + "'FAILED';";
            query_db(sql, function (results) {
                if (results[0].cnt >= maxRehydrationLimit) {
                    var message = "rehydrator MAX reached for " + walletAddress;
                    console.log(message);
                    emailNotifier.push({ title: "rehydrator message", message: message });
                    return;
                } else {
                    //check last rehydration transactions
                    var sql = 'SELECT "hash" FROM public.aditus_rehydration_log WHERE "walletAddress"=' + "'" + walletAddress + "' ORDER BY timestamp DESC LIMIT 1";
                    query_db(sql, function (results) {
                        eligible = false;
                        if (results.length > 0) {
                            var hash = results[0]["hash"];

                            var tx = utils.getTransaction(hash);
                            if (tx) {
                                if (tx.blockNumber) {
                                    console.log("last rehydration transaction is complete");
                                    eligible = true;
                                } else {
                                    console.log("last rehydration transaction is pending");
                                    eligible = false;
                                }
                            } else {
                                console.log("last rehydration transaction has been failed");
                                eligible = true;
                            }
                        } else {
                            eligible = true;
                        }

                        if (eligible) {
                            function add_test() { return (test)? '_test':''};

                            var sql = 'SELECT public.transactions'+add_test()+'.*,public.blocks'+add_test()+'.timestamp FROM public.transactions'+add_test()+' left join public.blocks'+add_test()+' on public.transactions'+add_test()+'."blockHash"=public.blocks'+add_test()+'.hash ' + ' WHERE UPPER("from") = ' + " '" + walletAddress.toUpperCase() + "' " + ' ORDER BY "blockNumber" DESC,"transactionIndex" DESC LIMIT 1;';
                            query_db(sql, function (results) {
                                if (results.length > 0) {
                                    var tx = results[0];

                                    var fTx = utils.formatTx(tx);
                                    if (fTx.contract != tspContractAddress) {
                                        var timestamp = parseInt(tx["timestamp"]);
                                        var date = new Date();
                                        var currentTimestamp = date.getTime() / 1000;
                                        var diffSecs = currentTimestamp - timestamp;

                                        if (diffSecs < waitTimeInSecs) {
                                            eligible = false;
                                        }
                                    }
                                }

                                if (eligible) {
                                    var requireMinimum = rehydrationAmount; //50000*20000000000
                                    var transferAmount = requireMinimum - walletBalance;

                                    utils.transferWei(walletAddress, transferAmount, config.Rehydrator["COINBASE_PRIVATE_KEY"], function (e, hash) {
                                        if (!e) {
                                            update_db(function (process, finish) {
                                                var date = new Date();
                                                var timestamp = date.getTime();
                                                var sql = 'INSERT INTO public.aditus_rehydration_log("hash","timestamp","amount","walletAddress","status") ' + " VALUES ('" + hash + "','" + timestamp + "','" + transferAmount + "','" + walletAddress + "','PENDING');";
                                                process(sql, function () {
                                                    finish();
                                                });
                                            }, function (result) {
                                                console.log('rehyrdating... wallet#' + walletAddress + ' with tx#' + hash + ' (' + transferAmount + ')');
                                                utils.callOnTxComplete(hash, function (res) {
                                                    if (!res) {
                                                        update_db(function (process, finish) {
                                                            var statusUpdateSQL = 'UPDATE public.aditus_rehydration_log SET "status" = ' + "'FAILED'" + ' WHERE "hash"=' + "'" + hash + "';";
                                                            process(statusUpdateSQL, function () {
                                                                finish();
                                                            });
                                                        }, function (res) {
                                                            var message = 'unable to rehydrate wallet#' + walletAddress + ' with tx#' + hash + ' (' + transferAmount + ')';
                                                            console.log(message);
                                                            emailNotifier.push({ title: "rehydrator message", message: message });
                                                        });
                                                    } else {
                                                        update_db(function (process, finish) {
                                                            var statusUpdateSQL = 'UPDATE public.aditus_rehydration_log SET "status" = ' + "'DONE'" + ' WHERE "hash"=' + "'" + hash + "';";
                                                            process(statusUpdateSQL, function () {
                                                                finish();
                                                            });
                                                        }, function (res) {
                                                            console.log('rehyrdated wallet#' + walletAddress + ' with tx#' + hash + ' (' + transferAmount + ')');
                                                        });
                                                    }
                                                });
                                            });
                                        } else {
                                            var message = 'unable to rehydrate wallet#' + walletAddress;
                                            console.log(message);
                                            console.log(e);
                                            emailNotifier.push({ title: "rehydrator message", message: message });
                                            
                                        }
                                    });
                                }
                            });
                        }
                    })
                }
            })

        }
    }

    function _startQueue() {
        var queueName = config.Rehydrator["QUEUE_NAME"];
        const queue = aditus_queuer(config, queueName);
        queue.register();
        queue.onReceive(function (wallet) {
            _rehydrate(wallet);
        })
        console.log(queueName + ' LISTENING');
    }
    return {
        rehydrate: _rehydrate,
        startQueue: _startQueue
    }
}

var instance = rehydrator(config);
instance.startQueue();