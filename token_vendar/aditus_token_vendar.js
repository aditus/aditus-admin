
const aditus_pgconnect = require('../common/aditus_pgconnect.js');
const aditus_queuer = require('../common/aditus_queuer.js');
const aditus_utils = require('../common/aditus_utils.js');
var config = require('../aditus_config.json');

function token_vendar() {
    
    const CONST_CONNECTION_STR = config["CONNECTION_STRING"];
    const pgconnect = aditus_pgconnect(CONST_CONNECTION_STR);
    const utils = aditus_utils(config);

    const emailNotifier = aditus_queuer(config,config["EMAIL_QUEUE_NAME"]);

    const query_db = pgconnect.query_db;
    const update_db = pgconnect.update_db;

    function _processClaim(claimId) {
        var sql = 'SELECT * FROM public.aditus_deal_claims WHERE "id" = ' + " '" + claimId + "' LIMIT 1;";
        query_db(sql,function(results) {
            if (results && results.length>0) {
                var claim = results[0];
                if (!claim.txHash) {
                    utils.transferTsp(claim.walletAddress,claim.numberOfTokens,config.TokenVendar["COINBASE_PRIVATE_KEY"],function(e,hash) {
                        if (!e) {
                           update_db(function (process, finish) {
                                var date = new Date();
                                var timestamp = date.getTime();
                                var sql = 'INSERT INTO public.aditus_vendar_log("hash","timestamp","claimId","walletAddress","status") ' + " VALUES ('" + hash + "','" + timestamp + "','" + claimId + "','" + claim.walletAddress + "','PENDING');";
                                process(sql, function () {
                                    finish();
                                });
                            }, function (result) {
                                console.log('transfering... '+claim.numberOfTokens+' to wallet#'+claim.walletAddress+ ' with tx#'+hash);
                                utils.callOnTxComplete(hash,function(res) {
                                    if (!res) {
                                        update_db(function (process, finish) {
                                            var statusUpdateSQL = 'UPDATE public.aditus_vendar_log SET "status" = '+"'FAILED'"+' WHERE "hash"='+"'"+hash+"';";
                                            process(statusUpdateSQL, function () {
                                                finish();
                                            });
                                        },function(res) {
                                            var message = 'unable to transfer '+claim.numberOfTokens+' to wallet#'+claim.walletAddress+ ' with tx#'+hash;
                                            emailNotifier.push({title: "token vendar message", message: message});
                                            console.log(message);
                                        });
                                     } else {
                                        update_db(function (process, finish) {
                                            var date = new Date();
                                            var timestamp = date.getTime();
                                            var claimUpdateSQL = 'UPDATE public.aditus_deal_claims SET "txHash" = '+"'"+hash+"'"+' WHERE "id"='+"'"+claimId+"';";
                                            process(claimUpdateSQL, function () {
                                                var statusUpdateSQL = 'UPDATE public.aditus_vendar_log SET "status" = '+"'DONE'"+' WHERE "hash"='+"'"+hash+"';";
                                                process(statusUpdateSQL, function () {
                                                    finish();
                                                });
                                            });
                                        },function(res) {
                                            var message = 'transferred '+claim.numberOfTokens+' to wallet#'+claim.walletAddress+ ' with tx#'+hash;
                                            emailNotifier.push({title: "token vendar message", message: message});
                                            console.log(message);
                                        });
                                    }
                                });
                            });
                        } else {
                            var message = 'unable to transfer '+claim.numberOfTokens+' to wallet#'+claim.walletAddress;
                            emailNotifier.push({title: "token vendar message", message: message});
                            console.log(message);
                        }
                    });
                } else {
                    console.log('claim#'+claimId+ ' has already been processed!')
                }
            } else {
                console.log('claim#'+claimId+ ' does not exist!')
            }
        });
    }

    function _startQueue() {
        var queueName = config.TokenVendar["QUEUE_NAME"];
        const queue = aditus_queuer(config, queueName);
        queue.register();
        queue.onReceive(function (claimId) {
            _processClaim(claimId);
        })
        console.log(queueName + ' LISTENING');
    }
    return {
        processClaim: _processClaim,
        startQueue: _startQueue
    }
}

var instance = token_vendar(config);
instance.startQueue();